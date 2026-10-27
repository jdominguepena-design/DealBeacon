import assert from 'node:assert/strict';
import { executeParcelBatchUpsert } from '../batch-upsert';
import { NormalizedParcelRecord } from '../types';

console.log('================================================================');
console.log('  TEST SUITE: RESUMABLE INGESTION, ATOMIC CHECKPOINTS & SAFETY  ');
console.log('================================================================');

function createSampleRecord(pin: string, objectId: number, ownerName: string, mailingAddress: string, hash: string): NormalizedParcelRecord {
  return {
    parcelId: pin,
    sourceObjectId: objectId,
    address: '100 TEST ST',
    hasAuthoritativeAddress: true,
    city: 'OMAHA',
    state: 'NE',
    zip: '68102',
    ownerName,
    mailingAddress,
    mailingCity: 'OMAHA',
    mailingState: 'NE',
    mailingZip: '68102',
    isAbsentee: false,
    isOutOfState: false,
    isCorporate: false,
    absenteeStatus: 'OWNER_OCCUPIED',
    outOfStateStatus: 'IN_STATE',
    corporateStatus: 'INDIVIDUAL',
    propertyType: 'RESIDENTIAL',
    yearBuilt: 1950,
    squareFeet: 1500,
    lotSizeSqFt: 5000,
    countyClass: 'R',
    condition: 'AVERAGE',
    quality: 'AVERAGE',
    dcaAccountType: 'RES',
    legalDescription: 'LOT 1',
    assessorUrl: 'https://example.com/assessor',
    treasurerUrl: 'https://example.com/treasurer',
    latitude: 41.25,
    longitude: -95.95,
    geometryGeoJson: null,
    boundaryClassification: {
      outcome: 'INSIDE_OMAHA',
      totalVertices: 4,
      insideVertices: 4,
      outsideVertices: 0,
      centroidInsideBoundary: true,
      notes: [],
    },
    rawPropCity: 'OMAHA',
    buildingDesc: null,
    ownershipEvaluationNotes: [],
    sanitizedPayload: { PIN: pin, OBJECTID: objectId } as any,
    contentHash: hash,
  };
}

async function runTests() {
  // Test 1: Successful Batch Commit & Atomic Checkpoint Advancement
  {
    console.log('\n[Test 1] Successful batch commit advances IngestionRun progress and checkpoint atomically');
    
    let runUpdated = false;
    let recordsIngestedVal = 0;
    let savedStats: any = null;

    const mockTx: any = {
      property: {
        findMany: async () => [],
        create: async (args: any) => ({ id: `prop-${args.data.parcelId}` }),
      },
      sourceRecord: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async () => ({ id: 'src-1' }),
      },
      ownershipRecord: {
        findMany: async () => [],
        create: async () => ({ id: 'own-1', ownerName: 'OWNER A', mailingAddress: 'ADDR A' }),
      },
      ingestionRun: {
        findUnique: async () => ({
          recordsIngested: 50,
          statsJson: {
            initialTarget: 375,
            totalBatchesCommitted: 2,
          },
        }),
        update: async (args: any) => {
          runUpdated = true;
          recordsIngestedVal = args.data.recordsIngested.increment;
          savedStats = args.data.statsJson;
        },
      },
    };

    const records = [
      createSampleRecord('0100000001', 101, 'OWNER A', 'ADDR A', 'hash1'),
      createSampleRecord('0100000002', 102, 'OWNER B', 'ADDR B', 'hash2'),
    ];

    const result = await executeParcelBatchUpsert(mockTx, records, 'run-123', {
      lastProcessedObjectId: 102,
      lastProcessedPin: '0100000002',
    });

    assert.equal(result.insertedCount, 2);
    assert.equal(runUpdated, true);
    assert.equal(recordsIngestedVal, 2);
    assert.equal(savedStats.initialTarget, 375, 'Preserved existing statsJson fields');
    assert.equal(savedStats.totalBatchesCommitted, 3);
    assert.equal(savedStats.lastProcessedObjectId, 102);
    assert.equal(savedStats.lastProcessedPin, '0100000002');
    assert.ok(savedStats.lastHeartbeatAt);
    console.log('  ✔ PASS: Records and checkpoint advanced atomically; existing statsJson preserved.');
  }

  // Test 2: Rollback on Error (Both Records and Checkpoint Reverted)
  {
    console.log('\n[Test 2] Transaction failure rolls back entire batch without advancing checkpoint');

    let runUpdated = false;
    const mockTx: any = {
      property: {
        findMany: async () => [],
        create: async () => {
          throw new Error('Database disk error simulation');
        },
      },
      sourceRecord: {
        findMany: async () => [],
        findFirst: async () => null,
      },
      ownershipRecord: {
        findMany: async () => [],
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {
          runUpdated = true;
        },
      },
    };

    const records = [createSampleRecord('0100000001', 101, 'OWNER A', 'ADDR A', 'hash1')];

    await assert.rejects(
      async () => {
        await executeParcelBatchUpsert(mockTx, records, 'run-err');
      },
      /Database disk error simulation/
    );

    assert.equal(runUpdated, false, 'Checkpoint was not updated when batch failed');
    console.log('  ✔ PASS: Checkpoint update never fired after batch failure.');
  }

  // Test 3: Unchanged Source No-Op Behavior
  {
    console.log('\n[Test 3] Reprocessing identical unchanged parcel is a pure no-op');

    let propertyUpdated = false;
    let sourceCreated = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => { propertyUpdated = true; },
      },
      sourceRecord: {
        findMany: async () => [{ id: 'src-1', sourceRecordId: 'PARCEL-0100000001', rawPayloadJson: { contentHash: 'hash-identical' } }],
        findFirst: async () => ({ id: 'src-1' }), // already exists
        create: async () => { sourceCreated = true; },
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-1', propertyId: 'prop-1', ownerName: 'OWNER A', mailingAddress: 'ADDR A' }],
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const records = [createSampleRecord('0100000001', 101, 'OWNER A', 'ADDR A', 'hash-identical')];
    const result = await executeParcelBatchUpsert(mockTx, records, 'run-noop');

    assert.equal(result.insertedCount, 0);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.unchangedCount, 1);
    assert.equal(propertyUpdated, false);
    assert.equal(sourceCreated, false);
    console.log('  ✔ PASS: Idempotent no-op for identical source hash; 0 writes.');
  }

  // Test 4: Reprocessing Existing PIN with Changed Legal Titleholder
  {
    console.log('\n[Test 4] Reprocessing existing PIN with new legal owner preserves historical tenure');

    let previousOwnershipClosed = false;
    let newOwnershipCreated = false;
    let newSourceSnapshotCreated = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => {},
      },
      sourceRecord: {
        findMany: async () => [{ id: 'src-1', sourceRecordId: 'PARCEL-0100000001', rawPayloadJson: { contentHash: 'old-hash' } }],
        findFirst: async () => null, // new hash does not exist
        create: async (args: any) => {
          newSourceSnapshotCreated = true;
          assert.equal(args.data.sourceRecordId, 'PARCEL-0100000001-new-hash');
        },
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-prev', propertyId: 'prop-1', ownerName: 'OLD OWNER', mailingAddress: 'ADDR OLD' }],
        update: async (args: any) => {
          if (args.data.isCurrent === false) {
            previousOwnershipClosed = true;
          }
        },
        create: async (args: any) => {
          newOwnershipCreated = true;
          assert.equal(args.data.ownerName, 'NEW OWNER CORP');
          assert.equal(args.data.isCurrent, true);
          assert.equal(args.data.purchaseDate, null, 'Never fabricates deed purchase date');
          return { id: 'own-new', ownerName: args.data.ownerName, mailingAddress: args.data.mailingAddress };
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const records = [createSampleRecord('0100000001', 101, 'NEW OWNER CORP', 'ADDR NEW', 'new-hash')];
    const result = await executeParcelBatchUpsert(mockTx, records, 'run-title-change');

    assert.equal(result.updatedCount, 1);
    assert.equal(previousOwnershipClosed, true);
    assert.equal(newOwnershipCreated, true);
    assert.equal(newSourceSnapshotCreated, true);
    console.log('  ✔ PASS: Title change closed old ownership, created new tenure, and added immutable versioned snapshot.');
  }

  // Test 5: Reprocessing Existing PIN with ONLY Mailing Address Change
  {
    console.log('\n[Test 5] Reprocessing existing PIN with only mailing address change updates in-place without closing tenure');

    let ownershipUpdatedInPlace = false;
    let ownershipClosed = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => {},
      },
      sourceRecord: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async () => {},
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-current', propertyId: 'prop-1', ownerName: 'SAME OWNER', mailingAddress: 'OLD PO BOX 1' }],
        update: async (args: any) => {
          if (args.data.isCurrent === false) {
            ownershipClosed = true;
          } else if (args.data.mailingAddress === 'NEW PO BOX 99') {
            ownershipUpdatedInPlace = true;
          }
        },
        create: async () => {
          throw new Error('Should not create new ownership record for mailing address change!');
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const records = [createSampleRecord('0100000001', 101, 'SAME OWNER', 'NEW PO BOX 99', 'mail-hash')];
    await executeParcelBatchUpsert(mockTx, records, 'run-mail-change');

    assert.equal(ownershipClosed, false, 'Tenure must NOT be closed for mailing address change');
    assert.equal(ownershipUpdatedInPlace, true);
    console.log('  ✔ PASS: Mailing address change updated in place; tenure remained open.');
  }

  // Test 6: Database Advisory Lock Concurrency Protection
  {
    console.log('\n[Test 6] Database advisory lock prevents parallel overlapping import runs');

    const { acquireIngestionAdvisoryLock, releaseIngestionAdvisoryLock } = await import('../../coordinator');

    // Simulate mock prisma where pg_try_advisory_lock returns false for second caller
    const mockPrismaLocked: any = {
      $queryRaw: async () => [{ pg_try_advisory_lock: false }],
    };

    const lockResult = await acquireIngestionAdvisoryLock(mockPrismaLocked, 'DOUGLAS_COUNTY_ASSESSOR');
    assert.equal(lockResult.acquired, false);
    assert.ok(lockResult.reason?.includes('Another active process holds'));

    const mockPrismaUnlocked: any = {
      $queryRaw: async () => [{ pg_try_advisory_lock: true }],
    };
    const acquiredResult = await acquireIngestionAdvisoryLock(mockPrismaUnlocked, 'DOUGLAS_COUNTY_ASSESSOR');
    assert.equal(acquiredResult.acquired, true);

    console.log('  ✔ PASS: Advisory lock blocks concurrent executions and gracefully reports active hold.');
  }

  // Test 7: Unchanged Source Snapshot But Missing Canonical Ownership -> Repairs Relationship
  {
    console.log('\n[Test 7] Unchanged source hash but missing canonical ownership record performs necessary repair');

    let createdOwnershipRecord = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => {},
      },
      sourceRecord: {
        findMany: async () => [{ id: 'src-1', sourceRecordId: 'PARCEL-0100000001', rawPayloadJson: { contentHash: 'hash-identical' } }],
        findFirst: async () => ({ id: 'src-1' }),
        create: async () => {},
      },
      ownershipRecord: {
        findMany: async () => [], // Missing current ownership!
        create: async (args: any) => {
          createdOwnershipRecord = true;
          assert.equal(args.data.propertyId, 'prop-1');
          assert.equal(args.data.ownerName, 'OWNER A');
          return { id: 'own-repaired', ownerName: 'OWNER A', mailingAddress: 'ADDR A' };
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const records = [createSampleRecord('0100000001', 101, 'OWNER A', 'ADDR A', 'hash-identical')];
    const result = await executeParcelBatchUpsert(mockTx, records, 'run-repair');

    assert.equal(createdOwnershipRecord, true, 'Repaired missing ownership record despite unchanged source hash');
    assert.equal(result.unchangedCount, 0, 'Did not incorrectly skip repair as unchanged no-op');
    console.log('  ✔ PASS: Repaired missing canonical relationship even when source hash was identical.');
  }

  // Test 8: Resume Across Separate Invocations Using Stored Checkpoint
  {
    console.log('\n[Test 8] Checkpoint inspection resumes accurately from previous IngestionRun cursor');

    const { getLatestIngestionCheckpoint } = await import('../../coordinator');

    const mockPrisma: any = {
      ingestionRun: {
        findFirst: async () => ({
          id: 'run-prior-batch',
          status: 'PARTIAL',
          recordsIngested: 200,
          statsJson: {
            lastProcessedObjectId: 5042,
            lastProcessedPin: '0459820000',
            totalBatchesCommitted: 8,
            mode: 'INCREMENTAL_RESUME',
          },
        }),
      },
    };

    const res = await getLatestIngestionCheckpoint(mockPrisma, 'DOUGLAS_COUNTY_ASSESSOR');
    assert.equal(res.runId, 'run-prior-batch');
    assert.equal(res.status, 'PARTIAL');
    assert.equal(res.checkpoint?.lastProcessedObjectId, 5042);
    assert.equal(res.checkpoint?.lastProcessedPin, '0459820000');
    assert.equal(res.checkpoint?.totalBatchesCommitted, 8);

    console.log('  ✔ PASS: Successfully extracted durable cursor and stats for resume across separate invocations.');
  }

  console.log('\n================================================================');
  console.log('      ALL 8 AUTOMATED TESTS PASSED WITH 0 ERRORS                ');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n[TEST RUNNER FAILURE]:', err);
  process.exit(1);
});
