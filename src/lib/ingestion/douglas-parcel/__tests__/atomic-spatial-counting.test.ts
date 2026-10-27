import assert from 'node:assert/strict';
import { runDouglasCountyParcelImport } from '../runner';
import { DouglasParcelFeature } from '../types';

console.log('--- RUNNER SPATIAL COUNTER ATOMIC COMMIT REGRESSION TEST ---');

function createMockFeature(objectId: number, pin: string, isInside: boolean): DouglasParcelFeature {
  return {
    attributes: {
      OBJECTID: objectId,
      PIN: pin,
      PROPERTY_A: `${objectId} TEST ST`,
      PROP_CITY: isInside ? 'OMAHA' : 'VALLEY',
      OWNER_NAME: 'TEST OWNER',
      ADDRESS1: '100 MAILING ST',
      OWNER_CITY: 'OMAHA',
      OWNER_ZIP: '68102',
      PROP_ZIP: '68102',
      OWNER_STAT: 'NE',
      CLASS: 'R',
      DCAACCTYPE: 'RES',
      SQ_FEET: 5000,
    },
    geometry: {
      rings: isInside
        ? [[[-95.95, 41.25], [-95.94, 41.25], [-95.94, 41.26], [-95.95, 41.26], [-95.95, 41.25]]]
        : [[[-96.50, 41.50], [-96.49, 41.50], [-96.49, 41.51], [-96.50, 41.51], [-96.50, 41.50]]],
    },
  };
}

async function runTest() {
  // 50 synthetic features:
  // Batch 1 (OIDs 1-25): 15 inside Omaha, 10 outside Omaha
  // Batch 2 (OIDs 26-50): 10 inside Omaha, 15 outside Omaha
  const rawFeaturesPool: DouglasParcelFeature[] = [];
  for (let i = 1; i <= 50; i++) {
    const isInside = i <= 15 || (i > 25 && i <= 35);
    rawFeaturesPool.push(createMockFeature(i, `PIN-${i.toString().padStart(5, '0')}`, isInside));
  }

  // Intercept fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('City_Boundary')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: { City_Name: 'Omaha', PLACEFP: '37000', sq_mi: 146.25 },
              geometry: {
                rings: [[[-96.0, 41.2], [-96.0, 41.3], [-95.9, 41.3], [-95.9, 41.2], [-96.0, 41.2]]],
              },
            },
          ],
        }),
      } as any;
    }

    const parsedUrl = new URL(urlStr);
    const whereClause = parsedUrl.searchParams.get('where') || '';
    const match = whereClause.match(/OBJECTID\s*>\s*(\d+)/i);
    const afterOid = match ? Number(match[1]) : 0;
    const limit = Number(parsedUrl.searchParams.get('resultRecordCount')) || 50;

    const filtered = rawFeaturesPool.filter((f) => f.attributes.OBJECTID > afterOid).slice(0, limit);

    return {
      ok: true,
      json: async () => ({ features: filtered }),
    } as any;
  };

  let committedBatches = 0;
  let lastPreservedStats: any = null;
  let lastCommittedStats: any = null;

  const runsTable = new Map<string, any>();

  const mockTx: any = {
    property: {
      findMany: async () => [],
      createMany: async () => ({ count: 25 }),
      create: async ({ data }: any) => ({ id: `prop-${data.parcelId}`, ...data }),
      update: async ({ data }: any) => data,
    },
    sourceRecord: {
      findMany: async () => [],
      findUnique: async () => null,
      createMany: async () => ({ count: 25 }),
      create: async ({ data }: any) => ({ id: `src-${data.sourceRecordId}`, ...data }),
      update: async ({ data }: any) => data,
      upsert: async ({ create }: any) => ({ id: `src-${create.sourceRecordId}`, ...create }),
    },
    ownershipRecord: {
      findMany: async () => [],
      createMany: async () => ({ count: 25 }),
      create: async ({ data }: any) => ({ id: `own-${data.propertyId}`, ...data }),
      update: async ({ data }: any) => data,
    },
    ingestionRun: {
      findUnique: async ({ where }: any) => runsTable.get(where.id) || null,
      update: async ({ where, data }: any) => {
        const existing = runsTable.get(where.id) || {};
        const updated = {
          ...existing,
          ...data,
          recordsIngested: (existing.recordsIngested || 0) + (data.recordsIngested?.increment || 0),
          statsJson: data.statsJson || existing.statsJson,
        };
        runsTable.set(where.id, updated);
        lastCommittedStats = updated.statsJson;
        return updated;
      },
    },
  };

  const mockPrisma: any = {
    $transaction: async (fn: any) => {
      committedBatches++;
      if (committedBatches === 2) {
        throw new Error('Simulated failure on batch 2');
      }
      return await fn(mockTx);
    },
    ingestionRun: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        runsTable.set(data.id, { ...data, recordsIngested: 0 });
        lastCommittedStats = data.statsJson;
        return data;
      },
      update: async ({ where, data }: any) => {
        const existing = runsTable.get(where.id) || {};
        const updated = { ...existing, ...data };
        runsTable.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }: any) => runsTable.get(where.id) || null,
    },
  };

  const mockDirectPrisma: any = {
    $queryRaw: async () => [{ pg_try_advisory_lock: true }],
    $executeRaw: async () => 1,
  };

  try {
    let thrownError: any = null;
    try {
      await runDouglasCountyParcelImport(mockPrisma, mockDirectPrisma, {
        batchSize: 25,
        pageSize: 50,
        maxRecordsToProcess: 50,
        dryRun: false,
        customRunId: 'test-spatial-atomic-run',
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Expected runner to throw on batch 2 failure');
    console.log('Committed stats stored in checkpoint:');
    console.log('• insideOmahaCount    :', lastCommittedStats?.insideOmahaCount);
    console.log('• outsideOmahaCount   :', lastCommittedStats?.outsideOmahaCount);
    console.log('• crossesBoundaryCount:', lastCommittedStats?.crossesBoundaryCount);
    console.log('• lastProcessedObjectId:', lastCommittedStats?.lastProcessedObjectId);

    // Verify: Only Batch 1 was committed (15 inside, 10 outside, max OID 25)
    // Batch 2 (10 inside, 15 outside) threw and its stats MUST NOT be present in lastCommittedStats!
    assert.equal(lastCommittedStats?.insideOmahaCount, 15, 'insideOmahaCount must equal exactly batch 1');
    assert.equal(lastCommittedStats?.outsideOmahaCount, 10, 'outsideOmahaCount must equal exactly batch 1');
    assert.equal(lastCommittedStats?.crossesBoundaryCount, 0, 'crossesBoundaryCount must equal 0');
    assert.equal(lastCommittedStats?.lastProcessedObjectId, 25, 'lastProcessedObjectId must stay at batch 1 (25)');

    console.log('✔ PASS: Spatial statistics advance strictly per committed batch. Failed batch 2 was excluded from checkpoints.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
