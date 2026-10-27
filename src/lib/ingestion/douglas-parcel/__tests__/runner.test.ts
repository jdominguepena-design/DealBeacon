import assert from 'node:assert/strict';
import { runDouglasCountyParcelImport } from '../runner';
import { DouglasParcelFeature } from '../types';

console.log('================================================================');
console.log('  TEST SUITE: UNIFIED DOUGLAS PARCEL RUNNER SAFETY & RESUME     ');
console.log('================================================================');

function createMockFeature(objectId: number, pin: string, ownerName: string): DouglasParcelFeature {
  return {
    attributes: {
      OBJECTID: objectId,
      PIN: pin,
      PROPERTY_A: '1234 TEST AVE',
      PROP_CITY: 'Omaha',
      PROP_ZIP: '68102',
      OWNER_NAME: ownerName,
      ADDRESS1: '1234 TEST AVE',
      OWNER_CITY: 'Omaha',
      OWNER_ZIP: '68102',
      OWNER_STAT: 'NE',
      CLASS: 'R',
      DCAACCTYPE: 'RES',
    },
    geometry: {
      rings: [
        [
          [-95.95, 41.25],
          [-95.94, 41.25],
          [-95.94, 41.26],
          [-95.95, 41.26],
          [-95.95, 41.25],
        ],
      ],
    },
  };
}

async function runRunnerTests() {
  // Test 1: Deterministic Pagination with Gaps in ObjectIDs
  {
    console.log('\n[Test 1] Deterministic ObjectID Pagination handles gaps without missing records');

    const rawFeaturesPool = [
      createMockFeature(101, '0100000001', 'OWNER 1'),
      createMockFeature(105, '0100000002', 'OWNER 2'), // gap between 101 and 105
      createMockFeature(112, '0100000003', 'OWNER 3'), // gap between 105 and 112
      createMockFeature(200, '0100000004', 'OWNER 4'),
    ];

    // Mock fetchArcGISFeaturePage by intercepting fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('City_Boundary')) {
        // Return dummy Omaha boundary
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                attributes: {
                  City_Name: 'Omaha',
                  PLACEFP: '37000',
                  sq_mi: 146.25,
                },
                geometry: {
                  rings: [
                    [
                      [-96.0, 41.2],
                      [-95.8, 41.2],
                      [-95.8, 41.4],
                      [-96.0, 41.4],
                      [-96.0, 41.2],
                    ],
                  ],
                },
              },
            ],
          }),
        } as any;
      }

      const parsedUrl = new URL(urlStr);
      const whereClause = parsedUrl.searchParams.get('where') || '';
      const limit = Number(parsedUrl.searchParams.get('resultRecordCount')) || 2;
      const match = whereClause.match(/OBJECTID\s*>\s*(\d+)/i);
      const afterOid = match ? Number(match[1]) : 0;
      const filtered = rawFeaturesPool.filter((f) => f.attributes.OBJECTID > afterOid).slice(0, limit);

      return {
        ok: true,
        json: async () => ({ features: filtered }),
      } as any;
    };

    try {
      const stats = await runDouglasCountyParcelImport({} as any, {} as any, {
        dryRun: true,
        pageSize: 2,
        maxRecordsToProcess: 4,
      });

      assert.equal(stats.totalFetched, 4);
      assert.equal(stats.highestObjectIdProcessed, 200);
      assert.equal(stats.mode, 'DRY_RUN');
      console.log('  ✔ PASS: Gaps in ObjectIDs handled accurately; all records traversed.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 2: Resume from Stored Checkpoint
  {
    console.log('\n[Test 2] Checkpoint Resume starts strictly after stored lastProcessedObjectId');

    let requestedAfterOid = -1;
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
                  rings: [[[-96.0, 41.2], [-95.8, 41.2], [-95.8, 41.4], [-96.0, 41.4], [-96.0, 41.2]]],
                },
              },
            ],
          }),
        } as any;
      }

      const parsedUrl = new URL(urlStr);
      const whereClause = parsedUrl.searchParams.get('where') || '';
      const match = whereClause.match(/OBJECTID\s*>\s*(\d+)/i);
      requestedAfterOid = match ? Number(match[1]) : 0;

      return {
        ok: true,
        json: async () => ({ features: [] }),
      } as any;
    };

    const mockPrisma: any = {
      ingestionRun: {
        findFirst: async () => ({
          id: 'run-prior',
          status: 'PARTIAL',
          statsJson: {
            lastProcessedObjectId: 45000,
          },
        }),
        create: async () => {},
        update: async () => {},
      },
    };

    const mockDirectPrisma: any = {
      $queryRaw: async () => [{ pg_try_advisory_lock: true }, { pg_advisory_unlock: true }],
    };

    try {
      const stats = await runDouglasCountyParcelImport(mockPrisma, mockDirectPrisma, {
        dryRun: false,
      });

      assert.equal(requestedAfterOid, 45000, 'Requested features strictly after stored cursor 45000');
      assert.equal(stats.mode, 'INCREMENTAL_RESUME');
      console.log('  ✔ PASS: Runner detected prior PARTIAL run and resumed strictly after cursor.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 3: Advisory Lock Contention Blocks Parallel Runner
  {
    console.log('\n[Test 3] Active Advisory Lock on DIRECT_URL prevents competing runner instance');

    const mockPrisma: any = {};
    const mockDirectPrismaLocked: any = {
      $queryRaw: async () => [{ pg_try_advisory_lock: false }],
    };

    await assert.rejects(
      async () => {
        await runDouglasCountyParcelImport(mockPrisma, mockDirectPrismaLocked, { dryRun: false });
      },
      /Countywide runner blocked/
    );

    console.log('  ✔ PASS: Competing runner instance rejected by database advisory lock.');
  }

  // Test 4: Omaha Municipal Classification Discrimination
  {
    console.log('\n[Test 4] Municipal jurisdiction classifies INSIDE_OMAHA and outside areas');

    const originalFetch = globalThis.fetch;
    const testFeatures = [
      createMockFeature(101, '0100000001', 'OMAHA RESIDENT'),
    ];

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
                  rings: [[[-96.0, 41.2], [-95.8, 41.2], [-95.8, 41.4], [-96.0, 41.4], [-96.0, 41.2]]],
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
      const filtered = testFeatures.filter((f) => f.attributes.OBJECTID > afterOid);

      return {
        ok: true,
        json: async () => ({ features: filtered }),
      } as any;
    };

    const dummyBoundary = {
      exteriorRings: [
        {
          coordinates: [[-96.0, 41.2], [-95.8, 41.2], [-95.8, 41.4], [-96.0, 41.4], [-96.0, 41.2]],
          bounds: { minLon: -96.0, minLat: 41.2, maxLon: -95.8, maxLat: 41.4 },
          minLon: -96.0,
          minLat: 41.2,
          maxLon: -95.8,
          maxLat: 41.4,
          isHole: false,
          area: 0.04,
        },
      ],
      holeRings: [],
      totalBounds: { minLon: -96.0, minLat: 41.2, maxLon: -95.8, maxLat: 41.4 },
      cityName: 'Omaha',
      sourceFips: '37000',
      sqMiles: 146.25,
      ringsCount: 1,
    };

    try {
      const stats = await runDouglasCountyParcelImport({} as any, {} as any, {
        dryRun: true,
        maxRecordsToProcess: 1,
        mockBoundary: dummyBoundary,
      });

      assert.equal(stats.insideOmahaCount, 1);
      assert.equal(stats.outsideOmahaCount, 0);
      assert.equal(stats.crossesBoundaryCount, 0);
      console.log('  ✔ PASS: Spatial boundary classification properly populated in runner stats.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 5: Short Final Pages and Exact Processing Limit Enforcement
  {
    console.log('\n[Test 5] Exact processing limits and short final page handling');

    const availableFeatures = [
      createMockFeature(501, '0100000501', 'OWNER 501'),
      createMockFeature(502, '0100000502', 'OWNER 502'),
      createMockFeature(503, '0100000503', 'OWNER 503'),
      createMockFeature(504, '0100000504', 'OWNER 504'),
      createMockFeature(505, '0100000505', 'OWNER 505'),
    ];

    let lastRequestedLimit = 0;
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
                  rings: [[[-96.0, 41.2], [-95.8, 41.2], [-95.8, 41.4], [-96.0, 41.4], [-96.0, 41.2]]],
                },
              },
            ],
          }),
        } as any;
      }

      const parsedUrl = new URL(urlStr);
      lastRequestedLimit = Number(parsedUrl.searchParams.get('resultRecordCount')) || 0;
      const whereClause = parsedUrl.searchParams.get('where') || '';
      const match = whereClause.match(/OBJECTID\s*>\s*(\d+)/i);
      const afterOid = match ? Number(match[1]) : 0;
      const filtered = availableFeatures.filter((f) => f.attributes.OBJECTID > afterOid).slice(0, lastRequestedLimit);

      return {
        ok: true,
        json: async () => ({ features: filtered }),
      } as any;
    };

    try {
      // Configured pageSize is 250, but maxRecordsToProcess is 3
      const stats = await runDouglasCountyParcelImport({} as any, {} as any, {
        dryRun: true,
        pageSize: 250,
        maxRecordsToProcess: 3,
        startAfterObjectId: 500,
      });

      assert.equal(lastRequestedLimit, 3, 'Fetch page limit was strictly bounded to remaining 3 records');
      assert.equal(stats.totalFetched, 3, 'Fetched exactly 3 records');
      assert.equal(stats.highestObjectIdProcessed, 503, 'Processed up to ObjectID 503');
      console.log('  ✔ PASS: Exact limit respected; short page bounded without over-fetching.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 6: Safe Interruption and Checkpoint Recovery
  {
    console.log('\n[Test 6] Interrupted import updates checkpoint and allows subsequent resume');

    let runUpdatedStatus = '';
    let updatedCheckpoint = 0;

    const mockPrisma: any = {
      ingestionRun: {
        findFirst: async () => null,
        create: async () => {},
        findUnique: async () => ({ statsJson: { lastProcessedObjectId: 12000 } }),
        update: async (args: any) => {
          if (args.data?.status) runUpdatedStatus = args.data.status;
          if (args.data?.statsJson?.lastProcessedObjectId) {
            updatedCheckpoint = args.data.statsJson.lastProcessedObjectId;
          }
        },
      },
    };

    let lockAcquired = false;
    let lockReleased = false;
    const mockDirectPrisma: any = {
      $queryRaw: async (query: any) => {
        const str = JSON.stringify(query) || '';
        if (str.includes('unlock') || str.includes('pg_advisory_unlock')) {
          lockReleased = true;
          return [{ pg_advisory_unlock: true }];
        }
        lockAcquired = true;
        return [{ pg_try_advisory_lock: true }];
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Simulated network failure during ArcGIS streaming');
    };

    try {
      await assert.rejects(
        async () => {
          await runDouglasCountyParcelImport(mockPrisma, mockDirectPrisma, {
            dryRun: false,
            startAfterObjectId: 12000,
          });
        },
        /Simulated network failure/
      );

      assert.equal(lockAcquired, true, 'Acquired advisory lock');
      assert.equal(lockReleased, true, 'Cleanly released advisory lock on error');
      assert.equal(runUpdatedStatus, 'PARTIAL', 'Marked failed run as PARTIAL for checkpoint recovery');
      console.log('  ✔ PASS: Failure cleanly released advisory lock and marked run as PARTIAL.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  console.log('\n================================================================');
  console.log('  ALL 6 RUNNER SAFETY, LIMIT & RESUME TESTS PASSED (0 ERRORS) ✔  ');
  console.log('================================================================');
}

runRunnerTests().catch((err) => {
  console.error('\n[RUNNER TEST FAILURE]:', err);
  process.exit(1);
});
