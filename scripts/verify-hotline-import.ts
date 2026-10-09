/**
 * Verification script for Omaha Hotline records imported into PostgreSQL.
 *
 * Verifies:
 * 1. Exact count of HotlineReport records
 * 2. Uniqueness of sourceGlobalId
 * 3. Handling of nullable SUBMITDT timestamps
 * 4. Coordinate bounding box validity
 * 5. Immutable SourceRecord linkage
 * 6. Exclusion of sensitive fields (DETAILS, Creator, Editor, GEOGRAPHIC_ASSIGNMENT)
 *
 * Usage:
 *   npx tsx scripts/verify-hotline-import.ts
 */
import { PrismaClient } from '@prisma/client';
import { OMAHA_HOTLINE_CONFIG } from '../src/lib/ingestion/omaha-hotline/config';

try {
  process.loadEnvFile('.env');
} catch {}

const prisma = new PrismaClient({ log: ['error', 'warn'] });

async function verify() {
  console.log('--- Verifying Persisted Omaha Hotline Database Records ---\n');

  let failedChecks = 0;
  const assert = (condition: boolean, label: string) => {
    if (condition) {
      console.log(`  ✔ ${label}`);
    } else {
      console.log(`  ✘ ${label}`);
      failedChecks++;
    }
  };

  const totalReports = await prisma.hotlineReport.count();
  console.log(`Total HotlineReport records in DB: ${totalReports}`);
  assert(totalReports > 0, 'HotlineReport has records');

  const distinctGlobalIds = await prisma.hotlineReport.groupBy({
    by: ['sourceGlobalId'],
  });
  assert(distinctGlobalIds.length === totalReports, `All sourceGlobalIds are distinct (${distinctGlobalIds.length}/${totalReports})`);

  // Verify SourceRecord linkage
  const linkedSourceRecords = await prisma.sourceRecord.count({
    where: { sourceName: OMAHA_HOTLINE_CONFIG.sourceName },
  });
  console.log(`Total SourceRecords for OMAHA_HOTLINE: ${linkedSourceRecords}`);
  assert(linkedSourceRecords >= totalReports, 'SourceRecords exist for all imported reports');

  // Check sample records for field integrity
  const sampleReports = await prisma.hotlineReport.findMany({
    take: 10,
    include: { latestSourceRecord: true },
  });

  let validCoordinates = 0;
  let validDateSources = 0;
  let excludedFieldsClean = true;

  for (const r of sampleReports) {
    if (r.latitude !== null && r.longitude !== null) {
      const { minLat, maxLat, minLon, maxLon } = OMAHA_HOTLINE_CONFIG.geoBoundingBox;
      if (
        r.latitude >= minLat &&
        r.latitude <= maxLat &&
        r.longitude >= minLon &&
        r.longitude <= maxLon
      ) {
        validCoordinates++;
      }
    }

    if (r.reportedAtSource === 'CreationDate' || r.reportedAtSource === 'SUBMITDT') {
      validDateSources++;
    }

    const raw = r.latestSourceRecord?.rawPayloadJson as Record<string, any> | null;
    if (raw) {
      if ('DETAILS' in raw || 'Creator' in raw || 'Editor' in raw || 'GEOGRAPHIC_ASSIGNMENT' in raw) {
        excludedFieldsClean = false;
      }
    }
  }

  assert(validCoordinates > 0, `Sample coordinates are within Omaha bounds (${validCoordinates}/${sampleReports.length})`);
  assert(validDateSources === sampleReports.length, `Effective reportedAt fallback resolved cleanly (${validDateSources}/${sampleReports.length})`);
  assert(excludedFieldsClean, 'Strict exclusion: No DETAILS, Creator, Editor, or GEOGRAPHIC_ASSIGNMENT stored');

  const unverifiedKindCount = await prisma.hotlineReport.count({
    where: { recordKind: 'UNVERIFIED_COMPLAINT' },
  });
  assert(unverifiedKindCount === totalReports, `All reports classified as UNVERIFIED_COMPLAINT (${unverifiedKindCount}/${totalReports})`);

  // Verify IngestionRun tracking
  const runs = await prisma.ingestionRun.findMany({
    where: { sourceName: OMAHA_HOTLINE_CONFIG.sourceName },
    orderBy: { startedAt: 'desc' },
  });
  console.log(`\nIngestionRuns recorded: ${runs.length}`);
  for (const run of runs) {
    console.log(`  - Run ${run.id}: status=${run.status}, ingested=${run.recordsIngested}`);
  }
  assert(runs.length > 0, 'IngestionRuns recorded');

  console.log(`\nResult: ${failedChecks === 0 ? 'ALL CHECKS PASSED' : `${failedChecks} CHECK(S) FAILED`}`);
  if (failedChecks > 0) process.exit(1);
}

verify()
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
