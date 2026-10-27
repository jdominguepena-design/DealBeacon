import assert from 'node:assert/strict';
import { matchOmahaHotlineReports } from '../hotline-linker';
import * as turf from '@turf/turf';

console.log('=== CONSERVATIVE HOTLINE LINKER UNIT TESTS ===\n');

async function runHotlineLinkerTests() {
  const poly1 = turf.polygon([[
    [-95.9385, 41.2575],
    [-95.9375, 41.2575],
    [-95.9375, 41.2565],
    [-95.9385, 41.2565],
    [-95.9385, 41.2575],
  ]]);

  const propertiesTable = [
    {
      id: 'prop-1',
      parcelId: '0313630000',
      address: '1701 FARNAM ST',
      city: 'Omaha',
      zip: '68102',
      hasAuthoritativeAddress: true,
      geometryGeoJson: poly1.geometry,
    },
  ];

  // Test 1: Category Pothole -> EXCLUDED_INFRASTRUCTURE (Zero property link)
  {
    const reportsTable = [
      {
        id: 'rep-1',
        requestId: '629894',
        reportCategory: 'Pothole',
        problemType: 'Pothole in Street',
        locationText: '1701 Farnam St, Omaha, NE, 68102',
        latitude: 41.2570,
        longitude: -95.9380,
        matchStatus: 'UNMATCHED',
        propertyId: null,
      },
    ];

    const mockPrisma: any = {
      property: { findMany: async () => propertiesTable },
      hotlineReport: {
        findMany: async () => reportsTable,
        update: async ({ where, data }: any) => {
          const r = reportsTable.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
    };

    const res = await matchOmahaHotlineReports(mockPrisma, { dryRun: false });
    assert.equal(res.excludedInfrastructureCount, 1);
    assert.equal(res.linkedConfirmedCount, 0);
    assert.equal(reportsTable[0].propertyId, null);
    assert.equal(reportsTable[0].matchStatus, 'EXCLUDED_INFRASTRUCTURE');
    console.log('✔ PASS [Test 1]: Infrastructure category (Pothole) excluded from private parcel matching');
  }

  // Test 2: Dual evidence code violation -> CONFIRMED (Linked to Property)
  {
    const reportsTable = [
      {
        id: 'rep-2',
        requestId: '629895',
        reportCategory: 'Code/Housing Violati',
        problemType: 'Exterior Maintenance',
        locationText: '1701 Farnam St, Omaha, NE, 68102',
        latitude: 41.2570,
        longitude: -95.9380,
        matchStatus: 'UNMATCHED',
        matchMethod: null as string | null,
        matchConfidence: null as string | null,
        propertyId: null as string | null,
      },
    ];

    const mockPrisma: any = {
      property: { findMany: async () => propertiesTable },
      hotlineReport: {
        findMany: async () => reportsTable,
        update: async ({ where, data }: any) => {
          const r = reportsTable.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
    };

    const res = await matchOmahaHotlineReports(mockPrisma, { dryRun: false });
    assert.equal(res.linkedConfirmedCount, 1);
    assert.equal(reportsTable[0].propertyId, 'prop-1');
    assert.equal(reportsTable[0].matchStatus, 'CONFIRMED');
    assert.equal(reportsTable[0].matchConfidence, 'HIGH');
    console.log('✔ PASS [Test 2]: Dual evidence code violation confirmed and linked');
  }

  // Test 3: Spatial containment without address corroboration -> PROBABLE_UNRESOLVED (Left Unlinked)
  {
    const reportsTable = [
      {
        id: 'rep-3',
        requestId: '629896',
        reportCategory: 'Parks_Trees_Weeds',
        problemType: 'Overgrown Grass',
        locationText: 'Unknown Alley, Omaha, NE',
        latitude: 41.2570,
        longitude: -95.9380,
        matchStatus: 'UNMATCHED',
        propertyId: null,
      },
    ];

    const mockPrisma: any = {
      property: { findMany: async () => propertiesTable },
      hotlineReport: {
        findMany: async () => reportsTable,
        update: async ({ where, data }: any) => {
          const r = reportsTable.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
    };

    const res = await matchOmahaHotlineReports(mockPrisma, { dryRun: false });
    assert.equal(res.spatialOnlyUnlinkedCount, 1);
    assert.equal(reportsTable[0].propertyId, null);
    assert.equal(reportsTable[0].matchStatus, 'PROBABLE_UNRESOLVED');
    console.log('✔ PASS [Test 3]: Spatial point in polygon without address verification remains safely unlinked');
  }

  // Test 4: Intersection syntax -> EXCLUDED_RIGHT_OF_WAY (Left Unlinked)
  {
    const reportsTable = [
      {
        id: 'rep-4',
        requestId: '629897',
        reportCategory: 'Code/Housing Violati',
        problemType: 'Trash Issue',
        locationText: 'Farnam St & 17th St, Omaha, NE',
        latitude: 41.2570,
        longitude: -95.9380,
        matchStatus: 'UNMATCHED',
        propertyId: null,
      },
    ];

    const mockPrisma: any = {
      property: { findMany: async () => propertiesTable },
      hotlineReport: {
        findMany: async () => reportsTable,
        update: async ({ where, data }: any) => {
          const r = reportsTable.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
    };

    const res = await matchOmahaHotlineReports(mockPrisma, { dryRun: false });
    assert.equal(res.excludedRightOfWayCount, 1);
    assert.equal(reportsTable[0].propertyId, null);
    assert.equal(reportsTable[0].matchStatus, 'EXCLUDED_INFRASTRUCTURE');
    console.log('✔ PASS [Test 4]: Intersection & corridor descriptions excluded from private parcels');
  }

  console.log('\n======================================================');
  console.log('ALL 4/4 HOTLINE LINKER PIPELINE UNIT TESTS PASSED');
  console.log('======================================================\n');
}

runHotlineLinkerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
