import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log('PREFLIGHT_OK:', preflight.expectedEndpointId, preflight.pooledHost);

const prisma = new PrismaClient();

async function main() {
  const hotlineTotal = await prisma.hotlineReport.count();
  const [distinct] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "sourceGlobalId") as count FROM public.hotline_reports'
  );
  const sourceTotal = await prisma.sourceRecord.count();
  const sourceHotline = await prisma.sourceRecord.count({
    where: { sourceName: 'OMAHA_HOTLINE' },
  });
  const propertyTotal = await prisma.property.count();
  const ownershipTotal = await prisma.ownershipRecord.count();
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();
  const totalRuns = await prisma.ingestionRun.count();
  const runningRuns = await prisma.ingestionRun.count({
    where: { status: 'RUNNING' },
  });
  const [oidStats] = await prisma.$queryRawUnsafe<{ min_oid: number; max_oid: number }[]>(
    'SELECT MIN("sourceObjectId") as min_oid, MAX("sourceObjectId") as max_oid FROM public.hotline_reports'
  );
  const categories = await prisma.hotlineReport.groupBy({
    by: ['reportCategory'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log(
    JSON.stringify(
      {
        properties: propertyTotal,
        ownership_records: ownershipTotal,
        hotline_reports: hotlineTotal,
        distinct_global_ids: Number(distinct.count),
        source_records: sourceTotal,
        source_records_hotline: sourceHotline,
        code_violations: codeViolations,
        signals: signals,
        ingestion_runs: totalRuns,
        running_runs: runningRuns,
        min_oid: oidStats?.min_oid ?? null,
        max_oid: oidStats?.max_oid ?? null,
        categories: categories.map((c) => ({ category: c.reportCategory, count: c._count.id })),
      },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
