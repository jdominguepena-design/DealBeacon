import assert from 'node:assert/strict';
import { executeParcelBatchUpsert } from '../batch-upsert';
import { NormalizedParcelRecord } from '../types';

console.log('========================================================================');
console.log('  TEST SUITE: SOURCERECORD PROVENANCE LINKING & QUARANTINE PRESERVATION  ');
console.log('========================================================================');

function createSampleRecord(pin: string, objectId: number, hash: string): NormalizedParcelRecord {
  return {
    parcelId: pin,
    sourceObjectId: objectId,
    address: '100 PROVENANCE WAY',
    hasAuthoritativeAddress: true,
    city: 'OMAHA',
    state: 'NE',
    zip: '68102',
    rawPropCity: 'OMAHA',
    buildingDesc: null,
    ownershipEvaluationNotes: [],
    ownerName: 'PROVENANCE OWNER LLC',
    mailingAddress: '100 PROVENANCE WAY',
    mailingCity: 'OMAHA',
    mailingState: 'NE',
    mailingZip: '68102',
    isAbsentee: false,
    isOutOfState: false,
    isCorporate: true,
    absenteeStatus: 'OWNER_OCCUPIED',
    outOfStateStatus: 'IN_STATE',
    corporateStatus: 'PROBABLE_CORPORATE_NAME',
    propertyType: 'RESIDENTIAL',
    yearBuilt: 2000,
    squareFeet: 2000,
    lotSizeSqFt: 6000,
    countyClass: 'R',
    condition: 'GOOD',
    quality: 'GOOD',
    dcaAccountType: 'RES',
    legalDescription: 'LOT 1',
    assessorUrl: 'https://example.com/assessor',
    treasurerUrl: 'https://example.com/treasurer',
    latitude: 41.25,
    longitude: -95.95,
    geometryGeoJson: null,
    boundaryClassification: {
      outcome: 'CROSSES_BOUNDARY',
      totalVertices: 8,
      insideVertices: 4,
      outsideVertices: 4,
      centroidInsideBoundary: true,
      notes: ['CROSSES_BOUNDARY'],
    },
    sanitizedPayload: { PIN: pin, OBJECTID: objectId } as any,
    contentHash: hash,
  };
}

async function runProvenanceRegressionTests() {
  // Regression 1: Newly inserted property with pre-existing unlinked QUARANTINED source record
  // Preserves quarantine record intact and creates new versioned MATCHED snapshot linked to property.
  {
    console.log('\n[Regression 1] Newly inserted property with unlinked QUARANTINED source record');
    let createdVersionedSnapshot = false;
    let mutatedQuarantineRecord = false;

    const mockTx: any = {
      property: {
        findMany: async () => [], // Property does not exist yet (insert)
        create: async (args: any) => ({ id: 'prop-new-1', parcelId: args.data.parcelId }),
      },
      ownershipRecord: {
        findMany: async () => [],
        create: async () => ({ id: 'own-1', ownerName: 'PROVENANCE OWNER LLC' }),
      },
      sourceRecord: {
        findMany: async () => [],
        findUnique: async (args: any) => {
          const recId = args.where?.sourceName_sourceRecordId?.sourceRecordId;
          if (recId === 'PARCEL-0129740003-hash1') {
            return null; // versioned does not exist yet
          }
          if (recId === 'PARCEL-0129740003') {
            // Unlinked historical quarantined record
            return {
              id: 'src-legacy-quarantined',
              propertyId: null,
              matchedStatus: 'QUARANTINED',
              rawPayloadJson: { contentHash: 'hash1' },
            };
          }
          return null;
        },
        create: async (args: any) => {
          createdVersionedSnapshot = true;
          assert.equal(args.data.sourceRecordId, 'PARCEL-0129740003-hash1');
          assert.equal(args.data.propertyId, 'prop-new-1');
          assert.equal(args.data.matchedStatus, 'MATCHED');
          return { id: 'src-new-versioned' };
        },
        update: async () => {
          mutatedQuarantineRecord = true;
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0129740003', 190, 'hash1');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-1');

    assert.equal(res.insertedCount, 1);
    assert.equal(createdVersionedSnapshot, true, 'Created new versioned MATCHED snapshot for property');
    assert.equal(mutatedQuarantineRecord, false, 'Did not mutate or overwrite original quarantine evidence');
    console.log('  ✔ PASS: Created versioned MATCHED snapshot; preserved historical quarantine record intact.');
  }

  // Regression 2: Repeated import of the same parcel (Idempotency)
  // Second import detects identical hash, finds existing versioned source, and makes 0 writes.
  {
    console.log('\n[Regression 2] Repeated import of the same parcel (Idempotency)');
    let sourceCreated = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0129740003' }],
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-1', propertyId: 'prop-1', ownerName: 'PROVENANCE OWNER LLC', mailingAddress: '100 PROVENANCE WAY' }],
      },
      sourceRecord: {
        findMany: async () => [{ id: 'src-1', sourceRecordId: 'PARCEL-0129740003', rawPayloadJson: { contentHash: 'hash1' } }],
        findUnique: async () => ({ id: 'src-1', propertyId: 'prop-1' }),
        create: async () => { sourceCreated = true; },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0129740003', 190, 'hash1');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-2');

    assert.equal(res.unchangedCount, 1);
    assert.equal(sourceCreated, false);
    console.log('  ✔ PASS: Repeated import treated as pure no-op; 0 duplicate snapshots.');
  }

  // Regression 3: Matching source record linked to another property triggers integrity conflict
  {
    console.log('\n[Regression 3] Matching source record belongs to another property (Conflict Guard)');
    let conflictThrown = false;

    const mockTx: any = {
      property: {
        findMany: async () => [],
        create: async () => ({ id: 'prop-new-2' }),
      },
      ownershipRecord: {
        findMany: async () => [],
        create: async () => ({ id: 'own-2' }),
      },
      sourceRecord: {
        findMany: async () => [],
        findUnique: async (args: any) => {
          const recId = args.where?.sourceName_sourceRecordId?.sourceRecordId;
          if (recId?.includes('hash1')) {
            // Already linked to completely different property!
            return { id: 'src-existing', propertyId: 'prop-other-999' };
          }
          return null;
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0129740003', 190, 'hash1');
    try {
      await executeParcelBatchUpsert(mockTx, [record], 'run-test-3');
    } catch (err: any) {
      if (err.message.includes('Integrity conflict')) {
        conflictThrown = true;
      }
    }

    assert.equal(conflictThrown, true, 'Integrity conflict error thrown on cross-property linking');
    console.log('  ✔ PASS: Refused to relink conflicting source record; threw integrity conflict.');
  }

  // Regression 4: Existing property with valid linked source record
  {
    console.log('\n[Regression 4] Existing property with valid linked source record');
    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-1', propertyId: 'prop-1', ownerName: 'PROVENANCE OWNER LLC', mailingAddress: '100 PROVENANCE WAY' }],
      },
      sourceRecord: {
        findMany: async () => [{ id: 'src-1', sourceRecordId: 'PARCEL-0100000001', rawPayloadJson: { contentHash: 'hash-linked' } }],
        findUnique: async () => ({ id: 'src-1', propertyId: 'prop-1' }),
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0100000001', 101, 'hash-linked');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-4');

    assert.equal(res.unchangedCount, 1);
    console.log('  ✔ PASS: Existing property with linked provenance verified as unchanged.');
  }

  // Regression 5: Existing tax-lien property with matching versioned source snapshot (Fix for Stage 3/4/5 update inflation)
  {
    console.log('\n[Regression 5] Existing tax-lien property with matching versioned source is TRUE NO-OP');
    let propertyUpdated = false;
    let sourceCreated = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-tl-1', parcelId: '0425950000' }],
        update: async () => { propertyUpdated = true; },
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-tl-1', propertyId: 'prop-tl-1', ownerName: 'PROVENANCE OWNER LLC', mailingAddress: '100 PROVENANCE WAY' }],
      },
      sourceRecord: {
        findMany: async () => [
          {
            id: 'src-tl-1',
            sourceRecordId: 'PARCEL-0425950000-hashTL',
            propertyId: 'prop-tl-1',
            matchedStatus: 'MATCHED',
            rawPayloadJson: { contentHash: 'hashTL' },
          },
        ],
        create: async () => { sourceCreated = true; },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0425950000', 500, 'hashTL');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-5');

    assert.equal(res.unchangedCount, 1, 'Expected unchangedCount to be 1');
    assert.equal(res.updatedCount, 0, 'Expected updatedCount to be 0 (no false update)');
    assert.equal(propertyUpdated, false, 'Property was not unnecessarily updated');
    assert.equal(sourceCreated, false, 'No duplicate source record created');
    console.log('  ✔ PASS: Pre-existing tax-lien parcel recognized as true no-op (0 writes, 0 false updates).');
  }

  // Regression 6: Existing property with changed source hash creates new versioned snapshot
  {
    console.log('\n[Regression 6] Existing property with changed source hash appends new versioned snapshot');
    let propertyUpdated = false;
    let createdVersionedId = '';

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => { propertyUpdated = true; },
      },
      ownershipRecord: {
        findMany: async () => [{ id: 'own-1', propertyId: 'prop-1', ownerName: 'PROVENANCE OWNER LLC', mailingAddress: '100 PROVENANCE WAY' }],
        update: async () => {},
      },
      sourceRecord: {
        findMany: async () => [
          {
            id: 'src-old',
            sourceRecordId: 'PARCEL-0100000001-oldHash',
            propertyId: 'prop-1',
            matchedStatus: 'MATCHED',
            rawPayloadJson: { contentHash: 'oldHash' },
          },
        ],
        create: async (args: any) => {
          createdVersionedId = args.data.sourceRecordId;
          return { id: 'src-new' };
        },
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0100000001', 101, 'newHash123');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-6');

    assert.equal(res.updatedCount, 1, 'Expected property to be updated');
    assert.equal(propertyUpdated, true, 'Property attributes were updated');
    assert.equal(createdVersionedId, 'PARCEL-0100000001-newHash123', 'Appended new versioned source snapshot');
    console.log('  ✔ PASS: Changed content hash appended new versioned source snapshot and updated property.');
  }

  // Regression 7: Ownership titleholder change properly closes prior tenure and creates new tenure
  {
    console.log('\n[Regression 7] Ownership change closes prior tenure and creates new current tenure');
    let priorTenureClosed = false;
    let newTenureCreated = false;

    const mockTx: any = {
      property: {
        findMany: async () => [{ id: 'prop-1', parcelId: '0100000001' }],
        update: async () => {},
      },
      ownershipRecord: {
        findMany: async () => [
          { id: 'own-prior', propertyId: 'prop-1', ownerName: 'PREVIOUS OWNER', mailingAddress: '100 OLD WAY' },
        ],
        update: async (args: any) => {
          if (args.where?.id === 'own-prior' && args.data?.isCurrent === false) {
            priorTenureClosed = true;
          }
        },
        create: async (args: any) => {
          if (args.data?.isCurrent === true && args.data?.ownerName === 'PROVENANCE OWNER LLC') {
            newTenureCreated = true;
          }
          return { id: 'own-new', ownerName: args.data.ownerName, mailingAddress: args.data.mailingAddress };
        },
      },
      sourceRecord: {
        findMany: async () => [],
        create: async () => ({ id: 'src-new' }),
      },
      ingestionRun: {
        findUnique: async () => ({ recordsIngested: 0, statsJson: {} }),
        update: async () => {},
      },
    };

    const record = createSampleRecord('0100000001', 101, 'newOwnerHash');
    const res = await executeParcelBatchUpsert(mockTx, [record], 'run-test-7');

    assert.equal(res.updatedCount, 1);
    assert.equal(priorTenureClosed, true, 'Prior ownership tenure closed (isCurrent=false)');
    assert.equal(newTenureCreated, true, 'New ownership tenure created (isCurrent=true)');
    console.log('  ✔ PASS: Legal titleholder transition correctly closed prior tenure and created new tenure.');
  }

  console.log('\n========================================================================');
  console.log('  ALL 7 PROVENANCE & IDEMPOTENCY REGRESSION TESTS PASSED (0 ERRORS) ✔   ');
  console.log('========================================================================');
}

runProvenanceRegressionTests().catch((err) => {
  console.error('\n✖ Regression test failed:', err);
  process.exit(1);
});
