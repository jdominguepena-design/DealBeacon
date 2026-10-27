import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../../../neon-preflight';
import { executeParcelBatchUpsert, BatchTimingMetrics } from '../batch-upsert';
import { NormalizedParcelRecord } from '../types';

try {
  process.loadEnvFile('.env');
} catch {}

verifyNeonDevEndpoints();
const prisma = new PrismaClient();

console.log('========================================================================');
console.log('  TEST SUITE: BULK INSERT OPTIMIZATION & INVARIANT INTEGRITY TESTS     ');
console.log('========================================================================\n');

function makeFixture(id: number, overrides: Partial<NormalizedParcelRecord> = {}): NormalizedParcelRecord {
  const pin = `TESTBULK${String(id).padStart(6, '0')}`;
  return {
    parcelId: pin,
    sourceObjectId: 995000 + id,
    address: `${2000 + id} N BULK OPT ST`,
    hasAuthoritativeAddress: true,
    city: 'OMAHA',
    rawPropCity: 'OMAHA',
    state: 'NE',
    zip: '68110',
    propertyType: 'SINGLE_FAMILY',
    countyClass: 'R',
    buildingDesc: 'Single Family Residence',
    yearBuilt: 1995,
    squareFeet: 1650,
    lotSizeSqFt: 6500,
    condition: 'GOOD',
    quality: 'B',
    dcaAccountType: 'RESIDENTIAL',
    legalDescription: `BULK TEST LOT ${id}`,
    assessorUrl: `https://assessor.douglascounty-ne.gov/test/${pin}`,
    treasurerUrl: `https://treasurer.douglascounty-ne.gov/test/${pin}`,
    latitude: 41.28,
    longitude: -95.96,
    geometryGeoJson: null,
    ownerName: `TEST INVESTOR ${id} LLC`,
    mailingAddress: `${2000 + id} N BULK OPT ST`,
    mailingCity: 'OMAHA',
    mailingState: 'NE',
    mailingZip: '68110',
    absenteeStatus: 'OWNER_OCCUPIED',
    isAbsentee: false,
    outOfStateStatus: 'IN_STATE',
    isOutOfState: false,
    corporateStatus: 'PROBABLE_CORPORATE_NAME',
    isCorporate: true,
    ownershipEvaluationNotes: ['Bulk Optimization Test Fixture'],
    boundaryClassification: {
      outcome: 'INSIDE_OMAHA',
      totalVertices: 4,
      insideVertices: 4,
      outsideVertices: 0,
      centroidInsideBoundary: true,
      notes: ['Inside Omaha boundary test'],
    },
    contentHash: `bulk-hash-${id}`,
    sanitizedPayload: {
      OBJECTID: 995000 + id,
      PIN: pin,
      PROPERTY_A: `${2000 + id} N BULK OPT ST`,
      PROP_CITY: 'OMAHA',
      PROP_ZIP: '68110',
      OWNER_NAME: `TEST INVESTOR ${id} LLC`,
      ADDRESS1: `${2000 + id} N BULK OPT ST`,
      OWNER_CITY: 'OMAHA',
      OWNER_STAT: 'NE',
      OWNER_ZIP: '68110',
      CLASS: 'R',
    },
    ...overrides,
  };
}

async function runBulkOptimizationTests() {
  const initialPropCount = await prisma.property.count();
  const initialOwnCount = await prisma.ownershipRecord.count();
  const initialSrcCount = await prisma.sourceRecord.count();
  const initialRunsCount = await prisma.ingestionRun.count();

  // Test 1: 25 new properties inserted atomically with BULK_EXPERIMENTAL strategy
  {
    console.log('[Test 1] 25 new properties inserted atomically using BULK_EXPERIMENTAL createMany...');
    const batch = Array.from({ length: 25 }, (_, i) => makeFixture(100 + i));
    let capturedTiming: BatchTimingMetrics | undefined;

    await prisma.$transaction(async (tx) => {
      const res = await executeParcelBatchUpsert(tx, batch, 'run-bulk-25', {
        executionStrategy: 'BULK_EXPERIMENTAL',
        onTiming: (t) => {
          capturedTiming = t;
        },
      });

      assert.equal(res.insertedCount, 25, 'Expected 25 insertions');
      assert.equal(res.updatedCount, 0);
      assert.equal(res.unchangedCount, 0);
      assert.equal(res.failedCount, 0);

      // Verify records are visible inside transaction
      const propCount = await tx.property.count({
        where: { parcelId: { in: batch.map((r) => r.parcelId) } },
      });
      assert.equal(propCount, 25, '25 Property records exist');

      const ownCount = await tx.ownershipRecord.count({
        where: { ownerName: { startsWith: 'TEST INVESTOR' } },
      });
      assert.equal(ownCount, 25, '25 OwnershipRecord records exist');

      const srcCount = await tx.sourceRecord.count({
        where: { sourceRecordId: { in: batch.map((r) => `PARCEL-${r.parcelId}-${r.contentHash}`) } },
      });
      assert.equal(srcCount, 25, '25 SourceRecord records exist');

      assert.ok(capturedTiming, 'Timing metrics must be captured');
      assert.equal(capturedTiming?.strategyUsed, 'BULK_EXPERIMENTAL');

      throw new Error('ROLLBACK_TEST_1');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_1') throw err;
    });

    console.log('  ✔ PASS: 25 new properties, ownerships, and sources created atomically with correct foreign keys.');
  }

  // Test 2: Mixed batch containing both new and existing properties
  {
    console.log('\n[Test 2] Mixed batch containing new and existing properties handled safely...');
    const existingFixture = makeFixture(200);
    const newFixture = makeFixture(201);

    await prisma.$transaction(async (tx) => {
      // First insert existingFixture via sequential
      await executeParcelBatchUpsert(tx, [existingFixture], 'run-bulk-mixed-seed');

      // Now run mixed batch under BULK_EXPERIMENTAL
      const mixedBatch = [existingFixture, newFixture];
      const res = await executeParcelBatchUpsert(tx, mixedBatch, 'run-bulk-mixed', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      assert.equal(res.unchangedCount, 1, 'Existing identical record detected as unchanged');
      assert.equal(res.insertedCount, 1, 'New record inserted via bulk path');

      throw new Error('ROLLBACK_TEST_2');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_2') throw err;
    });

    console.log('  ✔ PASS: Mixed batch partitioned correctly between unchanged/fallback and bulk insert.');
  }

  // Test 3: Matching existing versioned source snapshots (no duplicates created)
  {
    console.log('\n[Test 3] Matching existing versioned source snapshots detects unchanged records idempotently...');
    const fixture = makeFixture(300);

    await prisma.$transaction(async (tx) => {
      const res1 = await executeParcelBatchUpsert(tx, [fixture], 'run-bulk-vsrc', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });
      assert.equal(res1.insertedCount, 1);

      // Re-run the exact same record
      const res2 = await executeParcelBatchUpsert(tx, [fixture], 'run-bulk-vsrc-rerun', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });
      assert.equal(res2.unchangedCount, 1, 'Re-run detected as unchanged');
      assert.equal(res2.insertedCount, 0);

      throw new Error('ROLLBACK_TEST_3');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_3') throw err;
    });

    console.log('  ✔ PASS: Versioned source snapshot matched and prevented redundant inserts.');
  }

  // Test 4: Changed ownership creates new tenure and closes prior tenure
  {
    console.log('\n[Test 4] Changed ownership creates new current record and sets previous to false...');
    const initialFixture = makeFixture(400, { ownerName: 'ORIGINAL OWNER LLC' });
    const updatedFixture = makeFixture(400, { ownerName: 'NEW BUYER CORP' });

    await prisma.$transaction(async (tx) => {
      await executeParcelBatchUpsert(tx, [initialFixture], 'run-bulk-own-1', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      const res2 = await executeParcelBatchUpsert(tx, [updatedFixture], 'run-bulk-own-2', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      assert.equal(res2.updatedCount, 1);

      const prop = await tx.property.findUnique({
        where: { parcelId: initialFixture.parcelId },
        include: { ownershipRecords: true },
      });

      assert.equal(prop?.ownershipRecords.length, 2, 'Two ownership records in tenure chain');
      const current = prop?.ownershipRecords.find((o) => o.isCurrent);
      const prior = prop?.ownershipRecords.find((o) => !o.isCurrent);
      assert.equal(current?.ownerName, 'NEW BUYER CORP');
      assert.equal(prior?.ownerName, 'ORIGINAL OWNER LLC');

      throw new Error('ROLLBACK_TEST_4');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_4') throw err;
    });

    console.log('  ✔ PASS: Ownership tenure succession preserved under BULK_EXPERIMENTAL fallback.');
  }

  // Test 5: Changed assessor content hash creates new versioned SourceRecord
  {
    console.log('\n[Test 5] Changed assessor content hash appends new versioned SourceRecord...');
    const fixture1 = makeFixture(500, { contentHash: 'hash-v1', condition: 'FAIR' });
    const fixture2 = makeFixture(500, { contentHash: 'hash-v2', condition: 'EXCELLENT' });

    await prisma.$transaction(async (tx) => {
      await executeParcelBatchUpsert(tx, [fixture1], 'run-bulk-hash-1', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      await executeParcelBatchUpsert(tx, [fixture2], 'run-bulk-hash-2', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      const sources = await tx.sourceRecord.findMany({
        where: { sourceRecordId: { startsWith: `PARCEL-${fixture1.parcelId}` } },
      });
      assert.equal(sources.length, 2, 'Two versioned source records appended');

      throw new Error('ROLLBACK_TEST_5');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_5') throw err;
    });

    console.log('  ✔ PASS: Content hash transition created append-only source snapshot.');
  }

  // Test 6: Historical quarantined source records preserved without corruption
  {
    console.log('\n[Test 6] Historical quarantined source records preserved intact...');
    const fixture = makeFixture(600);
    const legacyRecId = `PARCEL-${fixture.parcelId}`;

    await prisma.$transaction(async (tx) => {
      // Seed quarantined legacy record
      await tx.sourceRecord.create({
        data: {
          sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
          sourceRecordId: legacyRecId,
          matchedStatus: 'QUARANTINED',
          rawPayloadJson: { error: 'Crosses municipal line', contentHash: 'old-hash' },
        },
      });

      // Import valid parcel under BULK_EXPERIMENTAL
      await executeParcelBatchUpsert(tx, [fixture], 'run-bulk-quarantine-preserve', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      const legacySource = await tx.sourceRecord.findUnique({
        where: {
          sourceName_sourceRecordId: {
            sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
            sourceRecordId: legacyRecId,
          },
        },
      });
      assert.equal(legacySource?.matchedStatus, 'QUARANTINED', 'Quarantined record remained untouched');

      const versionedSource = await tx.sourceRecord.findUnique({
        where: {
          sourceName_sourceRecordId: {
            sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
            sourceRecordId: `PARCEL-${fixture.parcelId}-${fixture.contentHash}`,
          },
        },
      });
      assert.equal(versionedSource?.matchedStatus, 'MATCHED', 'New versioned record created as MATCHED');

      throw new Error('ROLLBACK_TEST_6');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_6') throw err;
    });

    console.log('  ✔ PASS: Historical quarantined record preserved intact; new versioned snapshot created.');
  }

  // Test 7: Cross-property source conflict detection throws and aborts
  {
    console.log('\n[Test 7] Cross-property source conflict detection throws integrity error...');
    const fixtureA = makeFixture(701);
    const fixtureB = makeFixture(702);
    // Deliberately share versioned source ID across different PINs to simulate cross-property collision
    const conflictingVersionedId = `PARCEL-${fixtureA.parcelId}-${fixtureA.contentHash}`;

    await prisma.$transaction(async (tx) => {
      // Insert Property A
      await executeParcelBatchUpsert(tx, [fixtureA], 'run-bulk-conflict-seed', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      // Deliberately set legacy source ID or conflicting candidate source ID to point to Property A's source record
      const malformedB = { ...fixtureB, parcelId: fixtureA.parcelId }; // Same PIN as Property A, but with different content
      // Or test when a source record with PARCEL-B is already assigned to Property A
      await tx.sourceRecord.create({
        data: {
          sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
          sourceRecordId: `PARCEL-${fixtureB.parcelId}-${fixtureB.contentHash}`,
          rawPayloadJson: fixtureB.sanitizedPayload as any,
          propertyId: (await tx.property.findUnique({ where: { parcelId: fixtureA.parcelId } }))!.id,
          matchedStatus: 'MATCHED',
        },
      });

      let conflictThrown = false;
      try {
        await executeParcelBatchUpsert(tx, [fixtureB], 'run-bulk-conflict-test', {
          executionStrategy: 'BULK_EXPERIMENTAL',
        });
      } catch (err: any) {
        if (err.message.includes('Integrity conflict') || err.message.includes('already linked')) {
          conflictThrown = true;
        }
      }

      assert.ok(conflictThrown, 'Cross-property conflict must throw integrity error');
      throw new Error('ROLLBACK_TEST_7');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_7') throw err;
    });

    console.log('  ✔ PASS: Cross-property source collision detected and rejected cleanly.');
  }

  // Test 8: Mid-batch failure and full transactional rollback
  {
    console.log('\n[Test 8] Mid-batch failure triggers 100% clean rollback with 0 leaked records...');
    const validBatch = Array.from({ length: 10 }, (_, i) => makeFixture(800 + i));
    const invalidItem = makeFixture(810, { parcelId: null as any }); // Triggers validation error
    const testBatch = [...validBatch, invalidItem];

    let rollbackObserved = false;
    try {
      await executeParcelBatchUpsert(prisma, testBatch, 'run-bulk-fail-mid', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });
    } catch {
      rollbackObserved = true;
    }

    assert.ok(rollbackObserved, 'Transaction must throw and roll back');
    const leakedPropCount = await prisma.property.count({
      where: { parcelId: { in: validBatch.map((r) => r.parcelId) } },
    });
    assert.equal(leakedPropCount, 0, 'Zero properties committed on mid-batch failure');

    console.log('  ✔ PASS: Mid-batch failure rolled back 100% cleanly without leaking any rows.');
  }

  // Test 9: Re-running the same batch without duplicate records
  {
    console.log('\n[Test 9] Re-running exact same 25-record batch produces zero duplicate records...');
    const batch = Array.from({ length: 25 }, (_, i) => makeFixture(900 + i));

    await prisma.$transaction(async (tx) => {
      const firstRun = await executeParcelBatchUpsert(tx, batch, 'run-bulk-rerun-1', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });
      assert.equal(firstRun.insertedCount, 25);

      const secondRun = await executeParcelBatchUpsert(tx, batch, 'run-bulk-rerun-2', {
        executionStrategy: 'BULK_EXPERIMENTAL',
      });
      assert.equal(secondRun.unchangedCount, 25);
      assert.equal(secondRun.insertedCount, 0);

      const totalProps = await tx.property.count({
        where: { parcelId: { in: batch.map((r) => r.parcelId) } },
      });
      assert.equal(totalProps, 25, 'Strictly 25 properties in database (no duplicates)');

      throw new Error('ROLLBACK_TEST_9');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_TEST_9') throw err;
    });

    console.log('  ✔ PASS: Re-running batch is completely idempotent; zero duplicates created.');
  }

  // Test 10: Checkpoint advancement only after successful commit
  {
    console.log('\n[Test 10] Checkpoint advances only after successful transaction commit...');
    const testRunId = 'run-bulk-chkpt-test';

    await prisma.ingestionRun.create({
      data: {
        id: testRunId,
        sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
        status: 'RUNNING',
        statsJson: { lastProcessedObjectId: 1000 },
      },
    });

    try {
      const batch = [makeFixture(950)];
      await executeParcelBatchUpsert(prisma, batch, testRunId, {
        lastProcessedObjectId: 995950,
        lastProcessedPin: batch[0].parcelId,
        executionStrategy: 'BULK_EXPERIMENTAL',
      });

      const updatedRun = await prisma.ingestionRun.findUnique({
        where: { id: testRunId },
      });
      const stats = updatedRun?.statsJson as Record<string, any>;
      assert.equal(stats.lastProcessedObjectId, 995950, 'Checkpoint advanced to 995950 on commit');

      // Clean up test records
      await prisma.property.deleteMany({ where: { parcelId: batch[0].parcelId } });
      await prisma.sourceRecord.deleteMany({ where: { sourceRecordId: `PARCEL-${batch[0].parcelId}-${batch[0].contentHash}` } });
    } finally {
      await prisma.ingestionRun.delete({ where: { id: testRunId } });
    }

    console.log('  ✔ PASS: Durable checkpoint updated atomically with batch commit.');
  }

  // Verify baseline invariants
  const finalPropCount = await prisma.property.count();
  const finalOwnCount = await prisma.ownershipRecord.count();
  const finalSrcCount = await prisma.sourceRecord.count();
  const finalRunsCount = await prisma.ingestionRun.count();

  assert.equal(finalPropCount, initialPropCount, 'Zero leaked properties');
  assert.equal(finalOwnCount, initialOwnCount, 'Zero leaked ownership records');
  assert.equal(finalSrcCount, initialSrcCount, 'Zero leaked source records');
  assert.equal(finalRunsCount, initialRunsCount, 'Zero leaked ingestion runs');

  console.log('\n✔ ALL 10 BULK-INSERT OPTIMIZATION & INVARIANT INTEGRITY TESTS PASSED (0 ERRORS)\n');
}

runBulkOptimizationTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
