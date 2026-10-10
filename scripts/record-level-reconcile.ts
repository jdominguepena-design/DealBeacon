import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { fetchHotlineFeatures } from '../src/lib/ingestion/omaha-hotline/arcgis-client';
import { normalizeHotlineFeature } from '../src/lib/ingestion/omaha-hotline/normalize';

try {
  process.loadEnvFile('.env');
} catch {}

const prisma = new PrismaClient();

async function main() {
  verifyNeonDevEndpoints();

  console.log('Fetching all upstream features using fetchHotlineFeatures...');
  const upstreamEligibleGlobalIds = new Set<string>();
  const upstreamExcludedGlobalIds = new Set<string>();

  let lastObjectId = 0;
  let hasMore = true;
  let totalFetched = 0;

  while (hasMore) {
    const { features } = await fetchHotlineFeatures({
      afterObjectId: lastObjectId,
      resultRecordCount: 250,
    });

    if (!features || features.length === 0) {
      hasMore = false;
      break;
    }

    totalFetched += features.length;

    for (const f of features) {
      if (f.attributes?.objectid) {
        lastObjectId = Math.max(lastObjectId, f.attributes.objectid);
      }
      const rawGlobalId = (f.attributes?.globalid ?? '').trim().toLowerCase();
      const normalized = normalizeHotlineFeature(f);
      if (normalized) {
        upstreamEligibleGlobalIds.add(normalized.sourceGlobalId.toLowerCase());
      } else {
        if (rawGlobalId) {
          upstreamExcludedGlobalIds.add(rawGlobalId);
        }
      }
    }
  }

  console.log(`Fetched ${totalFetched} raw features from ArcGIS.`);
  console.log(`Eligible upstream GlobalIDs: ${upstreamEligibleGlobalIds.size}`);
  console.log(`Excluded upstream GlobalIDs: ${upstreamExcludedGlobalIds.size}`);

  console.log('\nFetching all sourceGlobalIds from Neon dev database...');
  const dbRecords = await prisma.hotlineReport.findMany({
    select: { sourceGlobalId: true },
  });
  const dbGlobalIds = new Set(dbRecords.map((r) => r.sourceGlobalId.trim().toLowerCase()));
  console.log(`Fetched ${dbGlobalIds.size} sourceGlobalIds from Neon dev database.`);

  const missingInDb: string[] = [];
  for (const id of upstreamEligibleGlobalIds) {
    if (!dbGlobalIds.has(id)) {
      missingInDb.push(id);
    }
  }

  const unexpectedInDb: string[] = [];
  for (const id of dbGlobalIds) {
    if (!upstreamEligibleGlobalIds.has(id)) {
      unexpectedInDb.push(id);
    }
  }

  // Also check if any excluded IDs made it into DB
  const excludedFoundInDb: string[] = [];
  for (const id of upstreamExcludedGlobalIds) {
    if (dbGlobalIds.has(id)) {
      excludedFoundInDb.push(id);
    }
  }

  console.log('\n=== RECORD-LEVEL RECONCILIATION RESULT ===');
  console.log(`Upstream Eligible Count : ${upstreamEligibleGlobalIds.size}`);
  console.log(`Database Persisted Count: ${dbGlobalIds.size}`);
  console.log(`Missing in Database     : ${missingInDb.length}`);
  if (missingInDb.length > 0) {
    console.log('Sample missing IDs      :', missingInDb.slice(0, 5));
  }
  console.log(`Unexpected in Database  : ${unexpectedInDb.length}`);
  if (unexpectedInDb.length > 0) {
    console.log('Sample unexpected IDs   :', unexpectedInDb.slice(0, 5));
  }
  console.log(`Excluded Found in DB    : ${excludedFoundInDb.length}`);
  if (excludedFoundInDb.length > 0) {
    console.log('Sample excluded in DB   :', excludedFoundInDb.slice(0, 5));
  }
  console.log(`Exact 1-to-1 Parity     : ${missingInDb.length === 0 && unexpectedInDb.length === 0 && excludedFoundInDb.length === 0 ? 'CONFIRMED (100% RECORD-LEVEL MATCH)' : 'MISMATCH DETECTED'}`);
}

main()
  .catch((e) => {
    console.error('Reconciliation failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
