import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile('.env');
} catch {}

const prisma = new PrismaClient();

async function main() {
  const runs = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'asc' },
  });
  console.log('=== ALL INGESTION RUNS ===');
  for (const r of runs) {
    console.log(`• ID: ${r.id} | Source: ${r.sourceName} | Status: ${r.status} | Ingested: ${r.recordsIngested} | Started: ${r.startedAt.toISOString()} | Completed: ${r.completedAt?.toISOString() ?? 'null'}`);
  }

  const propCount = await prisma.property.count();
  const srcCount = await prisma.sourceRecord.count();
  const ownCount = await prisma.ownershipRecord.count();
  console.log(`\nCounts: Properties=${propCount}, SourceRecords=${srcCount}, OwnershipRecords=${ownCount}`);
}

main().finally(() => prisma.$disconnect());
