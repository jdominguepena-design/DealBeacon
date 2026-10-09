/**
 * Type definitions for Omaha Hotline ArcGIS FeatureServer responses.
 */

export interface ArcGISRawAttributes {
  objectid: number;
  globalid: string;
  RequestID: string | null;
  report_category: string | null;
  PROBTYPE: string | null;
  LOCDESC: string | null;
  STATUS: string | null;
  SUBMITDT: number | null; // epoch ms
  ACTDATE: number | null; // epoch ms
  CreationDate: number | null; // epoch ms
  EditDate: number | null; // epoch ms
  PUBLICVIEW: string;
}

export interface ArcGISPointGeometry {
  x: number; // longitude
  y: number; // latitude
}

export interface ArcGISFeature {
  attributes: ArcGISRawAttributes;
  geometry?: ArcGISPointGeometry;
}

export interface ArcGISQueryResponse {
  objectIdFieldName?: string;
  globalIdFieldName?: string;
  features: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  error?: {
    code: number;
    message: string;
    details: string[];
  };
}

export interface NormalizedHotlineRecord {
  sourceName: string;
  sourceGlobalId: string;
  sourceObjectId: number;
  requestId: string | null;
  reportCategory: string | null;
  problemType: string | null;
  locationText: string | null;
  status: string | null;
  recordKind: string;
  reportedAt: Date | null;
  reportedAtSource: 'SUBMITDT' | 'CreationDate' | null;
  completedAt: Date | null;
  sourceCreatedAt: Date | null;
  sourceEditedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  publicView: string;
  sourceUrl: string;
  sanitizedPayload: ArcGISRawAttributes & {
    geometry?: ArcGISPointGeometry;
  };
  snapshotIdentifier: string;
}
