/**
 * TypeScript type definitions for Douglas County parcel ingestion.
 */

export interface DouglasParcelRawAttributes {
  OBJECTID: number;
  PIN: string;
  PROPERTY_A: string | null;
  HOUSE?: string | null;
  STREET_DIR?: string | null;
  STREET_NAM?: string | null;
  STREET_TYP?: string | null;
  APARTMENT?: string | null;
  PROP_CITY: string | null;
  PROP_ZIP: string | null;
  OWNER_NAME: string | null;
  ADDRESS1: string | null;
  ADDRESS2?: string | null;
  OWNER_CITY: string | null;
  OWNER_STAT: string | null;
  OWNER_ZIP: string | null;
  CLASS: string | null;
  DCAACCTYPE?: string | null;
  NUMBLDGS?: number | null;
  BLDG_SF?: number | null;
  BLDG_STORY?: number | null;
  BLDG_YRBLT?: number | null;
  BLDG_DESC?: string | null;
  QUALITY?: string | null;
  CONDITION?: string | null;
  ACRES?: number | null;
  SQ_FEET?: number | null;
  ASSESSOR?: string | null;
  TREASURER?: string | null;
  X_COORD?: number | null;
  Y_COORD?: number | null;
  ADDITION_N?: string | null;
  BLOCK?: string | null;
  LOT?: string | null;
  LEGAL1?: string | null;
}

export interface DouglasParcelPolygonGeometry {
  rings?: number[][][]; // [ [ [lon, lat], ... ] ]
}

export interface DouglasParcelFeature {
  attributes: DouglasParcelRawAttributes;
  geometry?: DouglasParcelPolygonGeometry;
}

export interface DouglasParcelEnvelope {
  minObjectId: number;
  maxObjectId: number;
  totalCount: number;
}

export type AbsenteeStatus = 'ABSENTEE' | 'OWNER_OCCUPIED' | 'UNKNOWN';
export type OutOfStateStatus = 'OUT_OF_STATE' | 'IN_STATE' | 'UNKNOWN';
export type CorporateStatus = 'PROBABLE_CORPORATE_NAME' | 'INDIVIDUAL' | 'UNKNOWN';

export interface NormalizedParcelRecord {
  parcelId: string; // PIN
  sourceObjectId: number;
  address: string;
  hasAuthoritativeAddress: boolean; // false when source PROPERTY_A was missing or blank
  city: string; // From PROP_CITY source attribute (not verified legal jurisdiction)
  rawPropCity: string | null;
  state: string;
  zip: string;
  propertyType: string; // Mapped conservatively (e.g. RESIDENTIAL, COMMERCIAL, etc.)
  countyClass: string | null; // Raw CLASS ('R', 'C', etc.)
  buildingDesc: string | null;
  yearBuilt: number | null;
  squareFeet: number | null;
  lotSizeSqFt: number | null;
  condition: string | null;
  quality: string | null;
  dcaAccountType: string | null;
  legalDescription: string | null;
  assessorUrl: string | null;
  treasurerUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  geometryGeoJson: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;

  // Ownership evaluation
  ownerName: string;
  mailingAddress: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  absenteeStatus: AbsenteeStatus;
  isAbsentee: boolean;
  outOfStateStatus: OutOfStateStatus;
  isOutOfState: boolean;
  corporateStatus: CorporateStatus;
  isCorporate: boolean;
  ownershipEvaluationNotes: string[];

  // Spatial Boundary Classification & Provenance
  boundaryClassification?: {
    outcome: 'INSIDE_OMAHA' | 'OUTSIDE_OMAHA' | 'CROSSES_BOUNDARY' | 'UNRESOLVED';
    totalVertices: number;
    insideVertices: number;
    outsideVertices: number;
    centroidInsideBoundary: boolean;
    notes: string[];
  };

  // Snapshot metadata
  contentHash: string;
  sanitizedPayload: DouglasParcelRawAttributes & {
    centroid?: { lat: number; lon: number } | null;
  };
}

export interface ImportParcelsStats {
  runId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  
  // Spatial Classification Metrics
  insideOmaha: number;
  outsideOmahaSkipped: number;
  crossesBoundaryQuarantined: number;
  unresolvedQuarantined: number;
  quarantined: number;
  quarantinedRecords?: Array<{
    parcelId: string;
    address: string;
    outcome: string;
    reason: string;
  }>;
  failedRecords?: Array<{
    parcelId: string;
    sourceObjectId: number;
    error: string;
  }>;

  sourceMinObjectId?: number;
  sourceMaxObjectId?: number;
  totalInSource?: number;
  startAfterObjectId?: number;
  lastProcessedObjectId?: number;
  pageCount?: number;
  durationMs: number;
  errors: string[];
}
