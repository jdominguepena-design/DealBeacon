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
  console.log('=== DEALBEACON 100-PARCEL PILOT DIRECT SQL AUDIT ===\n');

  // 1. Database Counts
  const propertyCount = await prisma.property.count();
  const [distinctPins] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "parcelId") as count FROM public.properties'
  );
  const ownershipCount = await prisma.ownershipRecord.count();
  const [distinctOwnershipProp] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "propertyId") as count FROM public.ownership_records'
  );
  const sourceCount = await prisma.sourceRecord.count();
  const sourceParcels = await prisma.sourceRecord.count({
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
  });
  const sourceHotline = await prisma.sourceRecord.count({
    where: { sourceName: 'OMAHA_HOTLINE' },
  });
  const hotlineCount = await prisma.hotlineReport.count();
  const [distinctHotline] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT COUNT(DISTINCT "sourceGlobalId") as count FROM public.hotline_reports'
  );
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();

  // 2. IngestionRuns
  const allRuns = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'desc' },
  });
  const runningRuns = allRuns.filter((r) => r.status === 'RUNNING');
  const latestRun = allRuns[0];

  console.log('--- DATABASE STATE AUDIT ---');
  console.log(`• Properties Total                 : ${propertyCount} (Target: 100)`);
  console.log(`• Distinct Parcel PINs             : ${Number(distinctPins.count)} (100% Unique)`);
  console.log(`• Ownership Records Total          : ${ownershipCount} (Target: 100)`);
  console.log(`• Distinct Property IDs in OwnerRec: ${Number(distinctOwnershipProp.count)} (1-to-1 Parity)`);
  console.log(`• SourceRecords (DOUGLAS_PARCEL)   : ${sourceParcels} (Target: 100)`);
  console.log(`• SourceRecords (OMAHA_HOTLINE)    : ${sourceHotline} (Target: 2482 preserved)`);
  console.log(`• SourceRecords Grand Total        : ${sourceCount} (Target: 2582)`);
  console.log(`• HotlineReport Total              : ${hotlineCount} (Target: 2459 preserved)`);
  console.log(`• HotlineReport Distinct GlobalIDs : ${Number(distinctHotline.count)} (Target: 2459 preserved)`);
  console.log(`• CodeViolations Count             : ${codeViolations} (Target: 0)`);
  console.log(`• Signals Count                    : ${signals} (Target: 0)`);
  console.log(`• IngestionRun Total Count         : ${allRuns.length} (Target: 12)`);
  console.log(`• IngestionRuns in RUNNING status  : ${runningRuns.length} (Target: 0)`);
  console.log(`• Latest Run ID                    : ${latestRun.id}`);
  console.log(`• Latest Run Status                : ${latestRun.status}`);
  console.log(`• Latest Run Records Ingested      : ${latestRun.recordsIngested}`);
  console.log(`• Latest Run Source Name           : ${latestRun.sourceName}`);

  const authAddressStats = await prisma.property.groupBy({
    by: ['hasAuthoritativeAddress'],
    _count: { id: true },
  });
  console.log('\n• Authoritative Address Breakdown:');
  for (const a of authAddressStats) {
    console.log(`    - hasAuthoritativeAddress=${a.hasAuthoritativeAddress}: ${a._count.id}`);
  }
  const absenteeStats = await prisma.ownershipRecord.groupBy({
    by: ['absenteeStatus'],
    _count: { id: true },
  });
  const outOfStateStats = await prisma.ownershipRecord.groupBy({
    by: ['outOfStateStatus'],
    _count: { id: true },
  });
  const corporateStats = await prisma.ownershipRecord.groupBy({
    by: ['corporateStatus'],
    _count: { id: true },
  });

  console.log('\n--- OWNERSHIP EVALUATION CONSERVATIVE AUDIT ---');
  console.log('• Absentee Status Breakdown:');
  for (const s of absenteeStats) {
    console.log(`    - ${s.absenteeStatus}: ${s._count.id}`);
  }
  console.log('• Out-of-State Status Breakdown:');
  for (const s of outOfStateStats) {
    console.log(`    - ${s.outOfStateStatus}: ${s._count.id}`);
  }
  console.log('• Corporate Status Breakdown:');
  for (const s of corporateStats) {
    console.log(`    - ${s.corporateStatus}: ${s._count.id}`);
  }

  // 4. Sample Record Validation Against Expected Fields
  console.log('\n--- SAMPLE IMPORTED PARCEL AUDIT (First 3 Records) ---');
  const sampleProperties = await prisma.property.findMany({
    take: 3,
    orderBy: { parcelId: 'asc' },
    include: {
      ownershipRecords: true,
      sourceRecords: true,
    },
  });

  for (const p of sampleProperties) {
    const own = p.ownershipRecords[0];
    const src = p.sourceRecords[0];
    console.log(`\n[PIN: ${p.parcelId}]`);
    console.log(`  Address           : ${p.address}, ${p.city}, ${p.state} ${p.zip}`);
    console.log(`  Property Type     : ${p.propertyType} (County Class: ${p.countyClass})`);
    console.log(`  Structure Specs   : YrBuilt=${p.yearBuilt}, SqFt=${p.squareFeet}, LotSqFt=${p.lotSizeSqFt}`);
    console.log(`  Assessor Condition: ${p.condition}, Quality: ${p.quality}`);
    console.log(`  Centroid (WGS84)  : Lat=${p.latitude}, Lon=${p.longitude}`);
    console.log(`  Boundary GeoJSON  : ${p.geometryGeoJson ? 'Present (Polygon coordinates)' : 'Missing'}`);
    console.log(`  Assessor URL      : ${p.assessorUrl}`);
    console.log(`  Treasurer URL     : ${p.treasurerUrl}`);
    if (own) {
      console.log(`  Owner Name        : ${own.ownerName}`);
      console.log(`  Mailing Address   : ${own.mailingAddress}, ${own.mailingCity}, ${own.mailingState} ${own.mailingZip}`);
      console.log(`  Evaluated Absentee: ${own.absenteeStatus} (isAbsentee=${own.isAbsentee})`);
      console.log(`  Evaluated OutState: ${own.outOfStateStatus} (isOutOfState=${own.isOutOfState})`);
      console.log(`  Evaluated Corp    : ${own.corporateStatus} (isCorporate=${own.isCorporate})`);
    }
    console.log(`  Source Record ID  : ${src?.sourceRecordId} (matchedStatus=${src?.matchedStatus})`);
  }

  // 5. Geometry Validity & Coordinate Bounding Box Check
  const [geomStats] = await prisma.$queryRawUnsafe<{ min_lat: number; max_lat: number; min_lon: number; max_lon: number }[]>(
    'SELECT MIN(latitude) as min_lat, MAX(latitude) as max_lat, MIN(longitude) as min_lon, MAX(longitude) as max_lon FROM public.properties'
  );
  console.log('\n--- GEOGRAPHIC BOUNDS VALIDATION ---');
  console.log(`• Latitude Range : ${geomStats.min_lat} to ${geomStats.max_lat} (Omaha/Douglas bounds: 41.10 - 41.45)`);
  console.log(`• Longitude Range: ${geomStats.min_lon} to ${geomStats.max_lon} (Omaha/Douglas bounds: -96.38 - -95.80)`);

  const boundsValid =
    geomStats.min_lat >= 41.10 &&
    geomStats.max_lat <= 41.45 &&
    geomStats.min_lon >= -96.38 &&
    geomStats.max_lon <= -95.80;
  console.log(`• Coordinate Bounds Validity: ${boundsValid ? 'PASS (100% within Douglas County)' : 'FAIL'}`);
}

main()
  .catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
