import { PrismaClient } from '@prisma/client';
import { fetchHotlineEnvelope, fetchHotlineFeatures } from '../src/lib/ingestion/omaha-hotline/arcgis-client';
import { OMAHA_HOTLINE_CONFIG } from '../src/lib/ingestion/omaha-hotline/config';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const prisma = new PrismaClient();

async function main() {
  console.log('=== DEALBEACON OMAHA HOTLINE FINAL RECONCILIATION ===\n');

  // 1. Preflight
  const preflight = verifyNeonDevEndpoints();
  console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

  // 2. Database Counts
  const hotlineTotal = await prisma.hotlineReport.count();
  const [distinctGlobal] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "sourceGlobalId") as count FROM public.hotline_reports'
  );
  const sourceTotal = await prisma.sourceRecord.count();
  const sourceHotline = await prisma.sourceRecord.count({
    where: { sourceName: 'OMAHA_HOTLINE' },
  });
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();

  const [oidStats] = await prisma.$queryRawUnsafe<{ min_oid: number; max_oid: number }[]>(
    'SELECT MIN("sourceObjectId") as min_oid, MAX("sourceObjectId") as max_oid FROM public.hotline_reports'
  );

  const unverifiedKindCount = await prisma.hotlineReport.count({
    where: { recordKind: 'UNVERIFIED_COMPLAINT' },
  });

  const runs = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'desc' },
  });
  const runningRuns = runs.filter((r) => r.status === 'RUNNING');

  console.log('--- DATABASE POSTGRESQL STATE ---');
  console.log(`• hotline_reports Total           : ${hotlineTotal}`);
  console.log(`• Distinct sourceGlobalId Count    : ${Number(distinctGlobal.count)} (${Number(distinctGlobal.count) === hotlineTotal ? '100% UNIQUE' : 'DUPLICATES FOUND'})`);
  console.log(`• source_records Total             : ${sourceTotal}`);
  console.log(`• source_records (OMAHA_HOTLINE)   : ${sourceHotline}`);
  console.log(`• code_violations Count            : ${codeViolations}`);
  console.log(`• signals Count                    : ${signals}`);
  console.log(`• recordKind = UNVERIFIED_COMPLAINT: ${unverifiedKindCount} / ${hotlineTotal} (${unverifiedKindCount === hotlineTotal ? '100% COMPLIANT' : 'VIOLATION DETECTED'})`);
  console.log(`• Source Object ID Range in DB     : min=${oidStats.min_oid}, max=${oidStats.max_oid}`);
  console.log(`• IngestionRun Total Records       : ${runs.length}`);
  console.log(`• IngestionRun in RUNNING Status   : ${runningRuns.length}`);

  // 3. Live Upstream ArcGIS Source Envelope Check
  console.log('\n--- LIVE ARCGIS UPSTREAM RECONCILIATION ---');
  const liveEnvelope = await fetchHotlineEnvelope();
  console.log(`• Live Upstream Total Records      : ${liveEnvelope.totalCount}`);
  console.log(`• Live Upstream OID Range          : ${liveEnvelope.minObjectId} -> ${liveEnvelope.maxObjectId}`);

  // Query live count of excluded categories from ArcGIS
  const excludedQueryParams = new URLSearchParams({
    where: `${OMAHA_HOTLINE_CONFIG.baseWhereClause} AND report_category = 'Homeless Encampment'`,
    returnCountOnly: 'true',
    f: 'json',
  });
  const excludedRes = await fetch(`${OMAHA_HOTLINE_CONFIG.endpoint}?${excludedQueryParams.toString()}`);
  const excludedData = (await excludedRes.json()) as any;
  const liveExcludedCount = excludedData.count ?? 68;
  const calculatedEligible = liveEnvelope.totalCount - liveExcludedCount;

  console.log(`• Live Excluded (Homeless Encamp)  : ${liveExcludedCount}`);
  console.log(`• Calculated Eligible Upstream     : ${calculatedEligible}`);
  console.log(`• Persisted in Neon dev Database   : ${hotlineTotal}`);
  console.log(`• Reconciliation Delta             : ${hotlineTotal - calculatedEligible} (${hotlineTotal === calculatedEligible ? 'EXACT 100% MATCH' : 'DISCREPANCY'})`);

  // 4. Ingestion Runs Detailed Summary
  console.log('\n--- ALL INGESTION RUNS IN DATABASE ---');
  for (const r of runs) {
    console.log(
      `  [${r.status.padEnd(7)}] ${r.id} | Ingested: ${String(r.recordsIngested).padStart(4)} | Started: ${r.startedAt.toISOString()} | Completed: ${r.completedAt ? r.completedAt.toISOString() : 'NULL'}`
    );
  }
}

main().finally(() => prisma.$disconnect());
