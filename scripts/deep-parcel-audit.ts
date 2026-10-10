import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { DOUGLAS_PARCEL_CONFIG } from '../src/lib/ingestion/douglas-parcel/config';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

async function main() {
  console.log('=== DEEP FORENSIC AUDIT OF 100 PILOT PARCELS ===\n');

  // 1. Check PIN 0100370004 and PIN 0100370012 in the database
  const p1 = await prisma.property.findUnique({ where: { parcelId: '0100370004' } });
  const p2 = await prisma.property.findUnique({ where: { parcelId: '0100370012' } });

  console.log('--- 1. PIN 0100370004 & 0100370012 DATABASE VALUES ---');
  console.log(`• PIN 0100370004 in DB: Lat=${p1?.latitude}, Lon=${p1?.longitude}`);
  console.log(`• PIN 0100370012 in DB: Lat=${p2?.latitude}, Lon=${p2?.longitude}`);

  // Fetch upstream directly from ArcGIS for both PINs
  const upstreamRes = await fetch(
    `${DOUGLAS_PARCEL_CONFIG.endpoint}?where=PIN+IN+('0100370004','0100370012')&outFields=OBJECTID,PIN,PROPERTY_A,X_COORD,Y_COORD&outSR=4326&returnGeometry=true&f=json`
  );
  const upstreamData = (await upstreamRes.json()) as any;
  console.log('\n--- UPSTREAM ARCGIS VALUES FOR BOTH PINS ---');
  for (const f of upstreamData.features ?? []) {
    const rings = f.geometry?.rings?.[0] ?? [];
    let sumLon = 0, sumLat = 0;
    for (const pt of rings) {
      sumLon += pt[0];
      sumLat += pt[1];
    }
    const avgLon = rings.length > 0 ? (sumLon / rings.length).toFixed(6) : 'N/A';
    const avgLat = rings.length > 0 ? (sumLat / rings.length).toFixed(6) : 'N/A';
    console.log(`• Upstream PIN ${f.attributes.PIN}: Computed Centroid Lat=${avgLat}, Lon=${avgLon}`);
    console.log(`  First Ring Point: [${rings[0]?.[0]}, ${rings[0]?.[1]}]`);
  }

  // 2. Audit all 100 properties in Neon dev
  const allProperties = await prisma.property.findMany({
    orderBy: { parcelId: 'asc' },
    include: {
      ownershipRecords: true,
      sourceRecords: true,
    },
  });

  console.log(`\n--- 2. GEOMETRY VALIDATION ACROSS ALL ${allProperties.length} PARCELS ---`);
  let geomErrors = 0;
  let centroidDiscrepancies = 0;
  let unclosedPolygons = 0;
  let invalidCoords = 0;

  for (const p of allProperties) {
    const geo = p.geometryGeoJson as any;
    if (!geo || !geo.coordinates || !Array.isArray(geo.coordinates)) {
      console.error(`  [ERROR] PIN ${p.parcelId}: Missing or invalid geometryGeoJson`);
      geomErrors++;
      continue;
    }

    const rings = geo.coordinates;
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) {
        console.error(`  [ERROR] PIN ${p.parcelId}: Polygon ring has fewer than 4 points (${ring?.length})`);
        unclosedPolygons++;
        continue;
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (Math.abs(first[0] - last[0]) > 0.000001 || Math.abs(first[1] - last[1]) > 0.000001) {
        console.error(`  [ERROR] PIN ${p.parcelId}: Unclosed ring. First=[${first}], Last=[${last}]`);
        unclosedPolygons++;
      }

      // Check lat/lon ranges and coordinate order [lon, lat]
      for (const pt of ring) {
        const lon = pt[0];
        const lat = pt[1];
        if (lon < -96.38 || lon > -95.80 || lat < 41.10 || lat > 41.45) {
          console.error(`  [ERROR] PIN ${p.parcelId}: Coordinate out of bounds: [lon=${lon}, lat=${lat}]`);
          invalidCoords++;
        }
      }

      // Check centroid recalculation
      let sumLon = 0, sumLat = 0;
      for (const pt of ring) {
        sumLon += pt[0];
        sumLat += pt[1];
      }
      const calcLon = Number((sumLon / ring.length).toFixed(6));
      const calcLat = Number((sumLat / ring.length).toFixed(6));
      if (p.latitude === null || p.longitude === null) {
        centroidDiscrepancies++;
      } else {
        const diffLat = Math.abs(p.latitude - calcLat);
        const diffLon = Math.abs(p.longitude - calcLon);
        if (diffLat > 0.0001 || diffLon > 0.0001) {
          console.error(`  [MISMATCH] PIN ${p.parcelId}: Persisted [${p.latitude}, ${p.longitude}] vs Recomputed [${calcLat}, ${calcLon}]`);
          centroidDiscrepancies++;
        }
      }
    }
  }

  console.log(`• Total Geometry Errors Found        : ${geomErrors}`);
  console.log(`• Unclosed Polygon Rings             : ${unclosedPolygons}`);
  console.log(`• Out-of-Bounds Coordinates          : ${invalidCoords}`);
  console.log(`• Centroid Discrepancies (>0.0001 deg): ${centroidDiscrepancies}`);

  // 3. Address Integrity Audit
  console.log('\n--- 3. ADDRESS INTEGRITY & SYNTHESIS AUDIT ---');
  let synthesizedAddressCount = 0;
  let defaultZipCount = 0;
  let missingSourceAddressCount = 0;
  const synthesizedList: { pin: string; persistedAddress: string; persistedZip: string; sourceRawAddress: any }[] = [];

  for (const p of allProperties) {
    const src = p.sourceRecords[0];
    const raw = (src?.rawPayloadJson as any) ?? {};
    const rawPropAddr = raw.PROPERTY_A;
    const rawZip = raw.PROP_ZIP;

    const isMissingRawAddr = !rawPropAddr || !String(rawPropAddr).trim();
    if (isMissingRawAddr) {
      missingSourceAddressCount++;
    }

    if (p.address.startsWith('Parcel ')) {
      synthesizedAddressCount++;
      synthesizedList.push({
        pin: p.parcelId,
        persistedAddress: p.address,
        persistedZip: p.zip,
        sourceRawAddress: rawPropAddr,
      });
    }

    if (p.zip === '68102' && (!rawZip || !String(rawZip).trim())) {
      defaultZipCount++;
    }
  }

  console.log(`• Parcels with Missing Source Situs Address (PROPERTY_A): ${missingSourceAddressCount}`);
  console.log(`• Parcels with Synthesized "Parcel <PIN>" in address     : ${synthesizedAddressCount}`);
  console.log(`• Parcels with Default "68102" in zip when source empty : ${defaultZipCount}`);
  if (synthesizedList.length > 0) {
    console.log('• Sample Synthesized Address Records:');
    for (const item of synthesizedList.slice(0, 5)) {
      console.log(`    - PIN ${item.pin}: address="${item.persistedAddress}", zip="${item.persistedZip}", raw PROPERTY_A=${JSON.stringify(item.sourceRawAddress)}`);
    }
  }

  // 4. Ownership Classification Audit
  console.log('\n--- 4. OWNERSHIP CLASSIFICATION AUDIT ---');
  const corporateStats = await prisma.ownershipRecord.groupBy({
    by: ['corporateStatus'],
    _count: { id: true },
  });
  console.log('• Corporate Status Distribution:');
  for (const c of corporateStats) {
    console.log(`    - ${c.corporateStatus}: ${c._count.id}`);
  }

  // 5. Authoritative Address Distribution
  console.log('\n--- 5. AUTHORITATIVE ADDRESS DISTRIBUTION ---');
  const authAddressStats = await prisma.property.groupBy({
    by: ['hasAuthoritativeAddress'],
    _count: { id: true },
  });
  for (const a of authAddressStats) {
    console.log(`    - hasAuthoritativeAddress=${a.hasAuthoritativeAddress}: ${a._count.id}`);
  }

  // 6. SourceRecord Immutable Snapshot Check
  console.log('\n--- 6. SOURCE RECORD AUDIT ---');
  const srcSample = await prisma.sourceRecord.findMany({
    take: 3,
    where: { sourceName: 'DOUGLAS_COUNTY_ASSESSOR' },
    select: { sourceRecordId: true, rawPayloadJson: true },
  });
  for (const s of srcSample) {
    const raw = s.rawPayloadJson as any;
    console.log(`• ${s.sourceRecordId}: PIN=${raw?.PIN}, PROPERTY_A=${JSON.stringify(raw?.PROPERTY_A)}, OWNER_NAME=${JSON.stringify(raw?.OWNER_NAME)}`);
  }
}

main()
  .catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
