import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';

async function queryCount(body: Record<string, string>): Promise<{ count?: number; error?: string }> {
  const res = await fetch(DOUGLAS_PARCEL_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as any;
  if (json.error) {
    return { error: json.error.message };
  }
  return { count: json.count };
}

async function main() {
  console.log('========================================================================');
  console.log('  OBJECTIVE 3: DOUGLAS COUNTY FEATURESERVER ENVELOPE-INTERSECTS TESTS');
  console.log('========================================================================\n');

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

  console.log('1. Countywide Total Parcels (Unfiltered baseline):');
  const total = await queryCount({ where: '1=1', returnCountOnly: 'true', f: 'json' });
  console.log(`   • Countywide Total: ${total.count ?? total.error}\n`);

  console.log('2. Douglas County Parcels intersecting EXACT MAPA Omaha Envelope:');
  const exactCount = await queryCount({
    where: '1=1',
    geometry: JSON.stringify(exactEnvelope),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true',
    f: 'json',
  });
  console.log(`   • Exact Envelope Intersects Count: ${exactCount.count ?? exactCount.error}`);
  if (total.count && exactCount.count) {
    const dropped = total.count - exactCount.count;
    const droppedPct = ((dropped / total.count) * 100).toFixed(1);
    console.log(`   • Countywide Records Excluded by Envelope: ${dropped} (${droppedPct}% of county avoided)`);
  }

  console.log('\n3. Douglas County Parcels intersecting BUFFERED MAPA Omaha Envelope (+200m buffer):');
  const bufferedCount = await queryCount({
    where: '1=1',
    geometry: JSON.stringify(bufferedEnvelope),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true',
    f: 'json',
  });
  console.log(`   • Buffered Envelope Intersects Count: ${bufferedCount.count ?? bufferedCount.error}`);

  console.log('\n4. Test Narrower Extent (-96.2415 to -95.8920) (To measure dropped valid parcels):');
  const narrowEnvelope = {
    xmin: -96.2415,
    ymin: 41.1396,
    xmax: -95.8920,
    ymax: 41.3888,
    spatialReference: { wkid: 4326 },
  };
  const narrowCount = await queryCount({
    where: '1=1',
    geometry: JSON.stringify(narrowEnvelope),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true',
    f: 'json',
  });
  console.log(`   • Narrow Envelope Count: ${narrowCount.count ?? narrowCount.error}`);
  if (exactCount.count && narrowCount.count) {
    console.log(`   • Missing Parcels if using Narrow Envelope: ${exactCount.count - narrowCount.count} parcels (Proves narrow envelope loses parcels!)`);
  }
}

main().catch(console.error);
