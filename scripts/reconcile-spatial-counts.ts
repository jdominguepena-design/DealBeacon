import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';
import { fetchOmahaMunicipalBoundary } from '../src/lib/geo/municipal-boundary';

async function queryCount(where: string, geometry?: any, spatialRel?: string): Promise<number> {
  const body: Record<string, string> = {
    where,
    returnCountOnly: 'true',
    f: 'json',
  };

  if (geometry && spatialRel) {
    body.geometry = JSON.stringify(geometry);
    body.geometryType = 'esriGeometryPolygon';
    body.spatialRel = spatialRel;
    body.inSR = '4326';
  }

  const res = await fetch(`${DOUGLAS_PARCEL_CONFIG.endpoint}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    throw new Error(`Query failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error: ${data.error.message}`);
  }

  return data.count ?? 0;
}

async function main() {
  console.log('--- RECONCILING DOUGLAS COUNTY PARCEL COUNTS & SPATIAL OVERLAP ---');

  // 1. Base counts
  console.log('Querying baseline counts...');
  const totalParcels = await queryCount('1=1');
  console.log(`Total Douglas County Parcels: ${totalParcels}`);

  const propCityOmaha = await queryCount("PROP_CITY = 'OMAHA'");
  console.log(`Parcels with PROP_CITY = 'OMAHA': ${propCityOmaha}`);

  const propCityNotOmaha = await queryCount("PROP_CITY <> 'OMAHA' OR PROP_CITY IS NULL");
  console.log(`Parcels with PROP_CITY <> 'OMAHA' or NULL: ${propCityNotOmaha}`);

  // 2. Fetch Omaha boundary
  console.log('\nFetching Omaha boundary geometry...');
  const boundary = await fetchOmahaMunicipalBoundary();
  const esriGeom = {
    rings: [
      boundary.exteriorRings[0].coordinates,
      ...boundary.holeRings.map((h) => h.coordinates),
    ],
    spatialReference: { wkid: 4326 },
  };

  // 3. Spatial Intersects
  console.log('\nQuerying spatial intersection counts...');
  const spatialIntersectsAll = await queryCount('1=1', esriGeom, 'esriSpatialRelIntersects');
  console.log(`Total Parcels Intersecting Boundary (Intersects): ${spatialIntersectsAll}`);

  // 4. Overlap calculations
  console.log('\nQuerying Overlap between PROP_CITY and Spatial Intersection...');
  const omahaAndIntersects = await queryCount("PROP_CITY = 'OMAHA'", esriGeom, 'esriSpatialRelIntersects');
  console.log(`[A] PROP_CITY = 'OMAHA' AND Intersects Boundary: ${omahaAndIntersects}`);

  // Query not-Omaha intersecting directly
  const notOmahaAndIntersects = await queryCount(
    "PROP_CITY <> 'OMAHA' OR PROP_CITY IS NULL",
    esriGeom,
    'esriSpatialRelIntersects'
  );
  console.log(`[B] PROP_CITY <> 'OMAHA' (or NULL) AND Intersects Boundary: ${notOmahaAndIntersects}`);

  const omahaAndOutside = propCityOmaha - omahaAndIntersects;
  console.log(`[C] Calculated: PROP_CITY = 'OMAHA' OUTSIDE Boundary: ${omahaAndOutside}`);

  // 5. Test esriSpatialRelWithin
  console.log('\nQuerying Spatial Within (Strictly inside)...');
  let spatialWithinAll: number | null = null;
  try {
    spatialWithinAll = await queryCount('1=1', esriGeom, 'esriSpatialRelWithin');
    console.log(`Total Parcels Strictly Within Boundary: ${spatialWithinAll}`);
  } catch (e: any) {
    console.log(`Note: esriSpatialRelWithin server query returned: ${e.message}`);
  }

  let omahaWithin: number | null = null;
  try {
    omahaWithin = await queryCount("PROP_CITY = 'OMAHA'", esriGeom, 'esriSpatialRelWithin');
    console.log(`PROP_CITY='OMAHA' Strictly Within: ${omahaWithin}`);
  } catch (e: any) {
    console.log(`Note: esriSpatialRelWithin on PROP_CITY='OMAHA' returned: ${e.message}`);
  }

  console.log('\n========================================================================');
  console.log('  OFFICIAL RECONCILIATION: PROP_CITY vs MAPA BOUNDARY OVERLAP');
  console.log('========================================================================');
  console.log(`Total Douglas County Parcels:                          ${totalParcels}`);
  console.log(`Total PROP_CITY = 'OMAHA':                            ${propCityOmaha}`);
  console.log(`Total PROP_CITY <> 'OMAHA' / NULL:                     ${propCityNotOmaha}`);
  console.log(`Total Parcels Intersecting MAPA Boundary:              ${spatialIntersectsAll}`);
  console.log('------------------------------------------------------------------------');
  console.log(`Overlap: PROP_CITY='OMAHA' & Intersects Boundary:      ${omahaAndIntersects}`);
  console.log(`False Positives of PROP_CITY (OMAHA but Outside):       ${omahaAndOutside}`);
  console.log(`False Negatives of PROP_CITY (Not OMAHA but Intersect):  ${notOmahaAndIntersects}`);
  if (spatialWithinAll !== null) {
    console.log(`Strictly INSIDE_OMAHA (Within boundary):              ${spatialWithinAll}`);
    console.log(`CROSSES_BOUNDARY (Intersects - Within):               ${spatialIntersectsAll - spatialWithinAll}`);
  }
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Error during reconciliation:', err);
  process.exit(1);
});
