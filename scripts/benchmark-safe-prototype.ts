import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { executeParcelBatchUpsert, executeQuarantineBatch } from '../src/lib/ingestion/douglas-parcel/batch-upsert';
import { NormalizedParcelRecord } from '../src/lib/ingestion/douglas-parcel/types';

try {
  process.loadEnvFile('.env');
} catch {}

verifyNeonDevEndpoints();
const prisma = new PrismaClient();

// Helper to generate representative normalized parcel fixtures
function generateRepresentativeFixtures(count: number, prefix: string): NormalizedParcelRecord[] {
  const records: NormalizedParcelRecord[] = [];
  for (let i = 1; i <= count; i++) {
    const pin = `${prefix}${String(i).padStart(6, '0')}`;
    const streetNum = 1000 + i;
    const address = `${streetNum} N 24TH ST`;
    const rec: NormalizedParcelRecord = {
      parcelId: pin,
      sourceObjectId: 900000 + i,
      address,
      hasAuthoritativeAddress: true,
      city: 'OMAHA',
      rawPropCity: 'OMAHA',
      state: 'NE',
      zip: '68110',
      propertyType: 'SINGLE_FAMILY',
      countyClass: 'R',
      buildingDesc: 'Single Family Residence',
      yearBuilt: 1950 + (i % 50),
      squareFeet: 1200 + (i * 10),
      lotSizeSqFt: 6000 + (i * 20),
      condition: 'AVERAGE',
      quality: 'C',
      dcaAccountType: 'RESIDENTIAL',
      legalDescription: `BENSON ADD LOT ${i} BLOCK 2`,
      assessorUrl: `https://www.dcassessor.org/parcel/${pin}`,
      treasurerUrl: `https://www.dctreasurer.org/tax/${pin}`,
      latitude: 41.28 + (i * 0.0001),
      longitude: -95.95 - (i * 0.0001),
      geometryGeoJson: {
        type: 'Polygon',
        coordinates: [
          [
            [-95.95, 41.28],
            [-95.95, 41.281],
            [-95.949, 41.281],
            [-95.949, 41.28],
            [-95.95, 41.28],
          ],
        ],
      },
      ownerName: `BENCHMARK OWNER ${i}`,
      mailingAddress: `${streetNum} N 24TH ST`,
      mailingCity: 'OMAHA',
      mailingState: 'NE',
      mailingZip: '68110',
      absenteeStatus: 'OWNER_OCCUPIED',
      isAbsentee: false,
      outOfStateStatus: 'IN_STATE',
      isOutOfState: false,
      corporateStatus: 'INDIVIDUAL',
      isCorporate: false,
      ownershipEvaluationNotes: ['Matched situs'],
      boundaryClassification: {
        outcome: 'INSIDE_OMAHA',
        totalVertices: 5,
        insideVertices: 5,
        outsideVertices: 0,
        centroidInsideBoundary: true,
        notes: ['All parcel vertices strictly contained within incorporated Omaha limits'],
      },
      contentHash: `hash-benchmark-${pin}`,
      sanitizedPayload: {
        OBJECTID: 900000 + i,
        PIN: pin,
        PROPERTY_A: address,
        PROP_CITY: 'OMAHA',
        PROP_ZIP: '68110',
        OWNER_NAME: `BENCHMARK OWNER ${i}`,
        ADDRESS1: address,
        OWNER_CITY: 'OMAHA',
        OWNER_STAT: 'NE',
        OWNER_ZIP: '68110',
        CLASS: 'R',
      },
    };
    records.push(rec);
  }
  return records;
}

// Emulate sequential write inside transaction rollback
async function runSequentialSimulation(tx: any, records: NormalizedParcelRecord[], runId: string) {
  await tx.ingestionRun.create({
    data: {
      id: runId,
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
      status: 'RUNNING',
    },
  });
  let inserted = 0;
  for (const record of records) {
    const propertyData: any = {
      parcelId: record.parcelId,
      address: record.address,
      hasAuthoritativeAddress: record.hasAuthoritativeAddress,
      city: record.city,
      state: record.state,
      zip: record.zip,
      propertyType: record.propertyType,
      yearBuilt: record.yearBuilt,
      squareFeet: record.squareFeet,
      lotSizeSqFt: record.lotSizeSqFt,
      countyClass: record.countyClass,
      condition: record.condition,
      quality: record.quality,
      dcaAccountType: record.dcaAccountType,
      legalDescription: record.legalDescription,
      assessorUrl: record.assessorUrl,
      treasurerUrl: record.treasurerUrl,
      latitude: record.latitude,
      longitude: record.longitude,
      geometryGeoJson: record.geometryGeoJson,
      municipalJurisdiction: record.boundaryClassification?.outcome ?? 'UNRESOLVED',
    };

    // Sequential findUnique + create
    const existing = await tx.property.findUnique({
      where: { parcelId: record.parcelId },
      select: { id: true },
    });

    let propId = existing?.id;
    if (!propId) {
      const created = await tx.property.create({ data: propertyData });
      propId = created.id;
      inserted++;
    }

    // Ownership findFirst + create
    const existingOwn = await tx.ownershipRecord.findFirst({
      where: { propertyId: propId, isCurrent: true },
      select: { id: true },
    });
    if (!existingOwn) {
      await tx.ownershipRecord.create({
        data: {
          propertyId: propId,
          ownerName: record.ownerName,
          mailingAddress: record.mailingAddress,
          mailingCity: record.mailingCity,
          mailingState: record.mailingState,
          mailingZip: record.mailingZip,
          isAbsentee: record.isAbsentee,
          isOutOfState: record.isOutOfState,
          isCorporate: record.isCorporate,
          absenteeStatus: record.absenteeStatus,
          outOfStateStatus: record.outOfStateStatus,
          corporateStatus: record.corporateStatus,
          isCurrent: true,
        },
      });
    }

    // SourceRecord findUnique + upsert
    const sourceRecId = `PARCEL-${record.parcelId}`;
    await tx.sourceRecord.upsert({
      where: {
        sourceName_sourceRecordId: {
          sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
          sourceRecordId: sourceRecId,
        },
      },
      update: {
        rawPayloadJson: {
          ...record.sanitizedPayload,
          contentHash: record.contentHash,
        },
        ingestionRunId: runId,
        propertyId: propId,
      },
      create: {
        sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
        sourceRecordId: sourceRecId,
        rawPayloadJson: {
          ...record.sanitizedPayload,
          contentHash: record.contentHash,
        },
        ingestionRunId: runId,
        propertyId: propId,
        matchedStatus: 'MATCHED',
      },
    });
  }
  return inserted;
}

// Emulate batch write inside transaction rollback
async function runBatchedSimulation(tx: any, records: NormalizedParcelRecord[], runId: string, batchSize: number) {
  await tx.ingestionRun.create({
    data: {
      id: runId,
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
      status: 'RUNNING',
    },
  });
  let inserted = 0;
  for (let b = 0; b < records.length; b += batchSize) {
    const chunk = records.slice(b, b + batchSize);
    const parcelIds = chunk.map((r) => r.parcelId);
    const sourceRecordIds = chunk.map((r) => `PARCEL-${r.parcelId}`);

    // Pre-fetch
    const existingProps = await tx.property.findMany({
      where: { parcelId: { in: parcelIds } },
      select: { id: true, parcelId: true },
    });
    const propMap = new Map<string, string>();
    for (const p of existingProps) propMap.set(p.parcelId, p.id);

    const existingSources = await tx.sourceRecord.findMany({
      where: {
        sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
        sourceRecordId: { in: sourceRecordIds },
      },
      select: { id: true, sourceRecordId: true, rawPayloadJson: true },
    });
    const sourceMap = new Map<string, string | undefined>();
    for (const s of existingSources) {
      sourceMap.set(s.sourceRecordId, (s.rawPayloadJson as any)?.contentHash);
    }

    const existingOwns = await tx.ownershipRecord.findMany({
      where: { propertyId: { in: Array.from(propMap.values()) }, isCurrent: true },
      select: { id: true, propertyId: true },
    });
    const ownMap = new Map<string, string>();
    for (const o of existingOwns) ownMap.set(o.propertyId, o.id);

    for (const record of chunk) {
      const existingPropId = propMap.get(record.parcelId);
      const sourceRecId = `PARCEL-${record.parcelId}`;
      let propId = existingPropId;

      if (!propId) {
        const created = await tx.property.create({
          data: {
            parcelId: record.parcelId,
            address: record.address,
            hasAuthoritativeAddress: record.hasAuthoritativeAddress,
            city: record.city,
            state: record.state,
            zip: record.zip,
            propertyType: record.propertyType,
            yearBuilt: record.yearBuilt,
            squareFeet: record.squareFeet,
            lotSizeSqFt: record.lotSizeSqFt,
            countyClass: record.countyClass,
            condition: record.condition,
            quality: record.quality,
            dcaAccountType: record.dcaAccountType,
            legalDescription: record.legalDescription,
            assessorUrl: record.assessorUrl,
            treasurerUrl: record.treasurerUrl,
            latitude: record.latitude,
            longitude: record.longitude,
            geometryGeoJson: record.geometryGeoJson,
            municipalJurisdiction: record.boundaryClassification?.outcome ?? 'UNRESOLVED',
          },
        });
        propId = created.id;
        propMap.set(record.parcelId, created.id);
        inserted++;
      }

      if (!propId) throw new Error('Missing propId');

      const existingOwnId = ownMap.get(propId);
      if (!existingOwnId) {
        const createdOwn = await tx.ownershipRecord.create({
          data: {
            propertyId: propId,
            ownerName: record.ownerName,
            mailingAddress: record.mailingAddress,
            mailingCity: record.mailingCity,
            mailingState: record.mailingState,
            mailingZip: record.mailingZip,
            isAbsentee: record.isAbsentee,
            isOutOfState: record.isOutOfState,
            isCorporate: record.isCorporate,
            absenteeStatus: record.absenteeStatus,
            outOfStateStatus: record.outOfStateStatus,
            corporateStatus: record.corporateStatus,
            isCurrent: true,
          },
        });
        ownMap.set(propId, createdOwn.id);
      }

      await tx.sourceRecord.upsert({
        where: {
          sourceName_sourceRecordId: {
            sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
            sourceRecordId: sourceRecId,
          },
        },
        update: {
          rawPayloadJson: {
            ...record.sanitizedPayload,
            contentHash: record.contentHash,
          },
          ingestionRunId: runId,
          propertyId: propId,
        },
        create: {
          sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
          sourceRecordId: sourceRecId,
          rawPayloadJson: {
            ...record.sanitizedPayload,
            contentHash: record.contentHash,
          },
          ingestionRunId: runId,
          propertyId: propId,
          matchedStatus: 'MATCHED',
        },
      });
    }
  }
  return inserted;
}

async function main() {
  console.log('=== PART C: SAFE DETERMINISTIC BENCHMARK & COMPARISON ===\n');

  // Verify baseline count before running
  const prePropCount = await prisma.property.count();
  const preOwnCount = await prisma.ownershipRecord.count();
  const preSourceCount = await prisma.sourceRecord.count();
  console.log(`Initial Inventory: ${prePropCount} Properties, ${preOwnCount} Ownerships, ${preSourceCount} SourceRecords`);

  const TEST_RECORD_COUNT = 50;
  const fixtures = generateRepresentativeFixtures(TEST_RECORD_COUNT, 'TESTBENCH');

  // 1. Benchmark Sequential Write (within guaranteed rollback transaction)
  console.log(`\n1. Running Sequential Write Benchmark (${TEST_RECORD_COUNT} records, 5 round-trips/record)...`);
  let sequentialDurationMs = 0;
  let sequentialRolledBack = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        const start = performance.now();
        await runSequentialSimulation(tx, fixtures, 'run-bench-seq');
        sequentialDurationMs = performance.now() - start;
        // Force rollback
        throw new Error('ROLLBACK_INTENTIONAL_SEQUENTIAL');
      },
      { timeout: 60000, maxWait: 15000 }
    );
  } catch (err: any) {
    if (err.message === 'ROLLBACK_INTENTIONAL_SEQUENTIAL') {
      sequentialRolledBack = true;
    } else {
      throw err;
    }
  }

  const sequentialThroughput = (TEST_RECORD_COUNT / (sequentialDurationMs / 1000)).toFixed(2);
  const sequentialLatencyPerRecord = (sequentialDurationMs / TEST_RECORD_COUNT).toFixed(1);
  console.log(`   • Sequential Time: ${sequentialDurationMs.toFixed(1)} ms`);
  console.log(`   • Sequential Throughput: ${sequentialThroughput} records/sec`);
  console.log(`   • Latency per record: ${sequentialLatencyPerRecord} ms/record`);
  console.log(`   • Rollback verified: ${sequentialRolledBack}`);

  // 2. Benchmark Batched Write (batchSize=25, within guaranteed rollback transaction)
  console.log(`\n2. Running Batched Write Benchmark (${TEST_RECORD_COUNT} records, batchSize=25)...`);
  let batchedDurationMs = 0;
  let batchedRolledBack = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        const start = performance.now();
        await runBatchedSimulation(tx, fixtures, 'run-bench-batched', 25);
        batchedDurationMs = performance.now() - start;
        // Force rollback
        throw new Error('ROLLBACK_INTENTIONAL_BATCHED');
      },
      { timeout: 60000, maxWait: 15000 }
    );
  } catch (err: any) {
    if (err.message === 'ROLLBACK_INTENTIONAL_BATCHED') {
      batchedRolledBack = true;
    } else {
      throw err;
    }
  }

  const batchedThroughput = (TEST_RECORD_COUNT / (batchedDurationMs / 1000)).toFixed(2);
  const batchedLatencyPerRecord = (batchedDurationMs / TEST_RECORD_COUNT).toFixed(1);
  const speedupRatio = (sequentialDurationMs / batchedDurationMs).toFixed(2);

  console.log(`   • Batched Time: ${batchedDurationMs.toFixed(1)} ms`);
  console.log(`   • Batched Throughput: ${batchedThroughput} records/sec`);
  console.log(`   • Latency per record: ${batchedLatencyPerRecord} ms/record`);
  console.log(`   • Speedup ratio: ${speedupRatio}x faster`);
  console.log(`   • Rollback verified: ${batchedRolledBack}`);

  // 3. Rollback & Partial Failure Isolation Verification
  console.log(`\n3. Verifying Partial Failure & Error Rollback Isolation...`);
  // Test that an error midway rolls back the entire batch without partial orphan writes
  let errorCaught = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const errorFixtures = generateRepresentativeFixtures(5, 'ERRTEST');
        // Make the 3rd fixture trigger a unique constraint or invalid insert
        errorFixtures[2].parcelId = fixtures[0].parcelId; // Collision
        await runBatchedSimulation(tx, errorFixtures.slice(0, 2), 'run-err-1', 5);
        // Force explicit DB error
        await tx.$queryRawUnsafe('SELECT 1/0'); // Division by zero error
      },
      { timeout: 20000 }
    );
  } catch (e: any) {
    errorCaught = true;
    console.log(`   • Correctly caught simulated error: ${e.message.split('\n')[0]}`);
  }
  console.log(`   • Error rolled back without leaking state: ${errorCaught}`);

  // 4. Verify Neon DEV inventory remains strictly unchanged
  console.log(`\n4. Verifying Neon DEV Database Inventory Integrity Post-Benchmark...`);
  const postPropCount = await prisma.property.count();
  const postOwnCount = await prisma.ownershipRecord.count();
  const postSourceCount = await prisma.sourceRecord.count();

  console.log(`   • Properties: Before=${prePropCount}, After=${postPropCount} (Delta: ${postPropCount - prePropCount})`);
  console.log(`   • Ownerships: Before=${preOwnCount}, After=${postOwnCount} (Delta: ${postOwnCount - preOwnCount})`);
  console.log(`   • Sources:    Before=${preSourceCount}, After=${postSourceCount} (Delta: ${postSourceCount - preSourceCount})`);

  if (
    prePropCount === postPropCount &&
    preOwnCount === postOwnCount &&
    preSourceCount === postSourceCount
  ) {
    console.log(`\n✔ INVENTORY INTEGRITY FULLY PRESERVED (ZERO LEAKAGE TO NEON DEV INVENTORY)`);
  } else {
    throw new Error('FATAL: Database count mismatch detected after benchmark!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
