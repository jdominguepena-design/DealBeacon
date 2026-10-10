import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { fetchOmahaMunicipalBoundary, classifyParcelMunicipalJurisdiction } from '../src/lib/geo/municipal-boundary';
import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';
import { GeoPoint } from '../src/lib/geo/types';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

interface ClassificationStats {
  examined: number;
  insideOmaha: number;
  outsideOmaha: number;
  crossesBoundary: number;
  unresolved: number;
  centroidOutsidePolygonCount: number;
  representativePointShiftedCount: number;
  propCityMatrix: {
    propCityOmaha_insideOmaha: number;
    propCityOmaha_outsideOmaha: number;
    propCityOmaha_crosses: number;
    propCityOmaha_unresolved: number;
    propCityNotOmaha_insideOmaha: number;
    propCityNotOmaha_outsideOmaha: number;
    propCityNotOmaha_crosses: number;
    propCityNotOmaha_unresolved: number;
  };
  discrepancies: Array<{
    pin: string;
    address: string;
    propCity: string;
    outcome: string;
    notes: string;
  }>;
}

function createEmptyStats(): ClassificationStats {
  return {
    examined: 0,
    insideOmaha: 0,
    outsideOmaha: 0,
    crossesBoundary: 0,
    unresolved: 0,
    centroidOutsidePolygonCount: 0,
    representativePointShiftedCount: 0,
    propCityMatrix: {
      propCityOmaha_insideOmaha: 0,
      propCityOmaha_outsideOmaha: 0,
      propCityOmaha_crosses: 0,
      propCityOmaha_unresolved: 0,
      propCityNotOmaha_insideOmaha: 0,
      propCityNotOmaha_outsideOmaha: 0,
      propCityNotOmaha_crosses: 0,
      propCityNotOmaha_unresolved: 0,
    },
    discrepancies: [],
  };
}

async function main() {
  console.log('========================================================================');
  console.log('  PHASE 2B STAGE 2: OMAHA MUNICIPAL BOUNDARY DRY-RUN AUDIT');
  console.log('========================================================================\n');

  // 1. Fetch authoritative MAPA Omaha Municipal Boundary
  console.log('--- STEP 1: FETCH AUTHORITATIVE MAPA OMAHA MUNICIPAL BOUNDARY ---');
  const boundary = await fetchOmahaMunicipalBoundary();
  console.log(`• Jurisdiction: ${boundary.cityName} (FIPS: ${boundary.sourceFips})`);
  console.log(`• Total Area: ${boundary.sqMiles.toFixed(2)} sq miles`);
  console.log(`• Rings: ${boundary.ringsCount} total (${boundary.exteriorRings.length} exterior, ${boundary.holeRings.length} interior holes/enclaves)`);
  console.log(`• Bounding Box: Lon [${boundary.totalBounds.minLon.toFixed(4)}, ${boundary.totalBounds.maxLon.toFixed(4)}], Lat [${boundary.totalBounds.minLat.toFixed(4)}, ${boundary.totalBounds.maxLat.toFixed(4)}]\n`);

  // 2. Part A: Audit 100 Pilot Parcels in Neon Dev DB
  console.log('--- STEP 2: AUDIT 100 PILOT PARCELS IN NEON DEV DATABASE ---');
  const properties = await prisma.property.findMany({
    orderBy: { parcelId: 'asc' },
    include: {
      sourceRecords: true,
    },
  });
  console.log(`• Found ${properties.length} properties in Neon dev.\n`);

  const dbStats = createEmptyStats();

  for (const p of properties) {
    dbStats.examined++;
    const geo = p.geometryGeoJson as any;
    const rings = geo?.coordinates as number[][][];
    const centroid: GeoPoint | null =
      p.latitude !== null && p.longitude !== null
        ? { lat: p.latitude, lon: p.longitude }
        : null;

    // Get raw PROP_CITY from SourceRecord payload
    const rawPayload = (p.sourceRecords[0]?.rawPayloadJson ?? {}) as any;
    const propCity = (rawPayload?.PROP_CITY ?? p.city ?? '').trim().toUpperCase();

    const result = classifyParcelMunicipalJurisdiction(rings, boundary, centroid);

    // Track classification outcomes
    if (result.outcome === 'INSIDE_OMAHA') dbStats.insideOmaha++;
    else if (result.outcome === 'OUTSIDE_OMAHA') dbStats.outsideOmaha++;
    else if (result.outcome === 'CROSSES_BOUNDARY') dbStats.crossesBoundary++;
    else dbStats.unresolved++;

    // Track centroid vs representative point
    if (result.interiorRepresentativePoint && centroid) {
      const dist = Math.hypot(
        result.interiorRepresentativePoint.lat - centroid.lat,
        result.interiorRepresentativePoint.lon - centroid.lon
      );
      if (dist > 0.00001) {
        dbStats.representativePointShiftedCount++;
      }
    }

    // Update PROP_CITY cross-tabulation
    const isOmaha = propCity === 'OMAHA';
    if (isOmaha) {
      if (result.outcome === 'INSIDE_OMAHA') dbStats.propCityMatrix.propCityOmaha_insideOmaha++;
      else if (result.outcome === 'OUTSIDE_OMAHA') {
        dbStats.propCityMatrix.propCityOmaha_outsideOmaha++;
        dbStats.discrepancies.push({
          pin: p.parcelId,
          address: p.address,
          propCity,
          outcome: result.outcome,
          notes: result.notes.join('; '),
        });
      } else if (result.outcome === 'CROSSES_BOUNDARY') {
        dbStats.propCityMatrix.propCityOmaha_crosses++;
        dbStats.discrepancies.push({
          pin: p.parcelId,
          address: p.address,
          propCity,
          outcome: result.outcome,
          notes: result.notes.join('; '),
        });
      } else {
        dbStats.propCityMatrix.propCityOmaha_unresolved++;
      }
    } else {
      if (result.outcome === 'INSIDE_OMAHA') {
        dbStats.propCityMatrix.propCityNotOmaha_insideOmaha++;
        dbStats.discrepancies.push({
          pin: p.parcelId,
          address: p.address,
          propCity,
          outcome: result.outcome,
          notes: result.notes.join('; '),
        });
      } else if (result.outcome === 'OUTSIDE_OMAHA') {
        dbStats.propCityMatrix.propCityNotOmaha_outsideOmaha++;
      } else if (result.outcome === 'CROSSES_BOUNDARY') {
        dbStats.propCityMatrix.propCityNotOmaha_crosses++;
        dbStats.discrepancies.push({
          pin: p.parcelId,
          address: p.address,
          propCity,
          outcome: result.outcome,
          notes: result.notes.join('; '),
        });
      } else {
        dbStats.propCityMatrix.propCityNotOmaha_unresolved++;
      }
    }
  }

  // 3. Part B: Live Douglas County Sample Across Urban Core, Enclaves, and Periphery
  console.log('--- STEP 3: LIVE ARCGIS SAMPLE AUDIT (URBAN CORE, ENCLAVES, PERIPHERY) ---');
  
  // Sample 50 urban Omaha, 25 enclave (Ralston / Boys Town / Carter Lake), 25 periphery (Bennington / Valley / Waterloo)
  const queryBatches = [
    { label: 'Urban Omaha Core', where: "PROP_CITY = 'OMAHA'", limit: 50 },
    { label: 'Enclaves (Ralston / Boys Town / Carter Lake)', where: "PROP_CITY IN ('RALSTON', 'BOYS TOWN', 'CARTER LAKE')", limit: 25 },
    { label: 'County Periphery (Bennington / Valley / Waterloo)', where: "PROP_CITY IN ('BENNINGTON', 'VALLEY', 'WATERLOO')", limit: 25 },
  ];

  const liveStats = createEmptyStats();

  for (const q of queryBatches) {
    console.log(`• Fetching sample: ${q.label} (limit ${q.limit})...`);
    const params = new URLSearchParams({
      where: q.where,
      outFields: 'OBJECTID,PIN,PROPERTY_A,PROP_CITY,PROP_ZIP',
      outSR: '4326',
      returnGeometry: 'true',
      resultRecordCount: String(q.limit),
      f: 'json',
    });

    const res = await fetch(`${DOUGLAS_PARCEL_CONFIG.endpoint}?${params.toString()}`);
    if (!res.ok) {
      console.warn(`  Warning: Failed to fetch live sample batch: HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as any;
    const features = data.features ?? [];
    console.log(`  Received ${features.length} features.`);

    for (const f of features) {
      liveStats.examined++;
      const attrs = f.attributes;
      const rings = f.geometry?.rings as number[][][];
      const pin = attrs.PIN ?? 'UNKNOWN';
      const address = attrs.PROPERTY_A ?? '[UNASSIGNED]';
      const propCity = (attrs.PROP_CITY ?? '').trim().toUpperCase();

      // Compute simple centroid for testing
      let sumLon = 0, sumLat = 0, totalPts = 0;
      for (const ring of rings ?? []) {
        for (const pt of ring) {
          sumLon += pt[0];
          sumLat += pt[1];
          totalPts++;
        }
      }
      const centroid: GeoPoint | null = totalPts > 0 ? { lon: sumLon / totalPts, lat: sumLat / totalPts } : null;

      const result = classifyParcelMunicipalJurisdiction(rings, boundary, centroid);

      if (result.outcome === 'INSIDE_OMAHA') liveStats.insideOmaha++;
      else if (result.outcome === 'OUTSIDE_OMAHA') liveStats.outsideOmaha++;
      else if (result.outcome === 'CROSSES_BOUNDARY') liveStats.crossesBoundary++;
      else liveStats.unresolved++;

      if (result.interiorRepresentativePoint && centroid) {
        const dist = Math.hypot(
          result.interiorRepresentativePoint.lat - centroid.lat,
          result.interiorRepresentativePoint.lon - centroid.lon
        );
        if (dist > 0.00001) {
          liveStats.representativePointShiftedCount++;
        }
      }

      const isOmaha = propCity === 'OMAHA';
      if (isOmaha) {
        if (result.outcome === 'INSIDE_OMAHA') liveStats.propCityMatrix.propCityOmaha_insideOmaha++;
        else if (result.outcome === 'OUTSIDE_OMAHA') {
          liveStats.propCityMatrix.propCityOmaha_outsideOmaha++;
          liveStats.discrepancies.push({
            pin,
            address,
            propCity,
            outcome: result.outcome,
            notes: result.notes.join('; '),
          });
        } else if (result.outcome === 'CROSSES_BOUNDARY') {
          liveStats.propCityMatrix.propCityOmaha_crosses++;
          liveStats.discrepancies.push({
            pin,
            address,
            propCity,
            outcome: result.outcome,
            notes: result.notes.join('; '),
          });
        } else {
          liveStats.propCityMatrix.propCityOmaha_unresolved++;
        }
      } else {
        if (result.outcome === 'INSIDE_OMAHA') {
          liveStats.propCityMatrix.propCityNotOmaha_insideOmaha++;
          liveStats.discrepancies.push({
            pin,
            address,
            propCity,
            outcome: result.outcome,
            notes: result.notes.join('; '),
          });
        } else if (result.outcome === 'OUTSIDE_OMAHA') {
          liveStats.propCityMatrix.propCityNotOmaha_outsideOmaha++;
        } else if (result.outcome === 'CROSSES_BOUNDARY') {
          liveStats.propCityMatrix.propCityNotOmaha_crosses++;
          liveStats.discrepancies.push({
            pin,
            address,
            propCity,
            outcome: result.outcome,
            notes: result.notes.join('; '),
          });
        } else {
          liveStats.propCityMatrix.propCityNotOmaha_unresolved++;
        }
      }
    }
  }

  // 4. Print Formatted Reports
  console.log('\n========================================================================');
  console.log('  RESULTS SUMMARY: 100 NEON DEV PILOT PARCELS');
  console.log('========================================================================');
  console.log(`Total Examined:           ${dbStats.examined}`);
  console.log(`• INSIDE_OMAHA:           ${dbStats.insideOmaha} (${((dbStats.insideOmaha / dbStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• OUTSIDE_OMAHA:          ${dbStats.outsideOmaha} (${((dbStats.outsideOmaha / dbStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• CROSSES_BOUNDARY:       ${dbStats.crossesBoundary} (${((dbStats.crossesBoundary / dbStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• UNRESOLVED:             ${dbStats.unresolved} (${((dbStats.unresolved / dbStats.examined) * 100).toFixed(1)}%)`);
  console.log(`Representative Pt Shifts: ${dbStats.representativePointShiftedCount} parcels (centroid fell outside interior)\n`);

  console.log('--- PROP_CITY vs MUNICIPAL BOUNDARY MATRIX (100 PILOT PARCELS) ---');
  console.log(`  PROP_CITY = 'OMAHA' & INSIDE_OMAHA:     ${dbStats.propCityMatrix.propCityOmaha_insideOmaha}`);
  console.log(`  PROP_CITY = 'OMAHA' & OUTSIDE_OMAHA:    ${dbStats.propCityMatrix.propCityOmaha_outsideOmaha}`);
  console.log(`  PROP_CITY = 'OMAHA' & CROSSES_BOUNDARY: ${dbStats.propCityMatrix.propCityOmaha_crosses}`);
  console.log(`  PROP_CITY = 'OMAHA' & UNRESOLVED:       ${dbStats.propCityMatrix.propCityOmaha_unresolved}`);
  console.log(`  PROP_CITY != 'OMAHA' & INSIDE_OMAHA:    ${dbStats.propCityMatrix.propCityNotOmaha_insideOmaha}`);
  console.log(`  PROP_CITY != 'OMAHA' & OUTSIDE_OMAHA:   ${dbStats.propCityMatrix.propCityNotOmaha_outsideOmaha}`);
  console.log(`  PROP_CITY != 'OMAHA' & CROSSES_BOUNDARY:${dbStats.propCityMatrix.propCityNotOmaha_crosses}`);
  console.log(`  PROP_CITY != 'OMAHA' & UNRESOLVED:      ${dbStats.propCityMatrix.propCityNotOmaha_unresolved}\n`);

  if (dbStats.discrepancies.length > 0) {
    console.log('--- DISCREPANCIES IN 100 PILOT PARCELS ---');
    for (const d of dbStats.discrepancies) {
      console.log(`  • PIN ${d.pin} (${d.address}): PROP_CITY='${d.propCity}' => Outcome: ${d.outcome}`);
      console.log(`    Detail: ${d.notes}`);
    }
    console.log();
  } else {
    console.log('✔ All 100 pilot parcels in Neon dev had 100% agreement between PROP_CITY and INSIDE_OMAHA.\n');
  }

  console.log('========================================================================');
  console.log('  RESULTS SUMMARY: 100 LIVE COUNTY-WIDE SAMPLE PARCELS');
  console.log('========================================================================');
  console.log(`Total Examined:           ${liveStats.examined}`);
  console.log(`• INSIDE_OMAHA:           ${liveStats.insideOmaha} (${((liveStats.insideOmaha / liveStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• OUTSIDE_OMAHA:          ${liveStats.outsideOmaha} (${((liveStats.outsideOmaha / liveStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• CROSSES_BOUNDARY:       ${liveStats.crossesBoundary} (${((liveStats.crossesBoundary / liveStats.examined) * 100).toFixed(1)}%)`);
  console.log(`• UNRESOLVED:             ${liveStats.unresolved} (${((liveStats.unresolved / liveStats.examined) * 100).toFixed(1)}%)`);
  console.log(`Representative Pt Shifts: ${liveStats.representativePointShiftedCount} parcels\n`);

  console.log('--- PROP_CITY vs MUNICIPAL BOUNDARY MATRIX (LIVE SAMPLE) ---');
  console.log(`  PROP_CITY = 'OMAHA' & INSIDE_OMAHA:     ${liveStats.propCityMatrix.propCityOmaha_insideOmaha}`);
  console.log(`  PROP_CITY = 'OMAHA' & OUTSIDE_OMAHA:    ${liveStats.propCityMatrix.propCityOmaha_outsideOmaha}`);
  console.log(`  PROP_CITY = 'OMAHA' & CROSSES_BOUNDARY: ${liveStats.propCityMatrix.propCityOmaha_crosses}`);
  console.log(`  PROP_CITY = 'OMAHA' & UNRESOLVED:       ${liveStats.propCityMatrix.propCityOmaha_unresolved}`);
  console.log(`  PROP_CITY != 'OMAHA' & INSIDE_OMAHA:    ${liveStats.propCityMatrix.propCityNotOmaha_insideOmaha}`);
  console.log(`  PROP_CITY != 'OMAHA' & OUTSIDE_OMAHA:   ${liveStats.propCityMatrix.propCityNotOmaha_outsideOmaha}`);
  console.log(`  PROP_CITY != 'OMAHA' & CROSSES_BOUNDARY:${liveStats.propCityMatrix.propCityNotOmaha_crosses}`);
  console.log(`  PROP_CITY != 'OMAHA' & UNRESOLVED:      ${liveStats.propCityMatrix.propCityNotOmaha_unresolved}\n`);

  if (liveStats.discrepancies.length > 0) {
    console.log(`--- DISCREPANCIES IN LIVE SAMPLE (${liveStats.discrepancies.length} total) ---`);
    for (const d of liveStats.discrepancies.slice(0, 10)) {
      console.log(`  • PIN ${d.pin} (${d.address}): PROP_CITY='${d.propCity}' => Outcome: ${d.outcome}`);
      console.log(`    Detail: ${d.notes}`);
    }
    if (liveStats.discrepancies.length > 10) {
      console.log(`    ... and ${liveStats.discrepancies.length - 10} more.`);
    }
    console.log();
  }

  // 5. Direct Read-Only SQL Verification
  console.log('--- STEP 5: READ-ONLY SQL INTEGRITY VERIFICATION ---');
  const propertyCount = await prisma.property.count();
  const ownershipCount = await prisma.ownershipRecord.count();
  const hotlineCount = await prisma.hotlineReport.count();
  const sourceCount = await prisma.sourceRecord.count();
  const runningRuns = await prisma.ingestionRun.count({ where: { status: 'RUNNING' } });

  console.log(`• Property count:        ${propertyCount} (expected 100)`);
  console.log(`• OwnershipRecord count: ${ownershipCount} (expected 100)`);
  console.log(`• HotlineReport count:   ${hotlineCount} (expected 2,459)`);
  console.log(`• SourceRecord count:    ${sourceCount} (expected 2,582)`);
  console.log(`• Running IngestionRuns: ${runningRuns} (expected 0)`);

  if (
    propertyCount === 100 &&
    ownershipCount === 100 &&
    hotlineCount === 2459 &&
    sourceCount === 2582 &&
    runningRuns === 0
  ) {
    console.log('\n✔ READ-ONLY INTEGRITY CONFIRMED: Zero database mutations occurred during dry-run.');
  } else {
    console.error('\n❌ DATABASE MUTATION DETECTED! Counts deviated from baseline.');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error during boundary dry run:', e);
  await prisma.$disconnect();
  process.exit(1);
});
