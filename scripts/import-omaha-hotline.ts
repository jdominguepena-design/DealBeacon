/**
 * CLI script to execute the Omaha Hotline Importer directly in the foreground.
 *
 * Usage:
 *   npx tsx scripts/import-omaha-hotline.ts [--limit 25] [--page-size 25] [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { importOmahaHotlineRecords } from '../src/lib/ingestion/omaha-hotline/importer';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {
  // variables may already be in process.env
}

async function runCli() {
  const args = process.argv.slice(2);
  let limit = 25; // Default safe limit
  let pageSize = 25;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      limit = val === 'all' ? 100000 : parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--page-size' && args[i + 1]) {
      pageSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  // Preflight check: Verify both database URLs strictly target Neon dev branch
  let preflight;
  try {
    preflight = verifyNeonDevEndpoints();
    console.log(`Preflight verified: Neon dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})`);
  } catch (err) {
    console.error('Preflight error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Starting Omaha Hotline import (limit=${limit}, pageSize=${pageSize}, dryRun=${dryRun})...\n`);

  const prisma = new PrismaClient({ log: ['error', 'warn'] });

  try {
    const stats = await importOmahaHotlineRecords(prisma, {
      limit,
      pageSize,
      dryRun,
      onProgress: (p) => {
        console.log(
          `  [Page ${p.page}] Fetched: ${p.fetched} | Ins: ${p.inserted} | Upd: ${p.updated} | Unchanged: ${p.unchanged} | Skip: ${p.skipped} | Fail: ${p.failed}`
        );
      },
    });

    console.log('\n--- Omaha Hotline Import Results ---');
    console.log(`Run ID      : ${stats.runId}`);
    if (stats.sourceMinObjectId !== undefined) {
      console.log(`Envelope    : objectid ${stats.sourceMinObjectId} -> ${stats.sourceMaxObjectId} (${stats.totalEligibleInSource} in source)`);
    }
    console.log(`Fetched     : ${stats.fetched}`);
    console.log(`Inserted    : ${stats.inserted}`);
    console.log(`Updated     : ${stats.updated}`);
    console.log(`Unchanged   : ${stats.unchanged}`);
    console.log(`Skipped     : ${stats.skipped}`);
    console.log(`Failed      : ${stats.failed}`);
    console.log(`Duration    : ${stats.durationMs}ms`);

    if (stats.errors.length > 0) {
      console.log('\nErrors encountered:');
      stats.errors.forEach((e) => console.log(`  - ${e}`));
    }

    if (stats.failed > 0 && stats.inserted === 0 && stats.unchanged === 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (err) {
    console.error('Fatal import error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runCli();
