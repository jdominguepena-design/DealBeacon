import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {
  evaluateHotlineCandidate,
  normalizeStreetAddress,
  extractCleanAddress,
  ParcelSpatialCandidate,
  HotlineCandidateInput,
} from '@/lib/matching/hotline-matcher';

async function runHotlineMatcherTests() {
  console.log('=== HOTLINE MATCHER DETERMINISTIC UNIT TESTS ===\n');

  // Setup sample test parcels
  // Parcel 1: 1701 FARNAM ST (Downtown Omaha)
  const poly1 = turf.polygon([[
    [-95.9385, 41.2575],
    [-95.9375, 41.2575],
    [-95.9375, 41.2565],
    [-95.9385, 41.2565],
    [-95.9385, 41.2575],
  ]]);

  // Parcel 2: 1705 FARNAM ST (Adjacent parcel)
  const poly2 = turf.polygon([[
    [-95.9375, 41.2575],
    [-95.9365, 41.2575],
    [-95.9365, 41.2565],
    [-95.9375, 41.2565],
    [-95.9375, 41.2575],
  ]]);

  const sampleParcels: ParcelSpatialCandidate[] = [
    {
      id: 'p-1',
      parcelId: '0313630000',
      address: '1701 FARNAM ST',
      normalizedAddress: '1701 FARNAM ST',
      polygon: poly1,
    },
    {
      id: 'p-2',
      parcelId: '0313630001',
      address: '1705 FARNAM ST',
      normalizedAddress: '1705 FARNAM ST',
      polygon: poly2,
    },
  ];

  const addressIndex = new Map<string, ParcelSpatialCandidate[]>();
  addressIndex.set('1701 FARNAM ST', [sampleParcels[0]]);
  addressIndex.set('1705 FARNAM ST', [sampleParcels[1]]);

  // Test 1: Exact Address + Polygon Containment -> DUAL_EVIDENCE_CANDIDATE
  {
    const report: HotlineCandidateInput = {
      requestId: '629899',
      reportCategory: 'Code/Housing Violati',
      problemType: 'Exterior Maintenance',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9380, // Inside poly1
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, sampleParcels, addressIndex);
    assert.equal(res.classification, 'DUAL_EVIDENCE_CANDIDATE');
    assert.equal(res.candidatePin, '0313630000');
    assert.equal(res.candidateParcelId, 'p-1');
    assert.equal(res.spatialContainment, true);
    assert.equal(res.distanceToPolygonMeters, 0);
    assert.equal(res.addressMatch, true);
    assert.equal(res.isResponsibilityEstablished, false);
    assert.equal(res.isOfficiallyVerifiedViolation, false);
    console.log('✔ PASS [Test 1]: Exact address plus polygon containment yields DUAL_EVIDENCE_CANDIDATE');
  }

  // Test 2: Address and Coordinate Disagreement -> AMBIGUOUS_CONFLICT
  {
    const report: HotlineCandidateInput = {
      requestId: '629900',
      reportCategory: 'Code/Housing Violati',
      problemType: 'Exterior Maintenance',
      locationText: '1701 Farnam St, Omaha, NE, 68102', // Address is p-1
      longitude: -95.9370, // Coordinate is inside poly2 (p-2)
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, sampleParcels, addressIndex);
    assert.equal(res.classification, 'AMBIGUOUS_CONFLICT');
    assert.equal(res.candidateParcelId, null, 'Conflict must reject candidate parcelId');
    assert.equal(res.isResponsibilityEstablished, false);
    console.log('✔ PASS [Test 2]: Conflicting address vs coordinate yields AMBIGUOUS_CONFLICT and null candidate');
  }

  // Test 3: Public Right-of-Way / Infrastructure Exclusion
  {
    const potholeReport: HotlineCandidateInput = {
      requestId: '629901',
      reportCategory: 'Pothole',
      problemType: 'Pothole',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(potholeReport, sampleParcels, addressIndex);
    assert.equal(res.classification, 'EXCLUDED_PUBLIC_INFRASTRUCTURE');
    assert.equal(res.candidateParcelId, null);
    console.log('✔ PASS [Test 3]: Category "Pothole" is strictly excluded despite valid parcel address');
  }

  // Test 4: Intersection / Cross-Street Exclusion
  {
    const intersectionReport: HotlineCandidateInput = {
      requestId: '629902',
      reportCategory: 'Litter_Waste_Recycling',
      problemType: 'Litter Issue',
      locationText: '17th St & Farnam St, Omaha, NE',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(intersectionReport, sampleParcels, addressIndex);
    assert.equal(res.classification, 'EXCLUDED_RIGHT_OF_WAY');
    assert.equal(res.candidateParcelId, null);
    console.log('✔ PASS [Test 4]: Intersection syntax "&" is strictly excluded from parcel candidates');
  }

  // Test 5: Multiple-Parcel Ambiguity (e.g. multi-tenant condo or duplicate address)
  {
    const multiAddressIndex = new Map<string, ParcelSpatialCandidate[]>();
    multiAddressIndex.set('1701 FARNAM ST', [sampleParcels[0], sampleParcels[1]]); // Two parcels share address

    const report: HotlineCandidateInput = {
      requestId: '629903',
      reportCategory: 'Litter_Waste_Recycling',
      problemType: 'Illegal Dumping',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9000, // Outside both polygons
      latitude: 41.2000,
    };

    const res = evaluateHotlineCandidate(report, sampleParcels, multiAddressIndex);
    assert.equal(res.classification, 'AMBIGUOUS_MULTI_PARCEL');
    assert.equal(res.candidateParcelId, null);
    console.log('✔ PASS [Test 5]: Multiple address matches yield AMBIGUOUS_MULTI_PARCEL');
  }

  // Test 6: Missing or Malformed Location Data
  {
    const missingLocReport: HotlineCandidateInput = {
      requestId: '629904',
      reportCategory: 'Code/Housing Violati',
      problemType: 'Tall Weeds',
      locationText: null,
      longitude: null,
      latitude: null,
    };

    const res = evaluateHotlineCandidate(missingLocReport, sampleParcels, addressIndex);
    assert.equal(res.classification, 'EXCLUDED_RIGHT_OF_WAY');
    assert.equal(res.candidateParcelId, null);
    console.log('✔ PASS [Test 6]: Missing location text and coordinates fails closed');
  }

  // Test 7: Address Match Outside Polygon (Curbside geocode) calculates exact distance in meters
  {
    const curbsideReport: HotlineCandidateInput = {
      requestId: '629905',
      reportCategory: 'Graffiti',
      problemType: 'Graffiti',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9388, // Slightly west of poly1 (approx 25 meters outside boundary)
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(curbsideReport, sampleParcels, addressIndex);
    assert.equal(res.classification, 'ADDRESS_ONLY_CANDIDATE');
    assert.equal(res.candidatePin, '0313630000');
    assert.equal(res.spatialContainment, false);
    assert.ok(res.distanceToPolygonMeters! > 0, 'Distance to polygon edge must be positive number');
    console.log(`✔ PASS [Test 7]: Address match with curbside offset calculates polygon distance (${res.distanceToPolygonMeters}m)`);
  }

  // Test 8: Non-Attribution Invariants
  {
    const report: HotlineCandidateInput = {
      requestId: '629906',
      reportCategory: 'Vehicle_Parking',
      problemType: 'Abandoned Vehic(Str)',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, sampleParcels, addressIndex);
    assert.equal(res.isResponsibilityEstablished, false, 'Must never establish legal responsibility');
    assert.equal(res.isOfficiallyVerifiedViolation, false, 'Must never establish verified code violation');
    console.log('✔ PASS [Test 8]: Strict invariants: isResponsibilityEstablished=false, isOfficiallyVerifiedViolation=false');
  }

  // Test 9: Street Ordinal and Suffix Normalization (e.g. 20th St vs 20 St)
  {
    const ordinalParcel: ParcelSpatialCandidate = {
      id: 'p-3',
      parcelId: '0328770002',
      address: '1006 N 20 ST',
      normalizedAddress: normalizeStreetAddress('1006 N 20 ST'),
      polygon: poly1,
    };
    const testIndex = new Map<string, ParcelSpatialCandidate[]>();
    testIndex.set(ordinalParcel.normalizedAddress, [ordinalParcel]);

    const report: HotlineCandidateInput = {
      requestId: '630050',
      reportCategory: 'Vehicle_Parking',
      problemType: 'Abandoned Vehic(Str)',
      locationText: '1006 N 20th St, Omaha, NE, 68102',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, [ordinalParcel], testIndex);
    assert.equal(res.classification, 'DUAL_EVIDENCE_CANDIDATE', '20th St must match 20 ST when coordinates align');
    assert.equal(res.originalLocationText, '1006 N 20th St, Omaha, NE, 68102');
    assert.equal(res.normalizedReportAddress, '1006 N 20 ST');
    console.log('✔ PASS [Test 9]: Ordinal normalization ("20th St" -> "20 ST") verified with preserved source text');
  }

  // Test 10: Unit Preservation & Base Parcel Disambiguation
  {
    const baseParcel1: ParcelSpatialCandidate = {
      id: 'p-4a',
      parcelId: '0412340001',
      address: '4502 S 24 ST UNIT 1',
      normalizedAddress: normalizeStreetAddress('4502 S 24 ST UNIT 1'),
      polygon: poly1,
    };
    const baseParcel2: ParcelSpatialCandidate = {
      id: 'p-4b',
      parcelId: '0412340002',
      address: '4502 S 24 ST UNIT 2',
      normalizedAddress: normalizeStreetAddress('4502 S 24 ST UNIT 2'),
      polygon: poly1,
    };
    // Multi-parcel base address index
    const testMultiIndex = new Map<string, ParcelSpatialCandidate[]>();
    testMultiIndex.set('4502 S 24 ST', [baseParcel1, baseParcel2]);

    const reportUnresolved: HotlineCandidateInput = {
      requestId: '630051',
      reportCategory: 'Code/Housing Violati',
      problemType: 'Housing Standards',
      locationText: '4502 S 24th St Apt 3B, Omaha, NE, 68107',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const resUnresolved = evaluateHotlineCandidate(reportUnresolved, [baseParcel1, baseParcel2], testMultiIndex);
    assert.equal(resUnresolved.classification, 'AMBIGUOUS_MULTI_PARCEL', 'Unresolved unit among multiple parcels must yield AMBIGUOUS_MULTI_PARCEL');
    assert.equal(resUnresolved.normalizedReportAddress, '4502 S 24 ST APT 3B', 'Normalized address must preserve unit token');
    console.log('✔ PASS [Test 10]: Unit token preserved and multi-parcel base address correctly classified as AMBIGUOUS_MULTI_PARCEL');
  }

  // Test 11: Distant Coordinate Offset (Distant geocode outside parcel flagged for manual review)
  {
    const report: HotlineCandidateInput = {
      requestId: '632549',
      reportCategory: 'Vehicle_Parking',
      problemType: 'Abandoned Vehicle',
      locationText: '1701 Farnam St, Omaha, NE, 68102',
      longitude: -95.9395, // 75 meters outside poly1
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, sampleParcels, addressIndex);
    assert.equal(res.classification, 'ADDRESS_ONLY_CANDIDATE');
    assert.ok(res.distanceToPolygonMeters! > 50, 'Distance must accurately reflect 70+ meters');
    assert.ok(res.locationConsistencyNotes.includes('FLAGGED FOR MANDATORY HUMAN REVIEW'), 'Distant offset must be flagged for manual review');
    console.log(`✔ PASS [Test 11]: Distant coordinate offset classified as ADDRESS_ONLY_CANDIDATE and flagged for review (${res.distanceToPolygonMeters}m)`);
  }

  // Test 12: Single base parcel matching with unit specified
  {
    const singleBaseParcel: ParcelSpatialCandidate = {
      id: 'p-5',
      parcelId: '0412340000',
      address: '4502 S 24 ST',
      normalizedAddress: normalizeStreetAddress('4502 S 24 ST'),
      polygon: poly1,
    };
    const singleIndex = new Map<string, ParcelSpatialCandidate[]>();
    singleIndex.set('4502 S 24 ST', [singleBaseParcel]);

    const report: HotlineCandidateInput = {
      requestId: '630052',
      reportCategory: 'Code/Housing Violati',
      problemType: 'Housing Standards',
      locationText: '4502 S 24th St Apt 3B, Omaha, NE, 68107',
      longitude: -95.9380,
      latitude: 41.2570,
    };

    const res = evaluateHotlineCandidate(report, [singleBaseParcel], singleIndex);
    assert.equal(res.classification, 'DUAL_EVIDENCE_CANDIDATE');
    assert.equal(res.candidatePin, '0412340000');
    assert.equal(res.normalizedReportAddress, '4502 S 24 ST APT 3B');
    console.log('✔ PASS [Test 12]: Single base parcel matches with unit preserved in normalized address');
  }

  console.log('\n======================================================');
  console.log('ALL 12/12 HOTLINE MATCHER REGRESSION TESTS PASSED');
  console.log('======================================================\n');
}

runHotlineMatcherTests().catch(err => {
  console.error('Unit tests failed:', err);
  process.exit(1);
});

