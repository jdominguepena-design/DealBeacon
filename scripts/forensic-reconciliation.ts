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
  console.log('  FORENSIC AUDIT OF NEON DEV DATABASE');
  console.log('========================================================================\n');

  // 1. Both Run IDs Check
  const r1 = await prisma.ingestionRun.findUnique({ where: { id: 'run-parcel-1760070880313' } });
  const r2 = await prisma.ingestionRun.findUnique({ where: { id: 'run-parcel-1791520479990' } });
  console.log('--- 1. RUN ID AUDIT ---');
  console.log('run-parcel-1760070880313:', r1 ? JSON.stringify(r1, null, 2) : 'DOES NOT EXIST IN DATABASE');
  console.log('run-parcel-1791520479990:', r2 ? JSON.stringify(r2, null, 2) : 'DOES NOT EXIST IN DATABASE');

  // 2. All IngestionRuns in Database
  const allRuns = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'asc' },
  });
  console.log('\n--- 2. ALL INGESTION RUNS IN NEON DEV (TOTAL: ' + allRuns.length + ') ---');
  for (const r of allRuns) {
    console.log(`• ID: ${r.id} | Source: ${r.sourceName.padEnd(23)} | Status: ${r.status.padEnd(7)} | Ingested: ${String(r.recordsIngested).padStart(4)} | Started: ${r.startedAt.toISOString()} | Completed: ${r.completedAt?.toISOString() ?? 'null'}`);
  }

  // 3. Current Table Totals via Direct SQL
  console.log('\n--- 3. CURRENT TABLE TOTALS ---');
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
  const hotlineSources = await prisma.sourceRecord.count({
    where: { sourceName: 'OMAHA_HOTLINE' },
  });
  const hotlineReports = await prisma.hotlineReport.count();
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();

  console.log(`• Properties Total:            ${propertyCount}`);
  console.log(`• Distinct parcelId PINs:       ${Number(distinctPins.count)}`);
  console.log(`• OwnershipRecords Total:       ${ownershipCount}`);
  console.log(`• Distinct Property Owners:     ${Number(distinctOwners.count)}`);
  console.log(`• SourceRecords Total:          ${sourceCount}`);
  console.log(`  - Douglas Parcel Sources:     ${parcelSources}`);
  console.log(`  - Omaha Hotline Sources:      ${hotlineSources}`);
  console.log(`• HotlineReports:               ${hotlineReports}`);
  console.log(`• CodeViolations:               ${codeViolations}`);
  console.log(`• Signals:                      ${signals}`);

  // 4. SourceRecord Matching Statuses for Douglas County Parcels
  console.log('\n--- 4. PARCEL SOURCERECORDS MATCHED STATUS BREAKDOWN ---');
  const parcelStatuses = await prisma.sourceRecord.groupBy({
    by: ['matchedStatus'],
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    _count: { id: true },
  });
  for (const s of parcelStatuses) {
    console.log(`• ${s.matchedStatus}: ${s._count.id}`);
  }

  // 5. Source OBJECTID and PIN Coverage Analysis for the Successful Run
  console.log('\n--- 5. OBJECTID & PIN COVERAGE ANALYSIS ---');
  const parcelRecords = await prisma.sourceRecord.findMany({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    select: { sourceRecordId: true, rawPayloadJson: true, propertyId: true, matchedStatus: true, ingestionRunId: true },
    orderBy: { sourceRecordId: 'asc' },
  });

  const oids: number[] = [];
  const pins: string[] = [];
  for (const pr of parcelRecords) {
    const raw = pr.rawPayloadJson as any;
    if (raw.OBJECTID) oids.push(raw.OBJECTID);
    if (raw.PIN) pins.push(raw.PIN);
  }
  oids.sort((a, b) => a - b);
  console.log(`Total Douglas Parcel SourceRecords: ${parcelRecords.length}`);
  console.log(`Distinct PINs in SourceRecords:      ${new Set(pins).size}`);
  console.log(`Distinct OBJECTIDs in SourceRecords: ${new Set(oids).size}`);
  console.log(`OBJECTID Range:                      ${oids[0]} to ${oids[oids.length - 1]}`);

  // Check for gaps in OBJECTIDs
  let gaps = 0;
  for (let i = 0; i < oids.length - 1; i++) {
    if (oids[i + 1] - oids[i] > 1) {
      gaps++;
    }
  }
  console.log(`OBJECTID Gaps between min and max:   ${gaps}`);

  // 6. Audit of the 100 Historical Pilot Properties
  console.log('\n--- 6. AUDIT OF THE 100 HISTORICAL PILOT PROPERTIES ---');
  const initialRun = await prisma.ingestionRun.findUnique({
    where: { id: 'run-parcel-1791518237721' },
  });
  console.log(`Initial 100 Pilot Run ID: ${initialRun?.id} (status=${initialRun?.status}, records=${initialRun?.recordsIngested})`);

  // Classify each of the initial properties
  const boundary = await fetchOmahaMunicipalBoundary();
  const allProperties = await prisma.property.findMany({
    orderBy: { createdAt: 'asc' },
    include: { sourceRecords: true },
  });

  const historical100 = allProperties.slice(0, 100);
  let histInside = 0;
  let histOutside = 0;
  let histCrosses = 0;
  let histUnresolved = 0;

  const histCrossList: string[] = [];
  const histOutList: string[] = [];

  for (const p of historical100) {
    const geo = p.geometryGeoJson as any;
    const rings = geo?.coordinates as number[][][];
    const centroid = p.latitude && p.longitude ? { lat: p.latitude, lon: p.longitude } : null;
    const res = classifyParcelMunicipalJurisdiction(rings, boundary, centroid);
    if (res.outcome === 'INSIDE_OMAHA') histInside++;
    else if (res.outcome === 'OUTSIDE_OMAHA') {
      histOutside++;
      histOutList.push(`${p.parcelId} (${p.address})`);
    } else if (res.outcome === 'CROSSES_BOUNDARY') {
      histCrosses++;
      histCrossList.push(`${p.parcelId} (${p.address})`);
    } else histUnresolved++;
  }

  console.log(`Historical 100 Properties Classification:`);
  console.log(`• INSIDE_OMAHA:     ${histInside}`);
  console.log(`• OUTSIDE_OMAHA:    ${histOutside}`);
  console.log(`• CROSSES_BOUNDARY: ${histCrosses}`);
  console.log(`• UNRESOLVED:       ${histUnresolved}`);
  console.log(`\nHistorical Boundary-Crossing Properties (${histCrossList.length}):`);
  for (const item of histCrossList) console.log(`  - ${item}`);
  console.log(`\nHistorical Outside-Omaha Properties Sample (${histOutList.length} total):`);
  for (const item of histOutList.slice(0, 5)) console.log(`  - ${item}`);

  // 7. Check IngestionRun recordsIngested across all parcel runs
  console.log('\n--- 7. PARCEL INGESTION RUNS IN DATABASE ---');
  const parcelRuns = await prisma.ingestionRun.findMany({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    orderBy: { startedAt: 'asc' },
  });
  for (const pr of parcelRuns) {
    console.log(`• Run ID: ${pr.id}`);
    console.log(`  Status: ${pr.status}`);
    console.log(`  Records Ingested: ${pr.recordsIngested}`);
    console.log(`  Started: ${pr.startedAt.toISOString()}`);
    console.log(`  Completed: ${pr.completedAt?.toISOString()}`);
    const st = pr.statsJson as any;
    if (st) {
      console.log(`  StatsJson: fetched=${st.fetched}, inserted=${st.inserted}, updated=${st.updated}, skipped=${st.skipped}, quarantined=${st.quarantined}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal Forensic Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
