/**
 * DealBeacon — CLI tool to inspect and safely reconcile stale IngestionRun records.
 *
 * Usage:
 *   npx tsx scripts/reconcile-stale-runs.ts           # Dry-run (inspects only, modifies nothing)
 *   npx tsx scripts/reconcile-stale-runs.ts --apply  # Applies approved reconciliation plan
 */

import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { planStaleRunRecovery, executeStaleRunRecovery } from '../src/lib/ingestion/recovery/stale-run-recovery';

try {
  process.loadEnvFile('.env');
} catch {}

async function main() {
  const isApply = process.argv.includes('--apply');

  console.log('=== DEALBEACON STALE INGESTION RUN RECONCILIATION ===\n');

  // Preflight: Ensure strict Neon dev branch identity
  try {
    const preflight = verifyNeonDevEndpoints();
    console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);
  } catch (err) {
    console.error(`✘ Neon Preflight Error:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const prisma = new PrismaClient({ log: ['error', 'warn'] });

  try {
    const plan = await planStaleRunRecovery(prisma);

    if (plan.totalStaleRunsFound === 0) {
      console.log('✔ All IngestionRun records are in a terminal state (SUCCESS, PARTIAL, or FAILED).');
      console.log('  No stale RUNNING records detected.\n');
      return;
    }

    console.log(`Found ${plan.totalStaleRunsFound} stale RUNNING record(s):\n`);

    for (const p of plan.plans) {
      console.log(`------------------------------------------------------------`);
      console.log(`Run ID                       : ${p.runId}`);
      console.log(`Source Name                  : ${p.sourceName}`);
      console.log(`Started At (Preserved)       : ${p.startedAt.toISOString()}`);
      console.log(`Current Status               : ${p.currentStatus}`);
      console.log(`Current recordsIngested      : ${p.currentRecordsIngested}`);
      console.log(`Verified SourceRecords Count : ${p.verifiedSourceRecordsCount}`);
      console.log(`Proposed Status              : ${p.proposedStatus}`);
      console.log(`Proposed recordsIngested     : ${p.proposedRecordsIngested}`);
      console.log(`Proposed completedAt         : ${p.proposedCompletedAt.toISOString()}`);
      console.log(`Proposed statsJson           : ${JSON.stringify(p.proposedStatsJson, null, 2)}`);
      console.log(`Proposed errorsJson          : ${JSON.stringify(p.proposedErrorsJson, null, 2)}`);
      console.log(`------------------------------------------------------------\n`);
    }

    if (!isApply) {
      console.log('ℹ DRY-RUN MODE: No database changes were made.');
      console.log('  To apply this exact plan, re-run with: npm run reconcile:runs -- --apply\n');
      return;
    }

    console.log('Applying reconciliation plan to Neon dev database...');
    const result = await executeStaleRunRecovery(prisma, plan);
    console.log(`\n✔ Reconciliation complete! Reconciled: ${result.runsReconciled}, Skipped: ${result.runsSkipped}`);
    for (const d of result.details) {
      console.log(`  - ${d.runId}: ${d.previousStatus} -> ${d.newStatus} (${d.recordsIngested} records ingested, completed: ${d.completedAt.toISOString()})`);
    }
  } catch (err) {
    console.error('Reconciliation error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
