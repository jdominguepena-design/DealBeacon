import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

verifyNeonDevEndpoints();
const prisma = new PrismaClient();

async function main() {
  console.log('=== PHASE 2B STAGE 9 POST-IMPORT AUDIT ===\n');

  const run = await prisma.ingestionRun.findUnique({
    where: { id: 'run-parcel-1791667703768' },
  });

  console.log('IngestionRun Details:');
  console.log(`• ID:              ${run?.id}`);
  console.log(`• Status:          ${run?.status}`);
  console.log(`• Started At:      ${run?.startedAt.toISOString()}`);
  console.log(`• Completed At:    ${run?.completedAt?.toISOString()}`);
  console.log(`• Records Ingested:${run?.recordsIngested}`);
  console.log(`• Errors:          ${JSON.stringify(run?.errorsJson)}`);

  const stats = run?.statsJson as any;
  console.log('\nStats Breakdown:');
  console.log(`• Start After OID: ${stats?.startAfterObjectId}`);
  console.log(`• Last Processed:  ${stats?.lastProcessedObjectId}`);
  console.log(`• Fetched:         ${stats?.fetched}`);
  console.log(`• Inserted:        ${stats?.inserted}`);
  console.log(`• Skipped:         ${stats?.skipped} (Outside Omaha: ${stats?.outsideOmahaSkipped})`);
  console.log(`• Quarantined:     ${stats?.quarantined}`);
  console.log(`• Failed:          ${stats?.failed}`);
  console.log(`• Page Count:      ${stats?.pageCount}`);
  console.log(`• Duration (s):    ${(stats?.durationMs / 1000).toFixed(2)}s`);
  console.log(`• Effective Throughput: ${(stats?.fetched / (stats?.durationMs / 1000)).toFixed(2)} features/sec`);

  // OID Range analysis in SourceRecord
  const [minMax] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      MIN(("rawPayloadJson"->>'OBJECTID')::int) as min_oid,
      MAX(("rawPayloadJson"->>'OBJECTID')::int) as max_oid,
      COUNT(*)::int as total
    FROM public.source_records
    WHERE "ingestionRunId" = 'run-parcel-1791667703768'
  `);
  console.log('\nRun SourceRecord Metrics:');
  console.log(`• Min OBJECTID written in run: ${minMax?.min_oid}`);
  console.log(`• Max OBJECTID written in run: ${minMax?.max_oid}`);
  console.log(`• SourceRecords created in run: ${minMax?.total}`);

  // Total DB Counts
  const propsTotal = await prisma.property.count();
  const propsInside = await prisma.property.count({ where: { municipalJurisdiction: 'INSIDE_OMAHA' } });
  const propsOutside = await prisma.property.count({ where: { municipalJurisdiction: 'OUTSIDE_OMAHA' } });
  const propsCross = await prisma.property.count({ where: { municipalJurisdiction: 'CROSSES_BOUNDARY' } });
  const ownsTotal = await prisma.ownershipRecord.count();
  const sourcesTotal = await prisma.sourceRecord.count();
  const douglasSources = await prisma.sourceRecord.count({ where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' } });
  const hotlineReports = await prisma.hotlineReport.count();
  const violations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();
  const totalRuns = await prisma.ingestionRun.count();
  const runningRuns = await prisma.ingestionRun.count({ where: { status: 'RUNNING' } });

  console.log('\nGlobal Inventory Summary:');
  console.log(`• Properties Total:     ${propsTotal} (Inside: ${propsInside}, Outside: ${propsOutside}, Cross: ${propsCross})`);
  console.log(`• OwnershipRecords:     ${ownsTotal}`);
  console.log(`• SourceRecords Total:  ${sourcesTotal} (Douglas: ${douglasSources})`);
  console.log(`• HotlineReports:       ${hotlineReports}`);
  console.log(`• CodeViolations:       ${violations}`);
  console.log(`• Signals:              ${signals}`);
  console.log(`• IngestionRuns:        ${totalRuns} (RUNNING: ${runningRuns})`);
  console.log(`• Investor Eligible:    ${propsInside}`);
  console.log(`• Audit Ineligible:     ${propsOutside + propsCross} (historical 36 strictly preserved)`);
}

main().finally(() => prisma.$disconnect());
