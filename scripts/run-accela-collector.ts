import { prisma } from '../src/lib/db';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { runAccelaCollector } from '../src/lib/ingestion/accela-code-enforcement';

const AUTHORIZED_NEON_DEV_ENDPOINT = 'ep-restless-bonus-b4xv9ig1';

async function main() {
  const args = process.argv.slice(2);

  // 1. Preflight Safety Check: Fail closed if not pointing strictly to authorized Neon DEV
  const configuredEndpoint = (process.env.NEON_DEV_ENDPOINT_ID || AUTHORIZED_NEON_DEV_ENDPOINT).trim();
  if (configuredEndpoint !== AUTHORIZED_NEON_DEV_ENDPOINT) {
    console.error(
      `❌ FAIL CLOSED: NEON_DEV_ENDPOINT_ID "${configuredEndpoint}" does not match authorized DEV endpoint "${AUTHORIZED_NEON_DEV_ENDPOINT}".`
    );
    process.exit(1);
  }

  verifyNeonDevEndpoints({
    expectedEndpointId: AUTHORIZED_NEON_DEV_ENDPOINT,
  });

  // 2. Parse Execution Mode
  const isFull = args.includes('--full') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'full');
  const mode = isFull ? 'full' : 'incremental';

  // 3. Dry-Run is strictly the default. Live requires explicit flags AND confirmation string.
  const isLiveFlag = args.includes('--live') || args.includes('--execute-live');
  const isExplicitDryRun = args.includes('--dry-run');

  let isDryRun = true;
  if (isLiveFlag && !isExplicitDryRun) {
    // Check confirmation token from CLI arg or environment variable
    const confirmArgIdx = args.findIndex((a) => a.startsWith('--confirm-live=') || a === '--confirm-live');
    const confirmArgVal = confirmArgIdx !== -1
      ? (args[confirmArgIdx].startsWith('--confirm-live=')
          ? args[confirmArgIdx].split('=')[1]
          : args[confirmArgIdx + 1])
      : process.env.CONFIRM_LIVE;

    if (confirmArgVal !== 'CONFIRM_DEV_LIVE') {
      console.error(
        '❌ SAFEGUARD ERROR: Live execution requires explicit confirmation.\n' +
        'Provide --confirm-live=CONFIRM_DEV_LIVE (or CONFIRM_LIVE=CONFIRM_DEV_LIVE env var) to execute live writes.'
      );
      process.exit(1);
    }
    isDryRun = false;
  }

  const batchSizeIdx = args.indexOf('--batch-size');
  const batchSize = batchSizeIdx !== -1 ? parseInt(args[batchSizeIdx + 1], 10) : 500;

  const sinceIdx = args.indexOf('--since');
  const sinceDate = sinceIdx !== -1 ? new Date(args[sinceIdx + 1]) : undefined;

  const thresholdIdx = args.indexOf('--max-incremental-threshold');
  const maxIncrementalThreshold = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : undefined;

  console.log(`Starting Accela Code Enforcement Collector...`);
  console.log(`Configuration: mode=${mode}, dryRun=${isDryRun}, batchSize=${batchSize}`);
  if (sinceDate) console.log(`Custom cutoff date: ${sinceDate.toISOString()}`);
  if (isDryRun) {
    console.log(`✔ DRY-RUN SAFEGUARD ACTIVE: Zero database writes will be executed.`);
  } else {
    console.log(`⚠ LIVE EXECUTION: Writes authorized strictly against Neon DEV (${AUTHORIZED_NEON_DEV_ENDPOINT}).`);
  }

  const result = await runAccelaCollector({
    mode,
    dryRun: isDryRun,
    batchSize,
    sinceDate,
    maxIncrementalThreshold,
  });

  if (result.errors.length > 0) {
    console.error('Collector completed with errors:', result.errors);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Fatal CLI execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
