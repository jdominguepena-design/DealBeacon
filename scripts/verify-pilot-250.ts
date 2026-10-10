import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { fetchOmahaMunicipalBoundary, classifyParcelMunicipalJurisdiction } from '../src/lib/geo/municipal-boundary';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('  PHASE 2B: 250-RECORD CONTROLLED PILOT INGESTION VERIFICATION');
  console.log('========================================================================\n');

  // 1. IngestionRun Check
  const latestRun = await prisma.ingestionRun.findFirst({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    orderBy: { startedAt: 'desc' },
  });

  console.log('--- 1. LATEST INGESTION RUN STATUS ---');
  console.log(`Run ID:            ${latestRun?.id}`);
  console.log(`Status:            ${latestRun?.status}`);
  console.log(`Records Ingested:  ${latestRun?.recordsIngested}`);
  console.log(`Started At:        ${latestRun?.startedAt.toISOString()}`);
  console.log(`Completed At:      ${latestRun?.completedAt?.toISOString()}`);

  const runningRuns = await prisma.ingestionRun.count({ where: { status: 'RUNNING' } });
  console.log(`Remaining RUNNING: ${runningRuns}\n`);

  const stats = (latestRun?.statsJson ?? {}) as any;
  console.log('--- 2. INGESTION RUN DETAILED METRICS ---');
  console.log(`Source Parcels Examined:        ${stats.fetched}`);
  console.log(`• INSIDE_OMAHA:                 ${stats.insideOmaha}`);
  console.log(`• OUTSIDE_OMAHA (Skipped):      ${stats.outsideOmahaSkipped}`);
  console.log(`• CROSSES_BOUNDARY (Quarantine):${stats.crossesBoundaryQuarantined}`);
  console.log(`• UNRESOLVED (Quarantine):      ${stats.unresolvedQuarantined}`);
  console.log(`• Total Quarantined:            ${stats.quarantined}`);
  console.log(`• Actual New Property Inserts:  ${stats.inserted}`);
  console.log(`• Existing Property Updates:    ${stats.updated}`);
  console.log(`• Unchanged Properties:         ${stats.unchanged}`);
  console.log(`• Total Skipped:                ${stats.skipped}`);
  console.log(`• Failed:                       ${stats.failed}\n`);

  // 3. Database Table Counts via Direct SQL
  console.log('--- 3. DIRECT SQL RECORD COUNTS ---');
  const propertyCount = await prisma.property.count();
  const [distinctPins] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "parcelId") as count FROM public.properties'
  );
  const ownershipCount = await prisma.ownershipRecord.count();
  const [distinctOwners] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "propertyId") as count FROM public.ownership_records'
  );
  const sourceCount = await prisma.sourceRecord.count();
  const parcelSources = await prisma.sourceRecord.count({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
  });
  const quarantinedSources = await prisma.sourceRecord.count({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR', matchedStatus: 'QUARANTINED' },
  });
  const hotlineCount = await prisma.hotlineReport.count();
  const violationsCount = await prisma.codeViolation.count();
  const signalsCount = await prisma.signal.count();

  console.log(`• Total Properties:             ${propertyCount}`);
  console.log(`• Unique Property PINs:         ${Number(distinctPins.count)}`);
  console.log(`• Total OwnershipRecords:       ${ownershipCount} (Unique property links: ${Number(distinctOwners.count)})`);
  console.log(`• Total SourceRecords:          ${sourceCount}`);
  console.log(`  - Douglas Parcel Sources:     ${parcelSources}`);
  console.log(`  - Quarantined Sources:        ${quarantinedSources}`);
  console.log(`• HotlineReport Count:          ${hotlineCount} (MUST be 2,459)`);
  console.log(`• CodeViolation Count:          ${violationsCount} (MUST be 0)`);
  console.log(`• Signal Count:                 ${signalsCount} (MUST be 0)\n`);

  // 4. Sample Verification of Imported PINs Against Geometry
  console.log('--- 4. SAMPLE VERIFICATION OF IMPORTED PINS AGAINST MAPA BOUNDARY ---');
  const boundary = await fetchOmahaMunicipalBoundary();
  
  // Pick 5 newly inserted properties and 5 existing properties
  const sampleProperties = await prisma.property.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  for (const p of sampleProperties) {
    const geo = p.geometryGeoJson as any;
    const rings = geo?.coordinates as number[][][];
    const centroid = p.latitude && p.longitude ? { lat: p.latitude, lon: p.longitude } : null;
    const result = classifyParcelMunicipalJurisdiction(rings, boundary, centroid);
    console.log(`• PIN ${p.parcelId} (${p.address}):`);
    console.log(`  Outcome: ${result.outcome} | Vertices inside: ${result.insideVertices}/${result.totalVertices} | Centroid inside: ${result.centroidInsideBoundary}`);
    console.log(`  Authoritative Address: ${p.hasAuthoritativeAddress} | County Class: ${p.countyClass}`);
  }

  // 5. Quarantined Records Verification
  console.log('\n--- 5. QUARANTINED RECORDS AUDIT ---');
  const quarantinedInDb = await prisma.sourceRecord.findMany({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR', matchedStatus: 'QUARANTINED' },
    select: { sourceRecordId: true, propertyId: true, rawPayloadJson: true },
  });
  console.log(`Found ${quarantinedInDb.length} quarantined SourceRecords in database:`);
  for (const q of quarantinedInDb) {
    const raw = q.rawPayloadJson as any;
    console.log(`• ${q.sourceRecordId}: propertyId=${q.propertyId ?? 'NULL (unassigned)'}`);
    console.log(`  Address: ${raw.PROPERTY_A ?? '[UNASSIGNED]'}`);
    console.log(`  Outcome: ${raw.boundaryClassification?.outcome}`);
    console.log(`  Reason:  ${raw.quarantineReason}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal Verification Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
