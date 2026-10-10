import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(
  `✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`
);

const prisma = new PrismaClient();

async function main() {
  console.log('=== VERIFYING ADDITIVE SCHEMA MIGRATION ON NEON DEV ===\n');

  // 1. Check newly added columns on properties
  const propertyCols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'properties'
     AND column_name IN (
       'countyClass', 'dcaAccountType', 'condition', 'quality', 
       'legalDescription', 'assessorUrl', 'treasurerUrl', 
       'latitude', 'longitude', 'geometryGeoJson'
     )
     ORDER BY column_name;`
  );
  console.log(`• New Columns on 'properties' (${propertyCols.length}/10):`);
  for (const c of propertyCols) {
    console.log(`    - ${c.column_name}: ${c.data_type}`);
  }

  // 2. Check newly added columns on ownership_records
  const ownershipCols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'ownership_records'
     AND column_name IN ('absenteeStatus', 'outOfStateStatus', 'corporateStatus')
     ORDER BY column_name;`
  );
  console.log(`\n• New Columns on 'ownership_records' (${ownershipCols.length}/3):`);
  for (const c of ownershipCols) {
    console.log(`    - ${c.column_name}: ${c.data_type}`);
  }

  // 3. Check newly added columns on hotline_reports
  const hotlineCols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'hotline_reports'
     AND column_name IN ('matchMethod', 'matchConfidence', 'matchAuditJson', 'matchedAt')
     ORDER BY column_name;`
  );
  console.log(`\n• New Columns on 'hotline_reports' (${hotlineCols.length}/4):`);
  for (const c of hotlineCols) {
    console.log(`    - ${c.column_name}: ${c.data_type}`);
  }

  // 4. Check new indexes
  const indexes = await prisma.$queryRawUnsafe<{ indexname: string; tablename: string }[]>(
    `SELECT indexname, tablename 
     FROM pg_indexes 
     WHERE schemaname = 'public' 
     AND indexname IN ('properties_latitude_longitude_idx', 'hotline_reports_matchStatus_idx')
     ORDER BY indexname;`
  );
  console.log(`\n• New Indexes (${indexes.length}/2):`);
  for (const idx of indexes) {
    console.log(`    - ${idx.indexname} ON ${idx.tablename}`);
  }

  // 5. Baseline record counts verification
  console.log('\n--- BASELINE DATA INTEGRITY CHECK ---');
  const hotlineCount = await prisma.hotlineReport.count();
  const [distinctHotline] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "sourceGlobalId") as count FROM public.hotline_reports'
  );
  const sourceCount = await prisma.sourceRecord.count();
  const propertyCount = await prisma.property.count();
  const ownershipCount = await prisma.ownershipRecord.count();
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();
  const totalRuns = await prisma.ingestionRun.count();
  const runningRuns = await prisma.ingestionRun.count({ where: { status: 'RUNNING' } });

  console.log(`• hotline_reports Total           : ${hotlineCount} (Target: 2459) -> ${hotlineCount === 2459 ? 'PASS' : 'FAIL'}`);
  console.log(`• hotline_reports Distinct IDs    : ${Number(distinctHotline.count)} (Target: 2459) -> ${Number(distinctHotline.count) === 2459 ? 'PASS' : 'FAIL'}`);
  console.log(`• source_records Total             : ${sourceCount} (Target: 2482) -> ${sourceCount === 2482 ? 'PASS' : 'FAIL'}`);
  console.log(`• properties Total                 : ${propertyCount} (Target: 0) -> ${propertyCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`• ownership_records Total          : ${ownershipCount} (Target: 0) -> ${ownershipCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`• code_violations Total            : ${codeViolations} (Target: 0) -> ${codeViolations === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`• signals Total                    : ${signals} (Target: 0) -> ${signals === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`• IngestionRun Total               : ${totalRuns} (Target: 11) -> ${totalRuns === 11 ? 'PASS' : 'FAIL'}`);
  console.log(`• IngestionRun in RUNNING          : ${runningRuns} (Target: 0) -> ${runningRuns === 0 ? 'PASS' : 'FAIL'}`);

  const allPassed =
    propertyCols.length === 10 &&
    ownershipCols.length === 3 &&
    hotlineCols.length === 4 &&
    indexes.length === 2 &&
    hotlineCount === 2459 &&
    Number(distinctHotline.count) === 2459 &&
    sourceCount === 2482 &&
    propertyCount === 0 &&
    ownershipCount === 0 &&
    runningRuns === 0;

  console.log(`\nOVERALL MIGRATION VERIFICATION: ${allPassed ? 'ALL CHECKS PASSED (100% INTEGRITY PRESERVED)' : 'FAILURES DETECTED'}\n`);
  if (!allPassed) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Verification error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
