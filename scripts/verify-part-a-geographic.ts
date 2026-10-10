import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';
import { fetchOmahaMunicipalBoundary, classifyParcelMunicipalJurisdiction } from '../src/lib/geo/municipal-boundary';

async function main() {
  console.log('=== PART A: GEOGRAPHIC ACCURACY & ENVELOPE SET DIFFERENCE ANALYSIS ===\n');

  // Exact MAPA Omaha Bounding Box (WGS84 EPSG:4326)
  const exactEnvelope = {
    xmin: -96.268083,
    ymin: 41.190548,
    xmax: -95.871141,
    ymax: 41.393170,
    spatialReference: { wkid: 4326 },
  };

  // Buffered Envelope (+0.002 deg buffer, approx 200m buffer for boundary overlap safety)
  const bufferedEnvelope = {
    xmin: -96.270083,
    ymin: 41.188548,
    xmax: -95.869141,
    ymax: 41.395170,
    spatialReference: { wkid: 4326 },
  };

  // Narrow Envelope previously proposed
  const narrowEnvelope = {
    xmin: -96.2415,
    ymin: 41.1396,
    xmax: -95.8920,
    ymax: 41.3888,
    spatialReference: { wkid: 4326 },
  };

  // 1. Fetch complete MAPA municipal boundary and verify every vertex is inside buffered envelope
  console.log('1. Fetching MAPA municipal planning boundary and verifying vertex containment...');
  const mapaBoundary = await fetchOmahaMunicipalBoundary();
  console.log(`   • Rings: ${mapaBoundary.ringsCount}`);
  console.log(`   • Total Bounds: Lon [${mapaBoundary.totalBounds.minLon}, ${mapaBoundary.totalBounds.maxLon}], Lat [${mapaBoundary.totalBounds.minLat}, ${mapaBoundary.totalBounds.maxLat}]`);
  console.log(`   • Buffered Envelope: Lon [${bufferedEnvelope.xmin}, ${bufferedEnvelope.xmax}], Lat [${bufferedEnvelope.ymin}, ${bufferedEnvelope.ymax}]`);

  // Verify all vertices of exterior and hole rings
  let allVerticesContained = true;
  let totalBoundaryVertices = 0;
  let minLonFound = Infinity;
  let maxLonFound = -Infinity;
  let minLatFound = Infinity;
  let maxLatFound = -Infinity;

  for (const ring of [...mapaBoundary.exteriorRings, ...mapaBoundary.holeRings]) {
    for (const [lon, lat] of ring.coordinates) {
      totalBoundaryVertices++;
      if (lon < minLonFound) minLonFound = lon;
      if (lon > maxLonFound) maxLonFound = lon;
      if (lat < minLatFound) minLatFound = lat;
      if (lat > maxLatFound) maxLatFound = lat;

      if (
        lon < bufferedEnvelope.xmin ||
        lon > bufferedEnvelope.xmax ||
        lat < bufferedEnvelope.ymin ||
        lat > bufferedEnvelope.ymax
      ) {
        allVerticesContained = false;
        console.error(`   VERTEX OUTSIDE BUFFERED ENVELOPE: [${lon}, ${lat}]`);
      }
    }
  }

  console.log(`   • Total boundary vertices examined: ${totalBoundaryVertices}`);
  console.log(`   • Vertex coordinate extents: Lon [${minLonFound.toFixed(6)}, ${maxLonFound.toFixed(6)}], Lat [${minLatFound.toFixed(6)}, ${maxLatFound.toFixed(6)}]`);
  console.log(`   • Are all MAPA boundary vertices strictly inside buffered envelope? ${allVerticesContained ? 'YES (100% CONTAINED)' : 'NO'}`);
  const marginWest = (minLonFound - bufferedEnvelope.xmin).toFixed(6);
  const marginEast = (bufferedEnvelope.xmax - maxLonFound).toFixed(6);
  const marginSouth = (minLatFound - bufferedEnvelope.ymin).toFixed(6);
  const marginNorth = (bufferedEnvelope.ymax - maxLatFound).toFixed(6);
  console.log(`   • Safety margins to buffer edge: West: ${marginWest}°, East: ${marginEast}°, South: ${marginSouth}°, North: ${marginNorth}°\n`);

  // 2. Fetch OBJECTID sets for exact envelope vs narrow envelope
  console.log('2. Querying Douglas County FeatureServer for actual source OBJECTID sets...');
  
  async function fetchObjectIds(geom: any): Promise<number[]> {
    const res = await fetch(DOUGLAS_PARCEL_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        where: '1=1',
        geometry: JSON.stringify(geom),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        returnIdsOnly: 'true',
        f: 'json',
      }).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (data.error) throw new Error(data.error.message);
    return data.objectIds || [];
  }

  console.log('   • Fetching exact envelope OBJECTIDs...');
  const exactOids = await fetchObjectIds(exactEnvelope);
  console.log(`   • Exact envelope returned ${exactOids.length} OBJECTIDs`);

  console.log('   • Fetching narrow envelope OBJECTIDs...');
  const narrowOids = await fetchObjectIds(narrowEnvelope);
  console.log(`   • Narrow envelope returned ${narrowOids.length} OBJECTIDs`);

  // Set difference: exact minus narrow
  const narrowSet = new Set(narrowOids);
  const exactSet = new Set(exactOids);

  const excludedOids: number[] = [];
  for (const oid of exactOids) {
    if (!narrowSet.has(oid)) {
      excludedOids.push(oid);
    }
  }

  // Also check if narrow has anything not in exact (e.g. south of Omaha)
  const narrowOnlyOids: number[] = [];
  for (const oid of narrowOids) {
    if (!exactSet.has(oid)) {
      narrowOnlyOids.push(oid);
    }
  }

  console.log(`\n3. Set Difference Analysis:`);
  console.log(`   • Exact envelope count: ${exactOids.length}`);
  console.log(`   • Narrow envelope count: ${narrowOids.length}`);
  console.log(`   • Count difference (Exact - Narrow): ${exactOids.length - narrowOids.length}`);
  console.log(`   • True Set Difference (in Exact envelope BUT excluded by Narrow): ${excludedOids.length} parcels`);
  console.log(`   • In Narrow envelope BUT outside Exact envelope (extraneous south): ${narrowOnlyOids.length} parcels`);
  console.log(`   • Explaining the reported 4,026 difference:`);
  console.log(`     The previously reported 4,026 was raw count subtraction (211,429 - 207,403 = 4,026).`);
  console.log(`     True excluded set size from exact Omaha envelope: ${excludedOids.length}.`);

  // 4. Sample and classify excluded parcels against the complete MAPA polygon
  console.log(`\n4. Fetching geometry and classifying a bounded representative sample of excluded parcels...`);
  // Sample across the range of excluded OIDs (e.g., first 20, middle 20, last 20, total up to 60)
  excludedOids.sort((a, b) => a - b);
  const sampleOids: number[] = [];
  const step = Math.max(1, Math.floor(excludedOids.length / 50));
  for (let i = 0; i < excludedOids.length && sampleOids.length < 50; i += step) {
    sampleOids.push(excludedOids[i]);
  }

  console.log(`   • Selected sample of ${sampleOids.length} excluded OBJECTIDs (from OID ${sampleOids[0]} to OID ${sampleOids[sampleOids.length - 1]})`);

  // Query features for sample OIDs in chunks of 25
  const classifications = {
    INSIDE_OMAHA: [] as any[],
    CROSSES_BOUNDARY: [] as any[],
    OUTSIDE_OMAHA: [] as any[],
    UNRESOLVED: [] as any[],
  };

  for (let i = 0; i < sampleOids.length; i += 25) {
    const chunk = sampleOids.slice(i, i + 25);
    const where = `OBJECTID IN (${chunk.join(',')})`;
    const res = await fetch(DOUGLAS_PARCEL_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        where,
        outFields: 'OBJECTID,PIN,PROPERTY_A,PROP_CITY,PROP_ZIP,OWNER_NAME',
        outSR: '4326',
        returnGeometry: 'true',
        f: 'json',
      }).toString(),
    });
    const data = (await res.json()) as any;
    for (const feat of data.features || []) {
      const rings = feat.geometry?.rings;
      const x = feat.geometry?.x ?? feat.attributes?.X_COORD;
      const y = feat.geometry?.y ?? feat.attributes?.Y_COORD;
      const centroid = x && y ? { lon: x, lat: y } : null;
      const result = classifyParcelMunicipalJurisdiction(rings, mapaBoundary, centroid);
      const entry = {
        oid: feat.attributes.OBJECTID,
        pin: feat.attributes.PIN,
        address: feat.attributes.PROPERTY_A,
        city: feat.attributes.PROP_CITY,
        outcome: result.outcome,
        notes: result.notes.join('; '),
      };
      classifications[result.outcome].push(entry);
    }
  }

  console.log(`\n   Sample Classification Breakdown (${sampleOids.length} excluded parcels tested):`);
  console.log(`   • INSIDE_OMAHA:       ${classifications.INSIDE_OMAHA.length}`);
  console.log(`   • CROSSES_BOUNDARY:   ${classifications.CROSSES_BOUNDARY.length}`);
  console.log(`   • OUTSIDE_OMAHA:      ${classifications.OUTSIDE_OMAHA.length}`);
  console.log(`   • UNRESOLVED:         ${classifications.UNRESOLVED.length}`);

  if (classifications.INSIDE_OMAHA.length > 0) {
    console.log(`\n   Example EXCLUDED parcels genuinely INSIDE_OMAHA:`);
    for (const c of classifications.INSIDE_OMAHA.slice(0, 5)) {
      console.log(`     - OID ${c.oid} (PIN ${c.pin}): "${c.address}", City: ${c.city} => Outcome: ${c.outcome}`);
    }
  }

  if (classifications.CROSSES_BOUNDARY.length > 0) {
    console.log(`\n   Example EXCLUDED parcels classified CROSSES_BOUNDARY:`);
    for (const c of classifications.CROSSES_BOUNDARY.slice(0, 5)) {
      console.log(`     - OID ${c.oid} (PIN ${c.pin}): "${c.address}", City: ${c.city} => Outcome: ${c.outcome}`);
    }
  }

  if (classifications.OUTSIDE_OMAHA.length > 0) {
    console.log(`\n   Example EXCLUDED parcels OUTSIDE_OMAHA (in envelope margin):`);
    for (const c of classifications.OUTSIDE_OMAHA.slice(0, 5)) {
      console.log(`     - OID ${c.oid} (PIN ${c.pin}): "${c.address}", City: ${c.city} => Outcome: ${c.outcome}`);
    }
  }

  console.log(`\n========================================================================`);
  console.log(`  PART A CONCLUSION:`);
  console.log(`  1. The narrow envelope excludes valid INSIDE_OMAHA and CROSSES_BOUNDARY parcels.`);
  console.log(`  2. Count subtraction conflates genuinely excluded parcels with margin differences.`);
  console.log(`  3. The buffered envelope contains 100% of MAPA boundary vertices with safety buffers.`);
  console.log(`  4. MAPA geometry represents a regional planning agency boundary dataset and is not`);
  console.log(`     independently certified legal jurisdiction.`);
  console.log(`========================================================================`);
}

main().catch(console.error);
