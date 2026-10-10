import { BoundingBox, GeoPoint, OmahaMunicipalBoundary, PolygonRingWithBounds } from './types';

/**
 * Checks if a point lies within a bounding box.
 */
export function isPointInBoundingBox(pt: GeoPoint, box: BoundingBox): boolean {
  return (
    pt.lon >= box.minLon &&
    pt.lon <= box.maxLon &&
    pt.lat >= box.minLat &&
    pt.lat <= box.maxLat
  );
}

/**
 * Computes bounding box and planar area of a ring.
 * In Cartesian WGS84:
 * - Clockwise has negative signed area (standard ESRI exterior ring)
 * - Counter-clockwise has positive signed area (standard ESRI interior hole)
 */
export function analyzePolygonRing(coordinates: number[][]): PolygonRingWithBounds | null {
  if (!Array.isArray(coordinates) || coordinates.length < 4) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let signedArea = 0;

  const n = coordinates.length;
  for (let i = 0; i < n - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const x0 = p1[0];
    const y0 = p1[1];
    const x1 = p2[0];
    const y1 = p2[1];

    minLon = Math.min(minLon, x0);
    maxLon = Math.max(maxLon, x0);
    minLat = Math.min(minLat, y0);
    maxLat = Math.max(maxLat, y0);

    signedArea += x0 * y1 - x1 * y0;
  }
  signedArea /= 2;

  const isHole = signedArea > 0; // Positive = counter-clockwise in Cartesian

  return {
    coordinates,
    bounds: { minLon, minLat, maxLon, maxLat },
    isHole,
    area: Math.abs(signedArea),
  };
}

/**
 * Standard ray-casting algorithm to test if point is inside a single closed ring.
 * Uses crossing number algorithm.
 */
export function isPointInRing(pt: GeoPoint, ring: number[][]): boolean {
  const { lon: x, lat: y } = pt;
  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Tests if point is strictly inside municipal boundary.
 * Point must fall inside at least one exterior ring AND outside all interior hole rings.
 */
export function isPointInMunicipalBoundary(
  pt: GeoPoint,
  boundary: OmahaMunicipalBoundary
): boolean {
  if (!isPointInBoundingBox(pt, boundary.totalBounds)) {
    return false;
  }

  // Check exterior containment
  let insideExterior = false;
  for (const ext of boundary.exteriorRings) {
    if (isPointInBoundingBox(pt, ext.bounds) && isPointInRing(pt, ext.coordinates)) {
      insideExterior = true;
      break;
    }
  }

  if (!insideExterior) {
    return false;
  }

  // Check holes / enclaves
  for (const hole of boundary.holeRings) {
    if (isPointInBoundingBox(pt, hole.bounds) && isPointInRing(pt, hole.coordinates)) {
      // Point falls inside an interior hole/enclave (e.g. Carter Lake, Ralston, Boys Town)
      return false;
    }
  }

  return true;
}

/**
 * Checks whether point is inside an arbitrary polygon (represented by rings).
 */
export function isPointInPolygonRings(pt: GeoPoint, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;

  let insidePrimary = false;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (isPointInRing(pt, ring)) {
      // If ring is exterior, toggle; if hole, toggle off
      insidePrimary = !insidePrimary;
    }
  }
  return insidePrimary;
}

/**
 * Tests whether two 2D line segments (p1-p2) and (p3-p4) intersect.
 */
export function doSegmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }

  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

/**
 * Checks whether a point lies directly on a 2D line segment within numerical tolerance.
 */
export function isPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance = 1e-7
): boolean {
  const minX = Math.min(x1, x2) - tolerance;
  const maxX = Math.max(x1, x2) + tolerance;
  const minY = Math.min(y1, y2) - tolerance;
  const maxY = Math.max(y1, y2) + tolerance;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;

  const cross = Math.abs((py - y1) * (x2 - x1) - (px - x1) * (y2 - y1));
  const segLen = Math.hypot(x2 - x1, y2 - y1);
  if (segLen === 0) return Math.hypot(px - x1, py - y1) < tolerance;
  return cross / segLen < tolerance;
}

/**
 * Computes an interior representative point suitable for map pins.
 * Guarantees the point lies strictly INSIDE the parcel boundary,
 * avoiding the issue where geometric centroids of C-shaped, L-shaped,
 * or multipart parcels fall in a neighbor's lot or the street.
 */
export function computeInteriorRepresentativePoint(
  rings: number[][][],
  geometricCentroid: GeoPoint | null
): GeoPoint | null {
  if (!rings || rings.length === 0) return null;

  // 1. If geometric centroid is already inside, it is an ideal representative point
  if (geometricCentroid && isPointInPolygonRings(geometricCentroid, rings)) {
    return geometricCentroid;
  }

  // 2. Find the ring with largest area (primary tract)
  let bestRing: number[][] = rings[0];
  let maxArea = -1;
  for (const ring of rings) {
    const analyzed = analyzePolygonRing(ring);
    if (analyzed && analyzed.area > maxArea) {
      maxArea = analyzed.area;
      bestRing = ring;
    }
  }

  // 3. Scanline intersection method: pick middle horizontal line through bestRing bounding box
  const analyzed = analyzePolygonRing(bestRing);
  if (!analyzed) return geometricCentroid;

  const midLat = (analyzed.bounds.minLat + analyzed.bounds.maxLat) / 2;
  const xIntersects: number[] = [];

  const n = bestRing.length;
  for (let i = 0; i < n - 1; i++) {
    const x0 = bestRing[i][0];
    const y0 = bestRing[i][1];
    const x1 = bestRing[i + 1][0];
    const y1 = bestRing[i + 1][1];

    if ((y0 <= midLat && y1 > midLat) || (y1 <= midLat && y0 > midLat)) {
      const x = x0 + ((midLat - y0) * (x1 - x0)) / (y1 - y0);
      xIntersects.push(x);
    }
  }

  xIntersects.sort((a, b) => a - b);

  // Find the longest interior segment
  let bestMidLon: number | null = null;
  let maxSpan = -1;

  for (let i = 0; i < xIntersects.length - 1; i += 2) {
    const span = xIntersects[i + 1] - xIntersects[i];
    if (span > maxSpan) {
      maxSpan = span;
      bestMidLon = (xIntersects[i] + xIntersects[i + 1]) / 2;
    }
  }

  if (bestMidLon !== null) {
    const candidate: GeoPoint = {
      lon: Number(bestMidLon.toFixed(6)),
      lat: Number(midLat.toFixed(6)),
    };
    if (isPointInPolygonRings(candidate, rings)) {
      return candidate;
    }
  }

  // Fallback to geometric centroid or first vertex
  return geometricCentroid;
}
