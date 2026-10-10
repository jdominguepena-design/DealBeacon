import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile('.env');
} catch {}

const prisma = new PrismaClient();

async function main() {
  const r1 = await prisma.ingestionRun.findUnique({ where: { id: 'run-parcel-1760070880313' } });
  const r2 = await prisma.ingestionRun.findUnique({ where: { id: 'run-parcel-1791520479990' } });
  console.log('r1 (1760070880313):', r1 ? { id: r1.id, status: r1.status, recordsIngested: r1.recordsIngested, startedAt: r1.startedAt, completedAt: r1.completedAt } : 'NOT FOUND');
  console.log('r2 (1791520479990):', r2 ? { id: r2.id, status: r2.status, recordsIngested: r2.recordsIngested, startedAt: r2.startedAt, completedAt: r2.completedAt } : 'NOT FOUND');

  const runs = await prisma.ingestionRun.findMany({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    orderBy: { startedAt: 'desc' },
  });
  console.log('\nAll Douglas Parcel runs:');
  for (const r of runs) {
    console.log(`- ${r.id}: status=${r.status}, ingested=${r.recordsIngested}, completedAt=${r.completedAt}`);
  }
}

main().finally(() => prisma.$disconnect());
