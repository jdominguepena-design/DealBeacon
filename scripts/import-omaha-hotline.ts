/**
 * CLI script to execute the Omaha Hotline Importer manually.
 *
 * Usage:
 *   npx tsx scripts/import-omaha-hotline.ts [--limit 25] [--page-size 25] [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { importOmahaHotlineRecords } from '../src/lib/ingestion/omaha-hotline/importer';

try {
  process.loadEnvFile('.env');
} catch {
  // variables may already be in process.env
}

async function runCli() {
  const args = process.argv.slice(2);
  let limit = 25;
  let pageSize = 25;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--page-size' && args[i + 1]) {
      pageSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  console.log(`Starting Omaha Hotline import (limit=${limit}, pageSize=${pageSize}, dryRun=${dryRun})...`);

  const prisma = new PrismaClient({ log: ['error', 'warn'] });

  try {
    const stats = await importOmahaHotlineRecords(prisma, {
      limit,
      pageSize,
      dryRun,
    });

    console.log('\n--- Omaha Hotline Import Results ---');
    console.log(`Run ID    : ${stats.runId}`);
    console.log(`Fetched   : ${stats.fetched}`);
    console.log(`Inserted  : ${stats.inserted}`);
    console.log(`Updated   : ${stats.updated}`);
    console.log(`Unchanged : ${stats.unchanged}`);
    console.log(`Skipped   : ${stats.skipped}`);
    console.log(`Failed    : ${stats.failed}`);
    console.log(`Duration  : ${stats.durationMs}ms`);

    if (stats.errors.length > 0) {
      console.log('\nErrors encountered:');
      stats.errors.forEach((e) => console.log(`  - ${e}`));
    }
  } catch (err) {
    console.error('Fatal import error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCli();
