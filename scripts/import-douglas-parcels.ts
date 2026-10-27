import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { runDouglasCountyParcelImport } from '../src/lib/ingestion/douglas-parcel/runner';

// 1. Explicitly load .env
try {
  process.loadEnvFile('.env');
} catch {}

// 2. Strict DEV preflight verification (never connects without passing)
const preflight = verifyNeonDevEndpoints();
console.log('========================================================================');
console.log('  DEALBEACON — DOUGLAS COUNTY PARCEL RUNNER (DEV ENVIRONMENT)           ');
console.log('========================================================================');
console.log(`✔ Neon Preflight PASSED: Verified DEV target "${preflight.expectedEndpointId}"`);
console.log(`  Pooled Host : ${preflight.pooledHost}`);
console.log(`  Direct Host : ${preflight.directHost}`);
console.log(`  Database    : ${preflight.database}\n`);

// 3. Command-line flags parsing & validation
import { parseParcelCliArgs } from '../src/lib/ingestion/douglas-parcel/cli-parser';
import { queryDouglasDatasetMetrics } from '../src/lib/ingestion/douglas-parcel/dataset-metrics';

let cliArgs;
try {
  cliArgs = parseParcelCliArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(`\n❌ CLI ARGUMENT ERROR: ${err.message}\n`);
  process.exit(1);
}

const {
  execute: hasExecute,
  dryRun,
  limit,
  batchSize,
  pageSize,
  startAfterObjectId,
  resume,
  strategy: executionStrategy,
  confirmEndpoint,
} = cliArgs;

if (confirmEndpoint && confirmEndpoint !== preflight.expectedEndpointId) {
  console.error(`\n❌ ENDPOINT MISMATCH: --confirm-endpoint was "${confirmEndpoint}", but target DEV endpoint is "${preflight.expectedEndpointId}". Execution aborted.\n`);
  process.exit(1);
}

console.log('--- EXECUTION PARAMETERS ---');
console.log(`Mode                   : ${dryRun ? 'READ-ONLY (DRY-RUN SIMULATION - ZERO WRITES)' : 'LIVE EXECUTION (AUTHORIZED DEV WRITES)'}`);
console.log(`Execution Strategy     : ${executionStrategy}`);
console.log(`Record Limit           : ${limit}`);
console.log(`Batch Size             : ${batchSize}`);
console.log(`Page Size              : ${pageSize}`);
console.log(`Start After ObjectID   : ${startAfterObjectId !== undefined ? startAfterObjectId : resume ? 'AUTO (Resume from latest IngestionRun checkpoint)' : '0 (Beginning of dataset)'}`);
console.log(`Resume Mode            : ${resume ? 'YES' : 'NO'}`);
if (dryRun) {
  console.log('NOTE                   : Running in read-only simulation mode. Use --execute to enable database writes.');
}
console.log('----------------------------\n');

// 4. Pin PrismaClients to verified DEV environment variables
const pooledPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const directPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  // Capture initial baseline counts on DEV
  const baseline = {
    properties: await pooledPrisma.property.count(),
    ownership: await pooledPrisma.ownershipRecord.count(),
    sources: await pooledPrisma.sourceRecord.count(),
    hotline: await pooledPrisma.hotlineReport.count(),
    taxLiens: await pooledPrisma.taxLienRecord.count(),
    ingestionRuns: await pooledPrisma.ingestionRun.count(),
    runningRuns: await pooledPrisma.ingestionRun.count({ where: { status: 'RUNNING' } }),
  };

  console.log('--- BASELINE RECORD COUNTS (DEV: ep-restless-bonus-b4xv9ig1) ---');
  console.log(`• Properties        : ${baseline.properties}`);
  console.log(`• OwnershipRecords  : ${baseline.ownership}`);
  console.log(`• SourceRecords     : ${baseline.sources}`);
  console.log(`• HotlineReports    : ${baseline.hotline}`);
  console.log(`• TaxLienRecords    : ${baseline.taxLiens}`);
  console.log(`• IngestionRuns     : ${baseline.ingestionRuns} (Running: ${baseline.runningRuns})\n`);

  try {
    const effectiveCheckpoint = startAfterObjectId !== undefined ? startAfterObjectId : 0;
    const metrics = await queryDouglasDatasetMetrics(effectiveCheckpoint);
    console.log('--- DCGIS LIVE DATASET METRICS ---');
    console.log(`• Total County Parcels (DCGIS)  : ${metrics.totalCountyFeatures}`);
    console.log(`• Max Available County ObjectID : ${metrics.maxAvailableObjectId}`);
    console.log(`• Features Remaining Beyond OID : ${metrics.remainingFeaturesAfterCheckpoint} (after OID ${metrics.checkpointObjectId})`);
    console.log(`• County Completion Percentage  : ${metrics.pctCountyCompleted}%`);
    console.log(`• Keyset Non-Contiguity Notice  : Keyset pagination active. Source features processed may differ from canonical properties created due to updates/deduplication.\n`);
  } catch (err: any) {
    console.warn(`[Metrics] Note: Could not query live ArcGIS metrics: ${err.message}\n`);
  }

  console.log('--- EXECUTING UNIFIED PARCEL RUNNER ---');
  const startTime = Date.now();

  const stats = await runDouglasCountyParcelImport(pooledPrisma, directPrisma, {
    batchSize,
    pageSize,
    maxRecordsToProcess: limit,
    startAfterObjectId,
    dryRun,
    forceFreshRun: !resume && startAfterObjectId !== undefined,
    executionStrategy,
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n========================================================================');
  console.log(`  RUNNER EXECUTION SUMMARY (${dryRun ? 'READ-ONLY SIMULATION' : 'LIVE DEV EXECUTION'})`);
  console.log('========================================================================');
  console.log(`Run ID                         : ${stats.runId}`);
  console.log(`Status                         : ${stats.status}`);
  console.log(`Mode                           : ${stats.mode}`);
  console.log(`Strategy                       : ${executionStrategy}`);
  console.log(`Duration                       : ${durationSec}s`);
  console.log(`Starting ObjectID              : ${stats.startingObjectId}`);
  console.log(`Highest ObjectID Processed     : ${stats.highestObjectIdProcessed}`);
  console.log(`Total Features Fetched         : ${stats.totalFetched}`);
  console.log('\n--- SPATIAL CLASSIFICATION (ALL COUNTY FEATURES RETAINED) ---');
  console.log(`• Inside Omaha                 : ${stats.insideOmahaCount}`);
  console.log(`• Outside Omaha (County Retained): ${stats.outsideOmahaCount}`);
  console.log(`• Crosses Boundary             : ${stats.crossesBoundaryCount}`);
  console.log('\n--- INGESTION DISPOSITION ---');
  console.log(`• Inserted New Properties      : ${stats.insertedCount}`);
  console.log(`• Updated Existing Properties  : ${stats.updatedCount}`);
  console.log(`• Unchanged (No-Op)            : ${stats.unchangedCount}`);
  console.log(`• Quarantined Parcels          : ${stats.quarantinedCount}`);
  console.log(`• Skipped (Unnormalizable)     : ${stats.skippedCount}`);
  console.log(`• Batches Committed            : ${stats.batchesCommitted}`);

  if (stats.timingSummary) {
    console.log('\n--- TIMING INSTRUMENTATION BREAKDOWN ---');
    console.log(`• ArcGIS Fetch Time            : ${(stats.timingSummary.fetchDurationMs / 1000).toFixed(2)}s`);
    console.log(`• Normalization & Boundaries   : ${(stats.timingSummary.normalizationDurationMs / 1000).toFixed(2)}s`);
    console.log(`• DB Prefetch Time             : ${(stats.timingSummary.dbPrefetchMs / 1000).toFixed(2)}s`);
    console.log(`• DB Writes Time               : ${(stats.timingSummary.dbWritesMs / 1000).toFixed(2)}s`);
    console.log(`• DB Checkpoint Time           : ${(stats.timingSummary.dbCheckpointMs / 1000).toFixed(2)}s`);
    console.log(`• DB Interactive Transaction   : ${(stats.timingSummary.dbTransactionMs / 1000).toFixed(2)}s`);
    console.log(`• Average Batch Tx Duration    : ${stats.timingSummary.averageBatchMs.toFixed(1)}ms`);
    console.log(`• Overall Write Throughput     : ${(stats.insertedCount / Math.max(stats.timingSummary.totalDurationMs / 1000, 0.001)).toFixed(2)} rec/s`);
  }

  // Post-execution direct database count verification
  console.log('\n--- POST-EXECUTION DATABASE INTEGRITY VERIFICATION ---');
  const postCounts = {
    properties: await pooledPrisma.property.count(),
    ownership: await pooledPrisma.ownershipRecord.count(),
    sources: await pooledPrisma.sourceRecord.count(),
    hotline: await pooledPrisma.hotlineReport.count(),
    taxLiens: await pooledPrisma.taxLienRecord.count(),
    ingestionRuns: await pooledPrisma.ingestionRun.count(),
    runningRuns: await pooledPrisma.ingestionRun.count({ where: { status: 'RUNNING' } }),
  };

  console.log(`• Properties        : ${postCounts.properties} (Delta: ${postCounts.properties - baseline.properties})`);
  console.log(`• OwnershipRecords  : ${postCounts.ownership} (Delta: ${postCounts.ownership - baseline.ownership})`);
  console.log(`• SourceRecords     : ${postCounts.sources} (Delta: ${postCounts.sources - baseline.sources})`);
  console.log(`• HotlineReports    : ${postCounts.hotline} (Delta: ${postCounts.hotline - baseline.hotline})`);
  console.log(`• TaxLienRecords    : ${postCounts.taxLiens} (Delta: ${postCounts.taxLiens - baseline.taxLiens})`);
  console.log(`• IngestionRuns     : ${postCounts.ingestionRuns} (Delta: ${postCounts.ingestionRuns - baseline.ingestionRuns})`);

  if (dryRun) {
    if (
      postCounts.properties !== baseline.properties ||
      postCounts.ownership !== baseline.ownership ||
      postCounts.sources !== baseline.sources ||
      postCounts.hotline !== baseline.hotline ||
      postCounts.taxLiens !== baseline.taxLiens ||
      postCounts.ingestionRuns !== baseline.ingestionRuns
    ) {
      console.error('\n❌ CRITICAL INTEGRITY VIOLATION: Dry-run modified the DEV database!');
      process.exit(1);
    }
    console.log('\n✔ READ-ONLY INTEGRITY CONFIRMED: DEV database completely untouched (0 mutations).');
  } else {
    console.log('\n✔ LIVE BATCH COMMITTED: Authorized DEV records committed atomically.');
  }
}

main()
  .catch((err) => {
    console.error('\n✖ Fatal Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pooledPrisma.$disconnect();
    await directPrisma.$disconnect();
  });
