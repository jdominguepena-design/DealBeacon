import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  BoundaryClassificationOutcome,
  BoundaryClassificationResult,
  GeoPoint,
  OmahaMunicipalBoundary,
} from './types';

/**
 * Converts OmahaMunicipalBoundary into a Turf.js MultiPolygon or Polygon feature.
 * The primary exterior ring forms the outer polygon, and all enclave hole rings
 * are holes in that polygon.
 */
export function boundaryToTurfFeature(
  boundary: OmahaMunicipalBoundary
): Feature<Polygon> {
  // Turf Polygon coordinates: [ [exteriorRingCoords], [hole1Coords], [hole2Coords], ... ]
  const coords: number[][][] = [
    boundary.exteriorRings[0].coordinates,
    ...boundary.holeRings.map((h) => h.coordinates),
  ];
  return turf.polygon(coords);
}

/**
 * Converts raw parcel rings into Turf.js Feature (Polygon or MultiPolygon).
 * Validates closure and minimum coordinate length.
 */
export function parcelRingsToTurfFeature(
  rings: number[][][]
): Feature<Polygon | MultiPolygon> | null {
  if (!rings || !Array.isArray(rings) || rings.length === 0) return null;

  try {
    // Check if rings are valid
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (Math.abs(first[0] - last[0]) > 1e-6 || Math.abs(first[1] - last[1]) > 1e-6) {
        // Force closure if open
        ring.push([first[0], first[1]]);
      }
    }

    // Single polygon with optional holes
    return turf.polygon(rings);
  } catch {
    return null;
  }
}

/**
 * Turf-based independent classification of parcel jurisdiction.
 * Provides independent mathematical verification against the native engine.
 */
export function classifyParcelWithTurf(
  parcelRings: number[][][] | null | undefined,
  boundary: OmahaMunicipalBoundary,
  options: { conservativeBoundaryTouching?: boolean } = { conservativeBoundaryTouching: true }
): {
  outcome: BoundaryClassificationOutcome;
  isWithin: boolean;
  isDisjoint: boolean;
  intersects: boolean;
  touches: boolean;
  hasKinks: boolean;
  enclaveOverlap: boolean;
  notes: string[];
} {
  const notes: string[] = [];

  if (!parcelRings || !Array.isArray(parcelRings) || parcelRings.length === 0) {
    return {
      outcome: 'UNRESOLVED',
      isWithin: false,
      isDisjoint: true,
      intersects: false,
      touches: false,
      hasKinks: false,
      enclaveOverlap: false,
      notes: ['Missing or empty parcel rings'],
    };
  }

  const parcelFeature = parcelRingsToTurfFeature(parcelRings);
  if (!parcelFeature) {
    return {
      outcome: 'UNRESOLVED',
      isWithin: false,
      isDisjoint: true,
      intersects: false,
      touches: false,
      hasKinks: false,
      enclaveOverlap: false,
      notes: ['Malformed or degenerate parcel geometry'],
    };
  }

  // Check self-intersection (kinks)
  const kinks = turf.kinks(parcelFeature as any);
  const hasKinks = kinks.features.length > 0;
  if (hasKinks) {
    notes.push(`Parcel geometry has ${kinks.features.length} self-intersections (kinks)`);
    return {
      outcome: 'UNRESOLVED',
      isWithin: false,
      isDisjoint: false,
      intersects: false,
      touches: false,
      hasKinks: true,
      enclaveOverlap: false,
      notes,
    };
  }

  const boundaryFeature = boundaryToTurfFeature(boundary);

  // 1. Check boundary touching
  let touches = false;
  try {
    touches = turf.booleanTouches(parcelFeature, boundaryFeature);
    if (!touches) {
      const allBoundaryRings = [
        ...boundary.exteriorRings.map((r) => r.coordinates),
        ...boundary.holeRings.map((h) => h.coordinates),
      ];
      for (const bCoords of allBoundaryRings) {
        const line = turf.lineString(bCoords);
        for (const ring of parcelRings) {
          for (const pt of ring) {
            if (turf.booleanPointOnLine(turf.point(pt), line)) {
              touches = true;
              break;
            }
          }
          if (touches) break;
        }
        if (touches) break;
      }
    }
  } catch {}

  // 2. Check if completely within municipal boundary (and outside all enclave holes)
  let isWithin = false;
  try {
    isWithin = turf.booleanWithin(parcelFeature, boundaryFeature);
  } catch {}

  // 3. Check if completely disjoint
  let isDisjoint = false;
  try {
    isDisjoint = turf.booleanDisjoint(parcelFeature, boundaryFeature);
  } catch {}

  // 4. Check if intersects
  let intersects = false;
  try {
    intersects = turf.booleanIntersects(parcelFeature, boundaryFeature);
  } catch {}

  // 5. Check enclave hole intersections explicitly
  let enclaveOverlap = false;
  for (const hole of boundary.holeRings) {
    try {
      const holePoly = turf.polygon([hole.coordinates]);
      if (turf.booleanIntersects(parcelFeature, holePoly)) {
        enclaveOverlap = true;
        notes.push('Parcel intersects or encloses an interior municipal enclave hole');
        break;
      }
    } catch {}
  }

  // Conservative policy: if parcel touches boundary, treat as CROSSES_BOUNDARY
  if (touches && options.conservativeBoundaryTouching) {
    notes.push('Parcel touches municipal boundary line - quarantined under conservative policy');
    return {
      outcome: 'CROSSES_BOUNDARY',
      isWithin,
      isDisjoint,
      intersects,
      touches,
      hasKinks,
      enclaveOverlap,
      notes,
    };
  }

  if (enclaveOverlap) {
    return {
      outcome: 'CROSSES_BOUNDARY',
      isWithin: false,
      isDisjoint: false,
      intersects: true,
      touches,
      hasKinks,
      enclaveOverlap: true,
      notes,
    };
  }

  if (isWithin && !touches) {
    notes.push('Strictly within municipal boundary via Turf.js');
    return {
      outcome: 'INSIDE_OMAHA',
      isWithin: true,
      isDisjoint: false,
      intersects: true,
      touches: false,
      hasKinks: false,
      enclaveOverlap: false,
      notes,
    };
  }

  if (isDisjoint) {
    notes.push('Strictly disjoint from municipal boundary via Turf.js');
    return {
      outcome: 'OUTSIDE_OMAHA',
      isWithin: false,
      isDisjoint: true,
      intersects: false,
      touches: false,
      hasKinks: false,
      enclaveOverlap: false,
      notes,
    };
  }

  if (intersects) {
    notes.push('Partially intersects municipal corporate limits via Turf.js');
    return {
      outcome: 'CROSSES_BOUNDARY',
      isWithin: false,
      isDisjoint: false,
      intersects: true,
      touches,
      hasKinks: false,
      enclaveOverlap,
      notes,
    };
  }

  return {
    outcome: 'UNRESOLVED',
    isWithin,
    isDisjoint,
    intersects,
    touches,
    hasKinks,
    enclaveOverlap,
    notes: ['Inconclusive spatial topology via Turf.js'],
  };
}
