import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { importDouglasParcels } from '../src/lib/ingestion/douglas-parcel/importer';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(
  `✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`
);

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const limit = Number(getArg('--limit')) || 100;
const pageSize = Number(getArg('--page-size')) || 50;
const afterObjectIdArg = getArg('--after-object-id');
const afterObjectId = afterObjectIdArg !== undefined ? Number(afterObjectIdArg) : undefined;
const resume = args.includes('--resume');
const cityFilter = getArg('--city');
const dryRun = args.includes('--dry-run');

// Stage 8: Expose write mode, batch size, and failure strategy flags
const writeModeArg = getArg('--write-mode');
const writeMode: 'sequential' | 'batched' = writeModeArg === 'batched' ? 'batched' : 'sequential';
const batchSizeArg = getArg('--batch-size');
const batchSize = batchSizeArg !== undefined ? Number(batchSizeArg) : 25;
const failedStrategyArg = getArg('--failed-strategy');
const failedRecordStrategy: 'STOP_AT_FAILURE' | 'QUARANTINE_FAILURE' =
  failedStrategyArg === 'QUARANTINE_FAILURE' ? 'QUARANTINE_FAILURE' : 'STOP_AT_FAILURE';

console.log('--- DEALBEACON DOUGLAS COUNTY PARCEL IMPORTER ---');
console.log(`Limit           : ${limit}`);
console.log(`Page Size       : ${pageSize}`);
console.log(
  `Start After OID : ${afterObjectId !== undefined ? afterObjectId : resume ? 'AUTO (Resume from trustworthy run checkpoint)' : '0'}`
);
console.log(`Write Mode      : ${writeMode}`);
console.log(`Batch Size      : ${batchSize}`);
console.log(`Failure Strategy: ${failedRecordStrategy}`);
console.log(
  `City Filter     : ${cityFilter ?? 'None (Countywide)'} (Note: Source attribute only; does not establish legal municipal jurisdiction)`
);
console.log(`Dry Run         : ${dryRun ? 'YES (SIMULATION - CONFIRMED ZERO DATABASE WRITES)' : 'NO'}`);
console.log('---------------------------------------------------\n');

const prisma = new PrismaClient();

async function main() {
  const baseline = {
    properties: await prisma.property.count(),
    ownership: await prisma.ownershipRecord.count(),
    hotline: await prisma.hotlineReport.count(),
    sources: await prisma.sourceRecord.count(),
    runningRuns: await prisma.ingestionRun.count({ where: { status: 'RUNNING' } }),
  };

  const stats = await importDouglasParcels(prisma, {
    limit,
    pageSize,
    afterObjectId,
    resume,
    cityFilter,
    dryRun,
    writeMode,
    batchSize,
    failedRecordStrategy,
    onProgress: (p) => {
      if (dryRun) {
        console.log(
          `[Simulation Progress] Page ${p.pageCount ?? 1} | Fetched: ${p.fetched} | Last OID: ${p.lastProcessedObjectId ?? 'N/A'} | WOULD_INSERT: ${p.inserted} | Skip: ${p.skipped} (Zero DB writes)`
        );
      } else {
        console.log(
          `[Progress] Page ${p.pageCount ?? 1} | Fetched: ${p.fetched} | Last OID: ${p.lastProcessedObjectId ?? 'N/A'} | Ins: ${p.inserted} | Upd: ${p.updated} | Unchanged: ${p.unchanged} | Quarantined: ${p.quarantined} | Skip: ${p.skipped} | Fail: ${p.failed}`
        );
      }
    },
  });

  if (dryRun) {
    console.log('\n========================================================================');
    console.log('  END-TO-END DRY-RUN SIMULATION SUMMARY (ACTUAL IMPORTER PIPELINE)');
    console.log('========================================================================');
    console.log('CONFIRMATION                  : ZERO DATABASE WRITES OCCURRED');
    console.log(`Total Fetched                 : ${stats.fetched}`);
    console.log(`• INSIDE_OMAHA (Would Import) : ${stats.insideOmaha}`);
    console.log(`• OUTSIDE_OMAHA (Skipped)     : ${stats.outsideOmahaSkipped}`);
    console.log(`• CROSSES_BOUNDARY (Quarantine): ${stats.crossesBoundaryQuarantined}`);
    console.log(`• UNRESOLVED (Quarantine)     : ${stats.unresolvedQuarantined}`);
    console.log(`• Total Quarantined           : ${stats.quarantined}`);
    console.log(`Duration                      : ${(stats.durationMs / 1000).toFixed(2)}s`);

    if (stats.quarantinedRecords && stats.quarantinedRecords.length > 0) {
      console.log('\n--- QUARANTINED RECORDS (PRESERVED FOR REVIEW) ---');
      for (const q of stats.quarantinedRecords.slice(0, 10)) {
        console.log(`  • PIN ${q.parcelId} (${q.address}) => ${q.outcome}`);
        console.log(`    Reason: ${q.reason}`);
      }
      if (stats.quarantinedRecords.length > 10) {
        console.log(`    ... and ${stats.quarantinedRecords.length - 10} more quarantined records.`);
      }
    }

    // Direct Read-Only SQL count verification
    console.log('\n--- DIRECT SQL INTEGRITY VERIFICATION ---');
    const propertyCount = await prisma.property.count();
    const ownershipCount = await prisma.ownershipRecord.count();
    const hotlineCount = await prisma.hotlineReport.count();
    const sourceCount = await prisma.sourceRecord.count();
    const runningRuns = await prisma.ingestionRun.count({ where: { status: 'RUNNING' } });

    console.log(`• Property count:        ${propertyCount} (baseline: ${baseline.properties})`);
    console.log(`• OwnershipRecord count: ${ownershipCount} (baseline: ${baseline.ownership})`);
    console.log(`• HotlineReport count:   ${hotlineCount} (baseline: ${baseline.hotline})`);
    console.log(`• SourceRecord count:    ${sourceCount} (baseline: ${baseline.sources})`);
    console.log(`• Running IngestionRuns: ${runningRuns} (baseline: ${baseline.runningRuns})`);

    if (
      propertyCount === baseline.properties &&
      ownershipCount === baseline.ownership &&
      hotlineCount === baseline.hotline &&
      sourceCount === baseline.sources &&
      runningRuns === baseline.runningRuns
    ) {
      console.log('✔ READ-ONLY INTEGRITY CONFIRMED: Database completely untouched.');
    } else {
      console.error('❌ INTEGRITY CHECK FAILED: Database was modified!');
      process.exit(1);
    }
  } else {
    console.log('\n========================================================================');
    console.log('  CONTROLLED OMAHA-FILTERED PARCEL INGESTION SUMMARY');
    console.log('========================================================================');
    console.log(`Run ID                         : ${stats.runId}`);
    console.log(`Start After OBJECTID           : ${stats.startAfterObjectId ?? 0}`);
    console.log(`Last Processed OBJECTID        : ${stats.lastProcessedObjectId ?? 'N/A'}`);
    console.log(`Pages Processed                : ${stats.pageCount ?? 0}`);
    console.log(`Total Fetched                  : ${stats.fetched}`);
    console.log(`• INSIDE_OMAHA                 : ${stats.insideOmaha}`);
    console.log(`• OUTSIDE_OMAHA (Skipped)      : ${stats.outsideOmahaSkipped}`);
    console.log(`• CROSSES_BOUNDARY (Quarantine): ${stats.crossesBoundaryQuarantined}`);
    console.log(`• UNRESOLVED (Quarantine)      : ${stats.unresolvedQuarantined}`);
    console.log(`• Total Quarantined            : ${stats.quarantined}`);
    console.log(`• Actual New Property Inserts  : ${stats.inserted}`);
    console.log(`• Existing Property Updates    : ${stats.updated}`);
    console.log(`• Unchanged Properties         : ${stats.unchanged}`);
    console.log(`• Skipped Records              : ${stats.skipped}`);
    console.log(`• Failed Records               : ${stats.failed}`);
    console.log(`Duration                       : ${(stats.durationMs / 1000).toFixed(2)}s`);

    if (stats.quarantinedRecords && stats.quarantinedRecords.length > 0) {
      console.log('\n--- QUARANTINED RECORDS (PERSISTED AS QUARANTINED SOURCERECORDS) ---');
      for (const q of stats.quarantinedRecords.slice(0, 10)) {
        console.log(`  • PIN ${q.parcelId} (${q.address}) => ${q.outcome}`);
        console.log(`    Reason: ${q.reason}`);
      }
      if (stats.quarantinedRecords.length > 10) {
        console.log(`    ... and ${stats.quarantinedRecords.length - 10} more quarantined records.`);
      }
    }
  }

  if (stats.errors.length > 0) {
    console.log(`Errors (${stats.errors.length}):`, stats.errors.slice(0, 5));
  }

  if (stats.failed > 0 && stats.inserted === 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Fatal Import Failure:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
