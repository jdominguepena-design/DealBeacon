import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { parsePolygonGeometry } from '../src/lib/ingestion/douglas-parcel/normalize';

try {
  process.loadEnvFile('.env');
} catch {}

const preflight = verifyNeonDevEndpoints();
console.log(`✔ Neon Preflight: Validated target dev branch "${preflight.expectedEndpointId}" (${preflight.pooledHost})\n`);

const prisma = new PrismaClient();

async function main() {
  console.log('=== DEALBEACON PILOT PARCEL CONTROLLED REPAIR PROCESS ===\n');

  // 1. Baseline verification
  const initialPropCount = await prisma.property.count();
  const initialOwnerCount = await prisma.ownershipRecord.count();
  const initialHotlineCount = await prisma.hotlineReport.count();
  const initialSourceCount = await prisma.sourceRecord.count();

  console.log('--- PRE-REPAIR BASELINE COUNTS ---');
  console.log(`• Properties        : ${initialPropCount}`);
  console.log(`• Ownership Records : ${initialOwnerCount}`);
  console.log(`• Hotline Reports   : ${initialHotlineCount}`);
  console.log(`• Source Records    : ${initialSourceCount}`);

  if (initialPropCount !== 100 || initialHotlineCount !== 2459) {
    throw new Error('Pre-repair baseline check failed: unexpected database record counts.');
  }

  // 2. Repair Unassigned Situs Addresses & Fabricated ZIP Codes (Target: 22 records)
  console.log('\n--- 1. REPAIRING UNASSIGNED SITUS ADDRESSES (Target: 22 parcels) ---');
  const propertiesWithSyntheticAddress = await prisma.property.findMany({
    where: {
      OR: [
        { address: { startsWith: 'Parcel ' } },
        { address: '[UNASSIGNED SITUS]' },
      ],
    },
    include: { sourceRecords: true },
  });

  console.log(`Identified ${propertiesWithSyntheticAddress.length} parcels for address repair.`);
  let addressRepairedCount = 0;

  for (const p of propertiesWithSyntheticAddress) {
    const raw = (p.sourceRecords[0]?.rawPayloadJson as any) ?? {};
    const rawAddress = (raw.PROPERTY_A ?? '').trim();
    const rawZip = (raw.PROP_ZIP ?? '').trim();

    const isMissingAddress = !rawAddress || rawAddress === 'UNKNOWN';
    const cleanZip = rawZip ? rawZip.slice(0, 5) : '';

    await prisma.property.update({
      where: { id: p.id },
      data: {
        address: isMissingAddress ? '[UNASSIGNED SITUS]' : rawAddress,
        zip: cleanZip,
        hasAuthoritativeAddress: !isMissingAddress,
      },
    });
    addressRepairedCount++;
  }
  console.log(`✔ Successfully repaired ${addressRepairedCount} parcel address records.`);

  // 3. Repair Corporate Status Terminology (Target: 40 records)
  console.log('\n--- 2. REPAIRING CORPORATE STATUS TERMINOLOGY (Target: 40 ownership records) ---');
  const corporateRecords = await prisma.ownershipRecord.findMany({
    where: {
      corporateStatus: 'CONFIRMED_CORPORATE',
    },
  });

  console.log(`Identified ${corporateRecords.length} records labeled CONFIRMED_CORPORATE.`);
  let corporateRepairedCount = 0;

  for (const o of corporateRecords) {
    await prisma.ownershipRecord.update({
      where: { id: o.id },
      data: {
        corporateStatus: 'PROBABLE_CORPORATE_NAME',
      },
    });
    corporateRepairedCount++;
  }
  console.log(`✔ Successfully updated ${corporateRepairedCount} ownership records to PROBABLE_CORPORATE_NAME.`);

  // 4. Repair Multi-Ring Polygon Centroids using Green's Theorem Area-Weighted Algorithm (Target: 4 parcels)
  console.log('\n--- 3. REPAIRING MULTI-RING POLYGON CENTROIDS (Target: 4 parcels) ---');
  const multiRingPins = ['0119300010', '0127190026', '0127230008', '2326010577'];
  const multiRingProps = await prisma.property.findMany({
    where: { parcelId: { in: multiRingPins } },
  });

  console.log(`Identified ${multiRingProps.length} multi-ring parcels.`);
  let centroidRepairedCount = 0;

  for (const p of multiRingProps) {
    const geo = p.geometryGeoJson as any;
    if (geo?.coordinates && Array.isArray(geo.coordinates)) {
      const { centroid } = parsePolygonGeometry(geo.coordinates);
      if (centroid) {
        console.log(`  PIN ${p.parcelId}: Old=[${p.latitude}, ${p.longitude}] -> Area-Weighted=[${centroid.lat}, ${centroid.lon}]`);
        await prisma.property.update({
          where: { id: p.id },
          data: {
            latitude: centroid.lat,
            longitude: centroid.lon,
          },
        });
        centroidRepairedCount++;
      }
    }
  }
  console.log(`✔ Successfully repaired ${centroidRepairedCount} multi-ring parcel centroids.`);

  console.log('\n--- REPAIR EXECUTION FINISHED CLEANLY ---');
}

main()
  .catch((e) => {
    console.error('Repair execution failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
