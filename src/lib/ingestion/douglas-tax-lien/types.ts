/**
 * TypeScript type definitions for Douglas County Tax Liens ingestion.
 */

export interface ArcGISPolygonGeometry {
  rings?: number[][][]; // [ [ [lon, lat], ... ] ]
}

export interface DouglasTaxLienRawAttributes {
  objectid: number;
  pin: string;
  year?: string | null;
  amt?: number | null;
  address?: string | null;
  class?: string | null;
  addition?: string | null;
  created_user?: string | null;
  created_date?: number | null;
  last_edited_user?: string | null;
  last_edited_date?: number | null;
  SHAPE__Area?: number | null;
  SHAPE__Length?: number | null;
}

export interface DouglasTaxLienFeature {
  attributes: DouglasTaxLienRawAttributes;
  geometry?: ArcGISPolygonGeometry;
}

export interface DouglasTaxLienEnvelope {
  minObjectId: number;
  maxObjectId: number;
  totalCount: number;
}

export type TaxLienObservationStatus =
  | 'PRESENT_IN_CURRENT_SNAPSHOT'
  | 'ABSENT_FROM_LATEST_SNAPSHOT'
  | 'OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED';

export type TaxLienMatchStatus =
  | 'MATCHED_TO_CANONICAL_PROPERTY'
  | 'UNMATCHED_COUNTY_PIN'
  | 'QUARANTINED_MALFORMED';

export interface NormalizedTaxLienRecord {
  sourceObjectId: number;
  pin: string; // 10-character string preserving leading zeros
  year: string | null; // e.g. "2022", "2024"
  amountString: string; // Exact string representation e.g. "133.00", "2196.00"
  amountCents: number; // Integer cents representation (13300) for exact arithmetic
  situsAddress: string | null; // Trimmed address or null if empty/blank
  countyClass: string | null; // e.g. "Residential", "Commercial"
  addition: string | null; // Legal subdivision plat name
  sourceCreatedAt: Date | null;
  sourceEditedAt: Date | null;
  rawPayload: DouglasTaxLienRawAttributes & { geometry?: ArcGISPolygonGeometry };
  contentSha256: string; // Exact hex SHA-256 fingerprint of the normalized content
  geometryGeoJson: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
}

export type TaxLienMunicipalJurisdiction =
  | 'INSIDE_OMAHA'
  | 'OUTSIDE_OMAHA'
  | 'CROSSES_BOUNDARY'
  | 'UNRESOLVED';

export interface TaxLienStagingRecord {
  normalized: NormalizedTaxLienRecord;
  observationStatus: TaxLienObservationStatus;
  matchStatus: TaxLienMatchStatus;
  matchedPropertyId: string | null;
  matchedParcelId: string | null;
  municipalJurisdiction: TaxLienMunicipalJurisdiction;
  quarantineReason?: string;
}

export interface DryRunTaxLienIngestionReport {
  timestamp: string;
  sourceEnvelope: DouglasTaxLienEnvelope;
  recordsRetrieved: number;
  uniquePins: number;
  totalLienAmountCents: number;
  totalLienAmountFormatted: string;
  matchedRecordsCount: number;
  unmatchedRecordsCount: number;
  quarantinedRecordsCount: number;
  insideOmahaCount: number;
  outsideOmahaCount: number;
  crossesBoundaryCount: number;
  unresolvedCount: number;
  matchedSample: Array<{
    pin: string;
    propertyId: string;
    address: string;
    year: string | null;
    amount: string;
    propertyType: string;
    jurisdiction: string;
  }>;
  unmatchedSample: Array<{
    pin: string;
    situsAddress: string | null;
    year: string | null;
    amount: string;
    class: string | null;
  }>;
  quarantinedSample: Array<{
    sourceObjectId: number;
    pin: string;
    reason: string;
  }>;
}
