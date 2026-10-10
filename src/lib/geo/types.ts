/**
 * Type definitions for geospatial polygon intersection, containment,
 * and municipal boundary classification.
 */

export type BoundaryClassificationOutcome =
  | 'INSIDE_OMAHA'
  | 'OUTSIDE_OMAHA'
  | 'CROSSES_BOUNDARY'
  | 'UNRESOLVED';

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface PolygonRingWithBounds {
  coordinates: number[][]; // [ [lon, lat], ... ]
  bounds: BoundingBox;
  isHole: boolean; // true = interior hole / enclave; false = exterior boundary
  area: number; // unsigned planar area
}

export interface OmahaMunicipalBoundary {
  exteriorRings: PolygonRingWithBounds[];
  holeRings: PolygonRingWithBounds[];
  totalBounds: BoundingBox;
  cityName: string;
  sourceFips: string;
  sqMiles: number;
  ringsCount: number;
}

export interface BoundaryClassificationResult {
  outcome: BoundaryClassificationOutcome;
  totalVertices: number;
  insideVertices: number;
  outsideVertices: number;
  geometricCentroid: GeoPoint | null;
  interiorRepresentativePoint: GeoPoint | null;
  centroidInsideBoundary: boolean;
  notes: string[];
}
