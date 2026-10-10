import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: ${preflight.expectedEndpointId} (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

async function main() {
  console.log('--- OBJECTID BASELINE & PRE-IMPORT AUDIT ---');

  // 1. Check running runs
  const runningRuns = await prisma.ingestionRun.count({
    where: { status: 'RUNNING' },
  });
  console.log(`Active RUNNING IngestionRuns: ${runningRuns} (Expected: 0)`);
  if (runningRuns > 0) {
    const runs = await prisma.ingestionRun.findMany({ where: { status: 'RUNNING' } });
    console.error('Concurrent RUNNING runs found:', runs);
  }

  // 2. Query source records for Douglas County Assessor
  const [oidStats] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      MIN(("rawPayloadJson"->>'OBJECTID')::int) as min_oid,
      MAX(("rawPayloadJson"->>'OBJECTID')::int) as max_oid,
      COUNT(*)::int as count
    FROM public.source_records 
    WHERE "sourceName" = 'DOUGLAS_COUNTY_ASSESSOR'
  `);
  console.log(`Source Records for DOUGLAS_COUNTY_ASSESSOR:`);
  console.log(`  Count  : ${oidStats?.count}`);
  console.log(`  Min OID: ${oidStats?.min_oid}`);
  console.log(`  Max OID: ${oidStats?.max_oid}`);

  // 3. Check latest IngestionRun stats
  const latestRun = await prisma.ingestionRun.findFirst({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    orderBy: { startedAt: 'desc' },
  });
  console.log(`\nLatest Parcel IngestionRun:`);
  console.log(`  ID    : ${latestRun?.id}`);
  console.log(`  Status: ${latestRun?.status}`);
  console.log(`  Stats :`, JSON.stringify(latestRun?.statsJson, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
