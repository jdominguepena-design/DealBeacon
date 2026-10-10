import { fetchOmahaMunicipalBoundary } from '../src/lib/geo/municipal-boundary';
import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';

async function main() {
  console.log('========================================================================');
  console.log('  OBJECTIVE 1 & 2: MAPA OMAHA MUNICIPAL POLYGON & ENVELOPE AUDIT');
  console.log('========================================================================\n');

  // Direct fetch from ArcGIS REST endpoint
  const queryParams = new URLSearchParams({
    where: "City_Name = 'Omaha'",
    outFields: 'OBJECTID,City_Name,STATEFP,PLACEFP,NAMELSAD,sq_mi,County,Shape__Length,Shape__Area',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });

  const url = `${DOUGLAS_PARCEL_CONFIG.municipalBoundaryEndpoint}?${queryParams.toString()}`;
  console.log(`Endpoint URL: ${url}\n`);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP error ${resp.status}`);
  }
  const data = (await resp.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error: ${data.error.message}`);
  }

  const feature = data.features?.[0];
  if (!feature) {
    throw new Error('No feature returned');
  }

  console.log('1. Feature Attributes:');
  console.log(JSON.stringify(feature.attributes, null, 2));

  const rings: number[][][] = feature.geometry.rings;
  console.log(`\n2. Geometry Structure:`);
  console.log(`   • Total Rings: ${rings.length}`);

  let globalMinLon = Infinity;
  let globalMaxLon = -Infinity;
  let globalMinLat = Infinity;
  let globalMaxLat = -Infinity;

  let totalVertices = 0;
  const ringBounds: Array<{
    ringIndex: number;
    vertexCount: number;
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  }> = [];

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    totalVertices += ring.length;
    let rMinLon = Infinity;
    let rMaxLon = -Infinity;
    let rMinLat = Infinity;
    let rMaxLat = -Infinity;

    for (const [lon, lat] of ring) {
      if (lon < globalMinLon) globalMinLon = lon;
      if (lon > globalMaxLon) globalMaxLon = lon;
      if (lat < globalMinLat) globalMinLat = lat;
      if (lat > globalMaxLat) globalMaxLat = lat;

      if (lon < rMinLon) rMinLon = lon;
      if (lon > rMaxLon) rMaxLon = lon;
      if (lat < rMinLat) rMinLat = lat;
      if (lat > rMaxLat) rMaxLat = lat;
    }

    ringBounds.push({
      ringIndex: i,
      vertexCount: ring.length,
      minLon: rMinLon,
      maxLon: rMaxLon,
      minLat: rMinLat,
      maxLat: rMaxLat,
    });
  }

  console.log(`   • Total Vertices across all rings: ${totalVertices}`);
  console.log(`\n3. Exact Computed Bounding Envelope (WGS84 EPSG:4326):`);
  console.log(`   • Longitude: [${globalMinLon.toFixed(6)}, ${globalMaxLon.toFixed(6)}]`);
  console.log(`   • Latitude:  [${globalMinLat.toFixed(6)}, ${globalMaxLat.toFixed(6)}]`);

  // Comparison with earlier reported extents
  const extentA = {
    label: 'Earlier Reported Extent',
    minLon: -96.2681,
    maxLon: -95.8711,
    minLat: 41.1905,
    maxLat: 41.3932,
  };
  const extentB = {
    label: 'Latest Reported Extent (Typo in discovery note)',
    minLon: -96.2415,
    maxLon: -95.8920,
    minLat: 41.1396,
    maxLat: 41.3888,
  };

  console.log('\n4. Envelope Discrepancy Reconciliation:');
  console.log(`   Exact Geometry Bounds:
     Lon: [${globalMinLon.toFixed(6)}, ${globalMaxLon.toFixed(6)}]
     Lat: [${globalMinLat.toFixed(6)}, ${globalMaxLat.toFixed(6)}]`);

  console.log(`\n   Comparison with ${extentA.label}:
     Lon: [${extentA.minLon}, ${extentA.maxLon}] (Diff: min ${(globalMinLon - extentA.minLon).toFixed(6)}, max ${(globalMaxLon - extentA.maxLon).toFixed(6)})
     Lat: [${extentA.minLat}, ${extentA.maxLat}] (Diff: min ${(globalMinLat - extentA.minLat).toFixed(6)}, max ${(globalMaxLat - extentA.maxLat).toFixed(6)})`);

  console.log(`\n   Comparison with ${extentB.label}:
     Lon: [${extentB.minLon}, ${extentB.maxLon}] (Diff: min ${(globalMinLon - extentB.minLon).toFixed(6)}, max ${(globalMaxLon - extentB.maxLon).toFixed(6)})
     Lat: [${extentB.minLat}, ${extentB.maxLat}] (Diff: min ${(globalMinLat - extentB.minLat).toFixed(6)}, max ${(globalMaxLat - extentB.maxLat).toFixed(6)})`);

  // Check which vertices establish the exact extremes
  console.log('\n5. Extreme Vertex Coordinates and Ring Provenance:');
  for (let i = 0; i < rings.length; i++) {
    for (const [lon, lat] of rings[i]) {
      if (lon === globalMinLon) console.log(`   • Westernmost (Min Lon): ${lon.toFixed(6)}, ${lat.toFixed(6)} (Ring #${i})`);
      if (lon === globalMaxLon) console.log(`   • Easternmost (Max Lon): ${lon.toFixed(6)}, ${lat.toFixed(6)} (Ring #${i})`);
      if (lat === globalMinLat) console.log(`   • Southernmost (Min Lat): ${lon.toFixed(6)}, ${lat.toFixed(6)} (Ring #${i})`);
      if (lat === globalMaxLat) console.log(`   • Northernmost (Max Lat): ${lon.toFixed(6)}, ${lat.toFixed(6)} (Ring #${i})`);
    }
  }

  // Also verify internal fetchOmahaMunicipalBoundary() helper output
  const cached = await fetchOmahaMunicipalBoundary();
  console.log('\n6. In-App Cached Municipal Boundary Bounds:');
  console.log(`   • Total Bounds:`, cached.totalBounds);
}

main().catch(console.error);
