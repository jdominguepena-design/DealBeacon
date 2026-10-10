import { DOUGLAS_PARCEL_CONFIG } from '../ingestion/douglas-parcel/config';
import {
  analyzePolygonRing,
  computeInteriorRepresentativePoint,
  doSegmentsIntersect,
  isPointInBoundingBox,
  isPointInMunicipalBoundary,
  isPointInPolygonRings,
  isPointOnSegment,
} from './point-in-polygon';
import {
  BoundaryClassificationResult,
  GeoPoint,
  OmahaMunicipalBoundary,
  PolygonRingWithBounds,
} from './types';

// In-memory cache for the MAPA Omaha municipal boundary feature
let cachedBoundary: OmahaMunicipalBoundary | null = null;

/**
 * Fetches and analyzes the authoritative MAPA Omaha Municipal Boundary.
 * Layer: City_Boundaries_NE_IA (Layer 27)
 */
export async function fetchOmahaMunicipalBoundary(): Promise<OmahaMunicipalBoundary> {
  if (cachedBoundary) {
    return cachedBoundary;
  }

  const queryParams = new URLSearchParams({
    where: "City_Name = 'Omaha'",
    outFields: 'OBJECTID,City_Name,STATEFP,PLACEFP,NAMELSAD,sq_mi,County',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });

  const url = `${DOUGLAS_PARCEL_CONFIG.municipalBoundaryEndpoint}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Omaha municipal boundary: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error fetching municipal boundary: ${data.error.message}`);
  }

  const feature = data.features?.[0];
  if (!feature || !feature.geometry?.rings) {
    throw new Error('No geometry rings returned for Omaha municipal boundary');
  }

  const rings: number[][][] = feature.geometry.rings;
  const exteriorRings: PolygonRingWithBounds[] = [];
  const holeRings: PolygonRingWithBounds[] = [];

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const ring of rings) {
    const analyzed = analyzePolygonRing(ring);
    if (!analyzed) continue;

    minLon = Math.min(minLon, analyzed.bounds.minLon);
    maxLon = Math.max(maxLon, analyzed.bounds.maxLon);
    minLat = Math.min(minLat, analyzed.bounds.minLat);
    maxLat = Math.max(maxLat, analyzed.bounds.maxLat);

    if (analyzed.isHole) {
      holeRings.push(analyzed);
    } else {
      exteriorRings.push(analyzed);
    }
  }

  cachedBoundary = {
    exteriorRings,
    holeRings,
    totalBounds: { minLon, minLat, maxLon, maxLat },
    cityName: feature.attributes.City_Name ?? 'Omaha',
    sourceFips: feature.attributes.PLACEFP ?? '37000',
    sqMiles: Number(feature.attributes.sq_mi) || 146.25,
    ringsCount: rings.length,
  };

  return cachedBoundary;
}

/**
 * Resets the in-memory municipal boundary cache (useful for tests).
 */
export function resetMunicipalBoundaryCache(): void {
  cachedBoundary = null;
}

/**
 * Classifies a parcel's geometry against the authoritative Omaha municipal boundary.
 *
 * Explicit Outcomes:
 * - INSIDE_OMAHA: Entire parcel strictly inside incorporated Omaha limits
 * - OUTSIDE_OMAHA: Entire parcel strictly outside incorporated Omaha limits
 * - CROSSES_BOUNDARY: Parcel crosses the municipal corporate boundary line
 * - UNRESOLVED: Parcel geometry is missing, null, or degenerate
 */
export function classifyParcelMunicipalJurisdiction(
  parcelRings: number[][][] | undefined | null,
  boundary: OmahaMunicipalBoundary,
  geometricCentroid: GeoPoint | null
): BoundaryClassificationResult {
  if (!parcelRings || !Array.isArray(parcelRings) || parcelRings.length === 0) {
    return {
      outcome: 'UNRESOLVED',
      totalVertices: 0,
      insideVertices: 0,
      outsideVertices: 0,
      geometricCentroid: null,
      interiorRepresentativePoint: null,
      centroidInsideBoundary: false,
      notes: ['Missing or degenerate parcel geometry'],
    };
  }

  // Validate ring coordinate integrity
  for (const ring of parcelRings) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return {
        outcome: 'UNRESOLVED',
        totalVertices: 0,
        insideVertices: 0,
        outsideVertices: 0,
        geometricCentroid: null,
        interiorRepresentativePoint: null,
        centroidInsideBoundary: false,
        notes: ['Malformed or degenerate ring with fewer than 4 coordinates'],
      };
    }
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
        return {
          outcome: 'UNRESOLVED',
          totalVertices: 0,
          insideVertices: 0,
          outsideVertices: 0,
          geometricCentroid: null,
          interiorRepresentativePoint: null,
          centroidInsideBoundary: false,
          notes: ['Degenerate or non-numeric coordinate values detected'],
        };
      }
    }
  }

  // 1. Calculate Interior Representative Point
  const interiorRepresentativePoint = computeInteriorRepresentativePoint(
    parcelRings,
    geometricCentroid
  );

  // 2. Sample and test parcel vertices
  let insideCount = 0;
  let outsideCount = 0;
  let totalTested = 0;

  let parcelMinLon = Infinity;
  let parcelMaxLon = -Infinity;
  let parcelMinLat = Infinity;
  let parcelMaxLat = -Infinity;

  for (const ring of parcelRings) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    // Test each vertex
    for (let i = 0; i < ring.length - 1; i++) {
      const pt: GeoPoint = { lon: ring[i][0], lat: ring[i][1] };
      parcelMinLon = Math.min(parcelMinLon, pt.lon);
      parcelMaxLon = Math.max(parcelMaxLon, pt.lon);
      parcelMinLat = Math.min(parcelMinLat, pt.lat);
      parcelMaxLat = Math.max(parcelMaxLat, pt.lat);
      totalTested++;
      if (isPointInMunicipalBoundary(pt, boundary)) {
        insideCount++;
      } else {
        outsideCount++;
      }
    }
  }

  const parcelBounds: { minLon: number; maxLon: number; minLat: number; maxLat: number } = {
    minLon: parcelMinLon,
    maxLon: parcelMaxLon,
    minLat: parcelMinLat,
    maxLat: parcelMaxLat,
  };

  const doBoxesOverlap = (b1: typeof parcelBounds, b2: typeof parcelBounds) => {
    return !(
      b1.minLon > b2.maxLon ||
      b1.maxLon < b2.minLon ||
      b1.minLat > b2.maxLat ||
      b1.maxLat < b2.minLat
    );
  };

  if (totalTested === 0) {
    return {
      outcome: 'UNRESOLVED',
      totalVertices: 0,
      insideVertices: 0,
      outsideVertices: 0,
      geometricCentroid,
      interiorRepresentativePoint,
      centroidInsideBoundary: false,
      notes: ['No valid coordinate vertices found in rings'],
    };
  }

  const centroidInsideBoundary = interiorRepresentativePoint
    ? isPointInMunicipalBoundary(interiorRepresentativePoint, boundary)
    : false;

  const notes: string[] = [
    `Tested ${totalTested} vertices: ${insideCount} inside, ${outsideCount} outside`,
    `Interior representative point inside boundary: ${centroidInsideBoundary}`,
  ];

  // 3. Evaluate boundary crossing (vertices on both sides)
  if (insideCount > 0 && outsideCount > 0) {
    notes.push('Parcel vertices span both sides of the incorporated municipal line');
    return {
      outcome: 'CROSSES_BOUNDARY',
      totalVertices: totalTested,
      insideVertices: insideCount,
      outsideVertices: outsideCount,
      geometricCentroid,
      interiorRepresentativePoint,
      centroidInsideBoundary,
      notes,
    };
  }

  // 4. Edge and enclave hole checks for parcels whose vertices appear all inside
  if (insideCount === totalTested) {
    // 4a. Check if parcel completely encloses an interior municipal enclave hole
    for (const hole of boundary.holeRings) {
      if (!doBoxesOverlap(parcelBounds, hole.bounds)) continue;
      const holeSamplePt: GeoPoint = { lon: hole.coordinates[0][0], lat: hole.coordinates[0][1] };
      if (isPointInPolygonRings(holeSamplePt, parcelRings)) {
        notes.push('Parcel polygon completely encloses an interior municipal enclave hole');
        return {
          outcome: 'CROSSES_BOUNDARY',
          totalVertices: totalTested,
          insideVertices: insideCount,
          outsideVertices: outsideCount,
          geometricCentroid,
          interiorRepresentativePoint,
          centroidInsideBoundary,
          notes,
        };
      }
    }

    // 4b. Check if parcel edges intersect an interior enclave hole boundary
    let crossesHole = false;
    for (const hole of boundary.holeRings) {
      if (!doBoxesOverlap(parcelBounds, hole.bounds)) {
        continue;
      }
      if (!crossesHole) {
        for (const ring of parcelRings) {
          for (let i = 0; i < ring.length - 1; i++) {
            const hCoords = hole.coordinates;
            for (let j = 0; j < hCoords.length - 1; j++) {
              if (
                doSegmentsIntersect(
                  ring[i][0],
                  ring[i][1],
                  ring[i + 1][0],
                  ring[i + 1][1],
                  hCoords[j][0],
                  hCoords[j][1],
                  hCoords[j + 1][0],
                  hCoords[j + 1][1]
                )
              ) {
                crossesHole = true;
                break;
              }
            }
            if (crossesHole) break;
          }
          if (crossesHole) break;
        }
      }
    }

    if (crossesHole) {
      notes.push('Parcel edges intersect an interior enclave/hole boundary');
      return {
        outcome: 'CROSSES_BOUNDARY',
        totalVertices: totalTested,
        insideVertices: insideCount,
        outsideVertices: outsideCount,
        geometricCentroid,
        interiorRepresentativePoint,
        centroidInsideBoundary,
        notes,
      };
    }

    // 4c. Conservative policy: check if parcel touches municipal boundary or enclave line
    let touchesBoundary = false;
    for (const ext of boundary.exteriorRings) {
      if (!doBoxesOverlap(parcelBounds, ext.bounds)) continue;
      for (const ring of parcelRings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const pt = ring[i];
          const eCoords = ext.coordinates;
          for (let j = 0; j < eCoords.length - 1; j++) {
            if (isPointOnSegment(pt[0], pt[1], eCoords[j][0], eCoords[j][1], eCoords[j + 1][0], eCoords[j + 1][1], 1e-7)) {
              touchesBoundary = true;
              break;
            }
          }
          if (touchesBoundary) break;
        }
        if (touchesBoundary) break;
      }
      if (touchesBoundary) break;
    }

    if (!touchesBoundary) {
      for (const hole of boundary.holeRings) {
        if (!doBoxesOverlap(parcelBounds, hole.bounds)) continue;
        for (const ring of parcelRings) {
          for (let i = 0; i < ring.length - 1; i++) {
            const pt = ring[i];
            const hCoords = hole.coordinates;
            for (let j = 0; j < hCoords.length - 1; j++) {
              if (isPointOnSegment(pt[0], pt[1], hCoords[j][0], hCoords[j][1], hCoords[j + 1][0], hCoords[j + 1][1], 1e-7)) {
                touchesBoundary = true;
                break;
              }
            }
            if (touchesBoundary) break;
          }
          if (touchesBoundary) break;
        }
        if (touchesBoundary) break;
      }
    }

    if (touchesBoundary) {
      notes.push('Parcel touches municipal boundary line - quarantined under conservative boundary policy');
      return {
        outcome: 'CROSSES_BOUNDARY',
        totalVertices: totalTested,
        insideVertices: insideCount,
        outsideVertices: outsideCount,
        geometricCentroid,
        interiorRepresentativePoint,
        centroidInsideBoundary,
        notes,
      };
    }

    notes.push('All parcel vertices strictly contained within incorporated Omaha limits');
    return {
      outcome: 'INSIDE_OMAHA',
      totalVertices: totalTested,
      insideVertices: insideCount,
      outsideVertices: 0,
      geometricCentroid,
      interiorRepresentativePoint,
      centroidInsideBoundary: true,
      notes,
    };
  }

  // 5. If all vertices outside, check if parcel edges intersect municipal boundary
  if (outsideCount === totalTested) {
    let crossesExterior = false;
    for (const ext of boundary.exteriorRings) {
      if (!doBoxesOverlap(parcelBounds, ext.bounds)) {
        continue;
      }
      for (const ring of parcelRings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const eCoords = ext.coordinates;
          for (let j = 0; j < eCoords.length - 1; j++) {
            if (
              doSegmentsIntersect(
                ring[i][0],
                ring[i][1],
                ring[i + 1][0],
                ring[i + 1][1],
                eCoords[j][0],
                eCoords[j][1],
                eCoords[j + 1][0],
                eCoords[j + 1][1]
              )
            ) {
              crossesExterior = true;
              break;
            }
          }
          if (crossesExterior) break;
        }
        if (crossesExterior) break;
      }
    }

    if (crossesExterior) {
      notes.push('Parcel edges intersect exterior municipal corporate line');
      return {
        outcome: 'CROSSES_BOUNDARY',
        totalVertices: totalTested,
        insideVertices: insideCount,
        outsideVertices: outsideCount,
        geometricCentroid,
        interiorRepresentativePoint,
        centroidInsideBoundary,
        notes,
      };
    }

    // Check if parcel touches municipal boundary line
    let touchesBoundary = false;
    for (const ext of boundary.exteriorRings) {
      if (!doBoxesOverlap(parcelBounds, ext.bounds)) continue;
      for (const ring of parcelRings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const pt = ring[i];
          const eCoords = ext.coordinates;
          for (let j = 0; j < eCoords.length - 1; j++) {
            if (isPointOnSegment(pt[0], pt[1], eCoords[j][0], eCoords[j][1], eCoords[j + 1][0], eCoords[j + 1][1], 1e-7)) {
              touchesBoundary = true;
              break;
            }
          }
          if (touchesBoundary) break;
        }
        if (touchesBoundary) break;
      }
      if (touchesBoundary) break;
    }

    if (!touchesBoundary) {
      for (const hole of boundary.holeRings) {
        if (!doBoxesOverlap(parcelBounds, hole.bounds)) continue;
        for (const ring of parcelRings) {
          for (let i = 0; i < ring.length - 1; i++) {
            const pt = ring[i];
            const hCoords = hole.coordinates;
            for (let j = 0; j < hCoords.length - 1; j++) {
              if (isPointOnSegment(pt[0], pt[1], hCoords[j][0], hCoords[j][1], hCoords[j + 1][0], hCoords[j + 1][1], 1e-7)) {
                touchesBoundary = true;
                break;
              }
            }
            if (touchesBoundary) break;
          }
          if (touchesBoundary) break;
        }
        if (touchesBoundary) break;
      }
    }

    if (touchesBoundary) {
      notes.push('Parcel touches municipal boundary line - quarantined under conservative boundary policy');
      return {
        outcome: 'CROSSES_BOUNDARY',
        totalVertices: totalTested,
        insideVertices: insideCount,
        outsideVertices: outsideCount,
        geometricCentroid,
        interiorRepresentativePoint,
        centroidInsideBoundary,
        notes,
      };
    }

    notes.push('All parcel vertices strictly outside incorporated municipal limits');
    return {
      outcome: 'OUTSIDE_OMAHA',
      totalVertices: totalTested,
      insideVertices: 0,
      outsideVertices: outsideCount,
      geometricCentroid,
      interiorRepresentativePoint,
      centroidInsideBoundary: false,
      notes,
    };
  }

  return {
    outcome: 'UNRESOLVED',
    totalVertices: totalTested,
    insideVertices: insideCount,
    outsideVertices: outsideCount,
    geometricCentroid,
    interiorRepresentativePoint,
    centroidInsideBoundary,
    notes: ['Inconclusive spatial relationship'],
  };
}
