import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {
  analyzePolygonRing,
  computeInteriorRepresentativePoint,
  doSegmentsIntersect,
  isPointInMunicipalBoundary,
  isPointInPolygonRings,
  isPointInRing,
  isPointOnSegment,
} from '../point-in-polygon';
import {
  classifyParcelMunicipalJurisdiction,
} from '../municipal-boundary';
import {
  boundaryToTurfFeature,
  classifyParcelWithTurf,
  parcelRingsToTurfFeature,
} from '../turf-validator';
import { GeoPoint, OmahaMunicipalBoundary, PolygonRingWithBounds } from '../types';

console.log('--- OMAHA MUNICIPAL BOUNDARY & GEOMETRY UNIT TESTS (WITH TURF.JS VALIDATION) ---');

// Build mock boundary:
// Exterior ring: [ -96.10, 41.20 ] to [ -96.00, 41.30 ] (Clockwise, area < 0)
// Hole ring (enclave): [ -96.06, 41.24 ] to [ -96.04, 41.26 ] (Counter-clockwise, area > 0)
const mockExteriorCoords = [
  [-96.10, 41.20],
  [-96.10, 41.30],
  [-96.00, 41.30],
  [-96.00, 41.20],
  [-96.10, 41.20],
];
const mockHoleCoords = [
  [-96.06, 41.24],
  [-96.04, 41.24],
  [-96.04, 41.26],
  [-96.06, 41.26],
  [-96.06, 41.24],
];

const mockExterior = analyzePolygonRing(mockExteriorCoords)!;
const mockHole = analyzePolygonRing(mockHoleCoords)!;

const mockBoundary: OmahaMunicipalBoundary = {
  exteriorRings: [mockExterior],
  holeRings: [mockHole],
  totalBounds: { minLon: -96.10, minLat: 41.20, maxLon: -96.00, maxLat: 41.30 },
  cityName: 'Omaha',
  sourceFips: '37000',
  sqMiles: 146.25,
  ringsCount: 2,
};

// 1. Ring Analysis & Winding Order
{
  assert.equal(mockExterior.isHole, false, 'Clockwise ring must be recognized as exterior');
  assert.equal(mockHole.isHole, true, 'Counter-clockwise ring must be recognized as interior hole');
  console.log('  ✔ PASS: Polygon ring analysis correctly identifies exterior vs hole by winding area');
}

// 2. Point Containment with Holes
{
  const ptInside: GeoPoint = { lon: -96.02, lat: 41.22 };
  assert.equal(isPointInMunicipalBoundary(ptInside, mockBoundary), true);

  const ptOutside: GeoPoint = { lon: -96.35, lat: 41.28 };
  assert.equal(isPointInMunicipalBoundary(ptOutside, mockBoundary), false);

  const ptInHole: GeoPoint = { lon: -96.05, lat: 41.25 };
  assert.equal(
    isPointInMunicipalBoundary(ptInHole, mockBoundary),
    false,
    'Point inside an enclave hole must be evaluated as OUTSIDE municipal boundary'
  );

  console.log('  ✔ PASS: Point containment accurately includes interior points and excludes enclave holes');
}

// 3. Fully Inside Parcel Classification
{
  const insideParcelRings = [
    [
      [-96.03, 41.21],
      [-96.03, 41.22],
      [-96.02, 41.22],
      [-96.02, 41.21],
      [-96.03, 41.21],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    insideParcelRings,
    mockBoundary,
    { lon: -96.025, lat: 41.215 }
  );
  assert.equal(res.outcome, 'INSIDE_OMAHA');
  assert.equal(res.centroidInsideBoundary, true);

  // Turf cross-validation
  const turfRes = classifyParcelWithTurf(insideParcelRings, mockBoundary);
  assert.equal(turfRes.outcome, 'INSIDE_OMAHA');
  console.log('  ✔ PASS: Fully inside parcels classify as INSIDE_OMAHA (Native + Turf.js verified)');
}

// 4. Fully Outside Parcel Classification
{
  const outsideParcelRings = [
    [
      [-96.35, 41.28],
      [-96.35, 41.29],
      [-96.34, 41.29],
      [-96.34, 41.28],
      [-96.35, 41.28],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    outsideParcelRings,
    mockBoundary,
    { lon: -96.345, lat: 41.285 }
  );
  assert.equal(res.outcome, 'OUTSIDE_OMAHA');
  assert.equal(res.centroidInsideBoundary, false);

  const turfRes = classifyParcelWithTurf(outsideParcelRings, mockBoundary);
  assert.equal(turfRes.outcome, 'OUTSIDE_OMAHA');
  console.log('  ✔ PASS: Fully outside parcels classify as OUTSIDE_OMAHA (Native + Turf.js verified)');
}

// 5. REGRESSION: Parcel completely containing a municipal enclave hole
{
  // A large parcel [ -96.07, 41.23 ] to [ -96.03, 41.27 ]
  // It completely encloses the enclave hole [ -96.06..-96.04, 41.24..41.26 ]
  const holeEnclosingParcel = [
    [
      [-96.07, 41.23],
      [-96.07, 41.27],
      [-96.03, 41.27],
      [-96.03, 41.23],
      [-96.07, 41.23],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    holeEnclosingParcel,
    mockBoundary,
    { lon: -96.05, lat: 41.25 }
  );
  assert.equal(
    res.outcome,
    'CROSSES_BOUNDARY',
    'Parcel enclosing an enclave hole must be classified as CROSSES_BOUNDARY'
  );

  const turfRes = classifyParcelWithTurf(holeEnclosingParcel, mockBoundary);
  assert.equal(turfRes.outcome, 'CROSSES_BOUNDARY');
  console.log('  ✔ PASS: Parcel completely containing a municipal enclave hole classifies as CROSSES_BOUNDARY');
}

// 6. REGRESSION: Parcel touching, but not crossing, the municipal boundary (Conservative Policy)
{
  // Exterior boundary has western edge along lon = -96.10
  // Parcel is located inside Omaha [ -96.10, 41.21 ] to [ -96.08, 41.23 ]
  // Touching the boundary exactly along lon = -96.10
  const boundaryTouchingParcel = [
    [
      [-96.10, 41.21],
      [-96.10, 41.23],
      [-96.08, 41.23],
      [-96.08, 41.21],
      [-96.10, 41.21],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    boundaryTouchingParcel,
    mockBoundary,
    { lon: -96.09, lat: 41.22 }
  );
  assert.equal(
    res.outcome,
    'CROSSES_BOUNDARY',
    'Boundary-touching parcel must be quarantined as CROSSES_BOUNDARY under conservative policy'
  );
  assert.match(res.notes.join(';'), /touches municipal boundary line/i);

  const turfRes = classifyParcelWithTurf(boundaryTouchingParcel, mockBoundary);
  assert.equal(turfRes.outcome, 'CROSSES_BOUNDARY');
  console.log('  ✔ PASS: Parcel touching municipal boundary classifies as CROSSES_BOUNDARY (Conservative policy verified)');
}

// 7. REGRESSION: Parcel overlapping an enclave boundary
{
  // Overlaps the east edge of the enclave hole (-96.04)
  const enclaveOverlappingParcel = [
    [
      [-96.045, 41.245],
      [-96.045, 41.255],
      [-96.035, 41.255],
      [-96.035, 41.245],
      [-96.045, 41.245],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    enclaveOverlappingParcel,
    mockBoundary,
    { lon: -96.04, lat: 41.25 }
  );
  assert.equal(
    res.outcome,
    'CROSSES_BOUNDARY',
    'Parcel overlapping an enclave line must classify as CROSSES_BOUNDARY'
  );

  const turfRes = classifyParcelWithTurf(enclaveOverlappingParcel, mockBoundary);
  assert.equal(turfRes.outcome, 'CROSSES_BOUNDARY');
  console.log('  ✔ PASS: Parcel overlapping an enclave boundary classifies as CROSSES_BOUNDARY');
}

// 8. REGRESSION: Multipart parcel with disconnected exterior rings
{
  // Ring 0 is inside Omaha, Ring 1 is outside Omaha
  const multipartDisconnectedRings = [
    [
      [-96.02, 41.21],
      [-96.02, 41.22],
      [-96.01, 41.22],
      [-96.01, 41.21],
      [-96.02, 41.21],
    ],
    [
      [-96.35, 41.21],
      [-96.35, 41.22],
      [-96.34, 41.22],
      [-96.34, 41.21],
      [-96.35, 41.21],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    multipartDisconnectedRings,
    mockBoundary,
    { lon: -96.015, lat: 41.215 }
  );
  assert.equal(
    res.outcome,
    'CROSSES_BOUNDARY',
    'Multipart parcel spanning across boundary must classify as CROSSES_BOUNDARY'
  );
  console.log('  ✔ PASS: Multipart parcel with disconnected exterior rings classifies as CROSSES_BOUNDARY');
}

// 9. REGRESSION: Parcel with interior holes (donut-shaped parcel strictly inside Omaha)
{
  // Outer ring of parcel: [ -96.03, 41.21 ] to [ -96.01, 41.23 ] (Clockwise)
  // Inner hole of parcel: [ -96.025, 41.215 ] to [ -96.015, 41.225 ] (Counter-clockwise)
  const donutParcelRings = [
    [
      [-96.03, 41.21],
      [-96.03, 41.23],
      [-96.01, 41.23],
      [-96.01, 41.21],
      [-96.03, 41.21],
    ],
    [
      [-96.025, 41.215],
      [-96.015, 41.215],
      [-96.015, 41.225],
      [-96.025, 41.225],
      [-96.025, 41.215],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    donutParcelRings,
    mockBoundary,
    { lon: -96.028, lat: 41.212 }
  );
  assert.equal(
    res.outcome,
    'INSIDE_OMAHA',
    'Donut parcel cleanly inside Omaha must classify as INSIDE_OMAHA'
  );

  const turfRes = classifyParcelWithTurf(donutParcelRings, mockBoundary);
  assert.equal(turfRes.outcome, 'INSIDE_OMAHA');
  console.log('  ✔ PASS: Parcel with interior holes strictly inside Omaha classifies as INSIDE_OMAHA');
}

// 10. REGRESSION: Degenerate, invalid, and missing geometry
{
  assert.equal(classifyParcelMunicipalJurisdiction(null, mockBoundary, null).outcome, 'UNRESOLVED');
  assert.equal(classifyParcelMunicipalJurisdiction([], mockBoundary, null).outcome, 'UNRESOLVED');
  assert.equal(classifyParcelMunicipalJurisdiction([[[1, 2]]], mockBoundary, null).outcome, 'UNRESOLVED');
  assert.equal(
    classifyParcelMunicipalJurisdiction(
      [[[NaN, 41.20], [-96.01, 41.20], [-96.01, 41.21], [NaN, 41.20]]],
      mockBoundary,
      null
    ).outcome,
    'UNRESOLVED'
  );

  // Self-intersecting bowtie polygon via Turf
  const bowtieRing = [
    [
      [0, 0],
      [2, 2],
      [2, 0],
      [0, 2],
      [0, 0],
    ],
  ];
  const turfBowtie = classifyParcelWithTurf(bowtieRing, mockBoundary);
  assert.equal(turfBowtie.outcome, 'UNRESOLVED');
  assert.equal(turfBowtie.hasKinks, true);

  console.log('  ✔ PASS: Degenerate, invalid, and missing geometries safely produce UNRESOLVED');
}

// 11. REGRESSION: Polygon whose vertices appear inside Omaha but whose edges cross a municipal boundary
{
  // Consider a boundary with an enclave hole at [-96.06..-96.04, 41.24..41.26]
  // A U-shaped or angled polygon whose two ends are at (-96.07, 41.25) and (-96.03, 41.25)
  // Both endpoints are inside Omaha! But the straight line between them passes through the enclave hole!
  const edgeCrossingPolygon = [
    [
      [-96.07, 41.248],
      [-96.07, 41.252],
      [-96.03, 41.252],
      [-96.03, 41.248],
      [-96.07, 41.248],
    ],
  ];
  const res = classifyParcelMunicipalJurisdiction(
    edgeCrossingPolygon,
    mockBoundary,
    { lon: -96.05, lat: 41.25 }
  );
  assert.equal(
    res.outcome,
    'CROSSES_BOUNDARY',
    'Polygon whose vertices are inside but whose edges cross enclave must classify as CROSSES_BOUNDARY'
  );

  const turfRes = classifyParcelWithTurf(edgeCrossingPolygon, mockBoundary);
  assert.equal(turfRes.outcome, 'CROSSES_BOUNDARY');
  console.log('  ✔ PASS: Polygon with vertices inside Omaha whose edges cross municipal line classifies as CROSSES_BOUNDARY');
}

// 12. Geometric Centroid vs. Interior Representative Point (C-shaped parcel)
{
  const cShapedPolygon = [
    [
      [0, 0],
      [0, 3],
      [3, 3],
      [3, 2],
      [1, 2],
      [1, 1],
      [3, 1],
      [3, 0],
      [0, 0],
    ],
  ];

  const falseExteriorCentroid: GeoPoint = { lon: 2.0, lat: 1.5 }; // in the notch!
  assert.equal(isPointInPolygonRings(falseExteriorCentroid, cShapedPolygon), false);

  const repPoint = computeInteriorRepresentativePoint(cShapedPolygon, falseExteriorCentroid);
  assert.ok(repPoint);
  assert.equal(isPointInPolygonRings(repPoint, cShapedPolygon), true);

  console.log('  ✔ PASS: Interior representative point guarantees placement inside non-convex/C-shaped parcels');
}

console.log('\nOMAHA MUNICIPAL BOUNDARY TESTS: ALL 12/12 CHECKS PASSED (TURF.JS CROSS-VALIDATED)\n');
