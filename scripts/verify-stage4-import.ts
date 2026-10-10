import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();

const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('  PHASE 2B STAGE 4: POST-IMPORT DIRECT SQL & AUDIT VERIFICATION');
  console.log('========================================================================\n');

  console.log('1. Target Endpoint Verification:');
  console.log(`   • Expected Endpoint: ${preflight.expectedEndpointId}`);
  console.log(`   • Pooled Host:       ${preflight.pooledHost}`);
  console.log(`   • Direct Host:       ${preflight.directHost}\n`);

  // Direct SQL Breakdown of Municipal Jurisdiction
  console.log('2. Direct SQL Municipal Jurisdiction Grouping:');
  const sqlBreakdown = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "municipalJurisdiction", COUNT(*)::int as count 
    FROM public.properties 
    GROUP BY "municipalJurisdiction" 
    ORDER BY count DESC
  `);
  for (const row of sqlBreakdown) {
    console.log(`   • ${row.municipalJurisdiction}: ${row.count}`);
  }

  // Database Counts
  console.log('\n3. Database Record Counts:');
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
  const quarantinedSourceRecords = await prisma.sourceRecord.count({
    where: {
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
      matchedStatus: 'QUARANTINED',
    },
  });
  const hotlineCount = await prisma.hotlineReport.count();
  const violationCount = await prisma.codeViolation.count();
  const signalCount = await prisma.signal.count();
  const runsCount = await prisma.ingestionRun.count();
  const runningRuns = await prisma.ingestionRun.count({
    where: { status: 'RUNNING' },
  });

  console.log(`   • Total Properties:            ${propertiesCount}`);
  console.log(`   • Distinct Parcel PINs:         ${Number(distinctPins.count)}`);
  console.log(`   • Total Ownership Records:     ${ownershipCount}`);
  console.log(`   • Total Source Records:        ${sourceTotal}`);
  console.log(`   • Parcel Source Records:       ${sourceParcels}`);
  console.log(`   • Quarantined Source Records:  ${quarantinedSourceRecords}`);
  console.log(`   • Hotline Source Records:      ${sourceHotline}`);
  console.log(`   • Hotline Reports:             ${hotlineCount}`);
  console.log(`   • Code Violations:             ${violationCount}`);
  console.log(`   • Derived Signals:             ${signalCount}`);
  console.log(`   • Ingestion Runs:              ${runsCount}`);
  console.log(`   • Ingestion Runs (RUNNING):     ${runningRuns}`);

  // Latest IngestionRun inspection
  console.log('\n4. Latest IngestionRun Inspection:');
  const latestRun = await prisma.ingestionRun.findFirst({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    orderBy: { startedAt: 'desc' },
  });
  console.log(`   • Run ID:          ${latestRun?.id}`);
  console.log(`   • Status:          ${latestRun?.status}`);
  console.log(`   • Started At:      ${latestRun?.startedAt?.toISOString()}`);
  console.log(`   • Completed At:    ${latestRun?.completedAt?.toISOString()}`);
  console.log(`   • Records Ingested: ${latestRun?.recordsIngested}`);
  console.log(`   • Stats JSON:      `, JSON.stringify(latestRun?.statsJson, null, 2));

  // OBJECTID range and gaps
  console.log('\n5. SourceRecord OBJECTID Distribution & Gaps:');
  const [oidStats] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      MIN(("rawPayloadJson"->>'OBJECTID')::int) as min_oid,
      MAX(("rawPayloadJson"->>'OBJECTID')::int) as max_oid,
      COUNT(*)::int as total_records
    FROM public.source_records 
    WHERE "sourceName" = 'DOUGLAS_COUNTY_ASSESSOR'
  `);
  console.log(`   • Min OBJECTID: ${oidStats?.min_oid}`);
  console.log(`   • Max OBJECTID: ${oidStats?.max_oid}`);
  console.log(`   • Total Parcel SourceRecords: ${oidStats?.total_records}`);

  // Check for duplicate sourceRecordId
  const [dupCheck] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*) - COUNT(DISTINCT "sourceRecordId") as dups
    FROM public.source_records
    WHERE "sourceName" = 'DOUGLAS_COUNTY_ASSESSOR'
  `);
  console.log(`   • Duplicate SourceRecord IDs: ${dupCheck?.dups ?? 0}`);

  // Cross-Boundary & Quarantined Parcels Detail
  console.log('\n6. Cross-Boundary & Quarantined Parcels in Neon DEV:');
  const quarantinedRecords = await prisma.sourceRecord.findMany({
    where: {
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
      matchedStatus: 'QUARANTINED',
    },
    select: {
      sourceRecordId: true,
      rawPayloadJson: true,
    },
    orderBy: { sourceRecordId: 'asc' },
  });
  console.log(`   Total Quarantined SourceRecords: ${quarantinedRecords.length}`);
  for (const q of quarantinedRecords) {
    const payload = q.rawPayloadJson as any;
    console.log(`   • ${q.sourceRecordId}: PIN ${payload?.PIN} (${payload?.PROPERTY_A ?? '[UNASSIGNED]'}) => ${payload?.boundaryClassification?.outcome}`);
    console.log(`     Reason: ${payload?.quarantineReason}`);
  }

  // Investor-Eligible Count
  console.log('\n7. Centralized Investor Eligibility Count:');
  const investorEligible = await prisma.property.count({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
  });
  const auditPreservedIneligible = await prisma.property.count({
    where: { municipalJurisdiction: { in: ['OUTSIDE_OMAHA', 'CROSSES_BOUNDARY'] } },
  });
  console.log(`   • Investor-Eligible Properties: ${investorEligible}`);
  console.log(`   • Audit-Preserved Ineligible:   ${auditPreservedIneligible}`);

  console.log('\n========================================================================');
  console.log('  VERIFICATION COMPLETE');
  console.log('========================================================================');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
