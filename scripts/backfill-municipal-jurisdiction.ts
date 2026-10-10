import { PrismaClient, MunicipalJurisdiction } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { fetchOmahaMunicipalBoundary, classifyParcelMunicipalJurisdiction } from '../src/lib/geo/municipal-boundary';
import { GeoPoint } from '../src/lib/geo/types';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: Target Dev "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

async function main() {
  console.log('=== PHASE 2B STAGE 3: MUNICIPAL JURISDICTION BACKFILL ===\n');

  console.log('Fetching authoritative MAPA Omaha Municipal Boundary...');
  const boundary = await fetchOmahaMunicipalBoundary();
  console.log(`Boundary fetched: ${boundary.cityName}, ${boundary.ringsCount} rings\n`);

  const properties = await prisma.property.findMany({
    select: {
      id: true,
      parcelId: true,
      address: true,
      latitude: true,
      longitude: true,
      geometryGeoJson: true,
      municipalJurisdiction: true,
    },
    orderBy: { parcelId: 'asc' },
  });

  console.log(`Fetched ${properties.length} properties from Neon DEV.`);
  if (properties.length !== 248) {
    throw new Error(`Expected exactly 248 properties, but found ${properties.length}`);
  }

  const counts: Record<MunicipalJurisdiction, number> = {
    INSIDE_OMAHA: 0,
    OUTSIDE_OMAHA: 0,
    CROSSES_BOUNDARY: 0,
    UNRESOLVED: 0,
  };

  const classifications: Array<{
    id: string;
    parcelId: string;
    outcome: MunicipalJurisdiction;
  }> = [];

  for (const p of properties) {
    const geo = p.geometryGeoJson as any;
    const rings = (geo?.coordinates ?? null) as number[][][] | null;
    const centroid: GeoPoint | null =
      p.latitude !== null && p.longitude !== null
        ? { lat: p.latitude, lon: p.longitude }
        : null;

    const result = classifyParcelMunicipalJurisdiction(rings, boundary, centroid);
    const outcome = result.outcome as MunicipalJurisdiction;
    counts[outcome]++;
    classifications.push({ id: p.id, parcelId: p.parcelId, outcome });
  }

  console.log('\n--- CLASSIFICATION AUDIT RESULTS ---');
  console.log(`INSIDE_OMAHA:     ${counts.INSIDE_OMAHA} (Expected: 212)`);
  console.log(`OUTSIDE_OMAHA:    ${counts.OUTSIDE_OMAHA} (Expected: 34)`);
  console.log(`CROSSES_BOUNDARY: ${counts.CROSSES_BOUNDARY} (Expected: 2)`);
  console.log(`UNRESOLVED:       ${counts.UNRESOLVED} (Expected: 0)`);
  console.log(`TOTAL:            ${classifications.length} (Expected: 248)\n`);

  // Verify against strict expected counts
  if (
    counts.INSIDE_OMAHA !== 212 ||
    counts.OUTSIDE_OMAHA !== 34 ||
    counts.CROSSES_BOUNDARY !== 2 ||
    counts.UNRESOLVED !== 0
  ) {
    console.error('❌ DIVERGENCE DETECTED! Counts do not match expected Stage 3 distribution.');
    for (const c of classifications) {
      if (c.outcome === 'CROSSES_BOUNDARY' || c.outcome === 'OUTSIDE_OMAHA') {
        console.log(`- [${c.outcome}] PIN ${c.parcelId}`);
      }
    }
    throw new Error('Aborting backfill due to count divergence.');
  }

  console.log('✔ Counts match expected distribution exactly! Proceeding with database backfill...');

  // Perform transactional or batched updates
  let updatedCount = 0;
  for (const c of classifications) {
    await prisma.property.update({
      where: { id: c.id },
      data: {
        municipalJurisdiction: c.outcome,
      },
    });
    updatedCount++;
  }

  console.log(`✔ Successfully updated ${updatedCount} properties in Neon DEV.`);

  // Verify directly via database grouping
  const dbGrouped = await prisma.property.groupBy({
    by: ['municipalJurisdiction'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('\n--- POST-BACKFILL VERIFICATION FROM NEON DEV DB ---');
  for (const g of dbGrouped) {
    console.log(`  ${g.municipalJurisdiction}: ${g._count.id}`);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error during backfill:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
