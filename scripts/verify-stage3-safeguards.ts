import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();

const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('  PHASE 2B STAGE 3: DIRECT SQL & DATABASE SAFEGUARD VERIFICATION');
  console.log('========================================================================\n');

  console.log('1. Target Endpoint Verification:');
  console.log(`   • Expected Endpoint: ${preflight.expectedEndpointId}`);
  console.log(`   • Pooled Host:       ${preflight.pooledHost}`);
  console.log(`   • Direct Host:       ${preflight.directHost}\n`);

  // Direct SQL Schema Check
  console.log('2. Direct SQL Column Definition Check:');
  const [colInfo] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT column_name, udt_name, column_default, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'municipalJurisdiction'
  `);
  console.log(`   • Column:    ${colInfo?.column_name}`);
  console.log(`   • UDT Type:  ${colInfo?.udt_name}`);
  console.log(`   • Default:   ${colInfo?.column_default}`);
  console.log(`   • Nullable:  ${colInfo?.is_nullable}\n`);

  // Direct SQL Breakdown of Municipal Jurisdiction
  console.log('3. Direct SQL Municipal Jurisdiction Grouping:');
  const sqlBreakdown = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "municipalJurisdiction", COUNT(*)::int as count 
    FROM public.properties 
    GROUP BY "municipalJurisdiction" 
    ORDER BY count DESC
  `);
  for (const row of sqlBreakdown) {
    console.log(`   • ${row.municipalJurisdiction}: ${row.count}`);
  }

  // Cross-Boundary PIN Check
  console.log('\n4. Cross-Boundary Properties (Preserved for Audit):');
  const boundaryCrossing = await prisma.property.findMany({
    where: { municipalJurisdiction: 'CROSSES_BOUNDARY' },
    select: { parcelId: true, address: true, municipalJurisdiction: true },
    orderBy: { parcelId: 'asc' },
  });
  for (const b of boundaryCrossing) {
    console.log(`   • PIN ${b.parcelId}: ${b.address} (${b.municipalJurisdiction})`);
  }

  // Baseline Counters Check
  console.log('\n5. Baseline Database Record Counts:');
  const propertiesCount = await prisma.property.count();
  const [distinctPins] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "parcelId") as count FROM public.properties'
  );
  const ownershipCount = await prisma.ownershipRecord.count();
  const sourceTotal = await prisma.sourceRecord.count();
  const sourceParcels = await prisma.sourceRecord.count({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
  });
  const sourceHotline = await prisma.sourceRecord.count({
    where: { sourceName: 'OMAHA_HOTLINE' },
  });
  const hotlineCount = await prisma.hotlineReport.count();
  const violationCount = await prisma.codeViolation.count();
  const signalCount = await prisma.signal.count();
  const runsCount = await prisma.ingestionRun.count();
  const runningRuns = await prisma.ingestionRun.count({
    where: { status: 'RUNNING' },
  });

  console.log(`   • Total Properties:          ${propertiesCount} (Expected: 248)`);
  console.log(`   • Distinct Parcel PINs:       ${Number(distinctPins.count)} (Expected: 248)`);
  console.log(`   • Total Ownership Records:   ${ownershipCount} (Expected: 248)`);
  console.log(`   • Total Source Records:      ${sourceTotal} (Expected: 2732)`);
  console.log(`   • Parcel Source Records:     ${sourceParcels} (Expected: 250)`);
  console.log(`   • Hotline Source Records:    ${sourceHotline} (Expected: 2482)`);
  console.log(`   • Hotline Reports:           ${hotlineCount} (Expected: 2459)`);
  console.log(`   • Code Violations:           ${violationCount} (Expected: 0)`);
  console.log(`   • Derived Signals:           ${signalCount} (Expected: 0)`);
  console.log(`   • Ingestion Runs:            ${runsCount} (Expected: 13)`);
  console.log(`   • Ingestion Runs (RUNNING):   ${runningRuns} (Expected: 0)`);

  // Investor Query Filtered Count Check
  console.log('\n6. Investor Query Predicate Count:');
  const investorEligibleCount = await prisma.property.count({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
  });
  const auditPreservedCount = await prisma.property.count({
    where: { municipalJurisdiction: { in: ['OUTSIDE_OMAHA', 'CROSSES_BOUNDARY'] } },
  });
  console.log(`   • Investor-Eligible Properties: ${investorEligibleCount} (Expected: 212)`);
  console.log(`   • Audit-Preserved Ineligible:   ${auditPreservedCount} (Expected: 36)`);

  console.log('\n========================================================================');
  console.log('  VERIFICATION COMPLETE - ALL DIRECT SQL CHECKS CONCLUDED');
  console.log('========================================================================');
}

main()
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
