import { createHash } from 'crypto';
import { OMAHA_HOTLINE_CONFIG } from './config';
import { ArcGISFeature, NormalizedHotlineRecord } from './types';

/**
 * Computes a deterministic SHA-256 fingerprint from sanitized record attributes.
 * This guarantees change detection even when EditDate is unbumped or null.
 */
export function computeContentFingerprint(payload: Record<string, any>): string {
  const normalizedKeyValues = [
    `cat:${payload.report_category ?? ''}`,
    `prob:${payload.PROBTYPE ?? ''}`,
    `loc:${payload.LOCDESC ?? ''}`,
    `status:${payload.STATUS ?? ''}`,
    `req:${payload.RequestID ?? ''}`,
    `act:${payload.ACTDATE ?? ''}`,
    `pub:${payload.PUBLICVIEW ?? ''}`,
    `x:${payload.geometry?.x ?? ''}`,
    `y:${payload.geometry?.y ?? ''}`,
  ].join('|');

  return createHash('sha256').update(normalizedKeyValues).digest('hex').substring(0, 16);
}

/**
 * Validates whether latitude and longitude lie within the Omaha metropolitan bounding box.
 */
export function isValidOmahaCoordinate(lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) return false;
  const { minLat, maxLat, minLon, maxLon } = OMAHA_HOTLINE_CONFIG.geoBoundingBox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/**
 * Safely converts an epoch millisecond value into a Date instance or null.
 */
export function parseArcGISTimestamp(timestamp: number | null | undefined): Date | null {
  if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp);
}

/**
 * Normalizes an incoming raw ArcGIS feature into our schema DTO.
 * Excludes sensitive fields, handles date fallbacks, and computes content fingerprint.
 */
export function normalizeHotlineFeature(feature: ArcGISFeature): NormalizedHotlineRecord | null {
  const { attributes, geometry } = feature;
  if (!attributes || typeof attributes.objectid !== 'number' || !attributes.globalid) {
    return null;
  }

  // Filter out any categories explicitly excluded in Phase 1
  if (
    attributes.report_category &&
    OMAHA_HOTLINE_CONFIG.excludedCategories.includes(attributes.report_category as any)
  ) {
    return null;
  }

  // Fallback chain for reportedAt: SUBMITDT -> CreationDate
  const submitDate = parseArcGISTimestamp(attributes.SUBMITDT);
  const creationDate = parseArcGISTimestamp(attributes.CreationDate);
  const editDate = parseArcGISTimestamp(attributes.EditDate);
  const actDate = parseArcGISTimestamp(attributes.ACTDATE);

  let reportedAt: Date | null = null;
  let reportedAtSource: 'SUBMITDT' | 'CreationDate' | null = null;

  if (submitDate) {
    reportedAt = submitDate;
    reportedAtSource = 'SUBMITDT';
  } else if (creationDate) {
    reportedAt = creationDate;
    reportedAtSource = 'CreationDate';
  }

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (geometry && typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    if (isValidOmahaCoordinate(geometry.y, geometry.x)) {
      latitude = geometry.y;
      longitude = geometry.x;
    }
  }

  // Source URL for exact record inspection
  const sourceUrl = `${OMAHA_HOTLINE_CONFIG.endpoint}?where=objectid%3D${attributes.objectid}&outFields=*&f=json`;

  // Build sanitized raw payload containing ONLY authorized fields
  const sanitizedPayload = {
    objectid: attributes.objectid,
    globalid: attributes.globalid,
    RequestID: attributes.RequestID,
    report_category: attributes.report_category,
    PROBTYPE: attributes.PROBTYPE,
    LOCDESC: attributes.LOCDESC,
    STATUS: attributes.STATUS,
    SUBMITDT: attributes.SUBMITDT,
    ACTDATE: attributes.ACTDATE,
    CreationDate: attributes.CreationDate,
    EditDate: attributes.EditDate,
    PUBLICVIEW: attributes.PUBLICVIEW,
    ...(geometry ? { geometry: { x: geometry.x, y: geometry.y } } : {}),
  };

  // Compute content fingerprint
  const contentHash = computeContentFingerprint(sanitizedPayload);

  // Snapshot identifier incorporates globalid and content fingerprint (stable across identical contents,
  // changes if content changes, preserving immutability without unique constraint violations)
  const snapshotIdentifier = `${attributes.globalid}@${contentHash}`;

  return {
    sourceName: OMAHA_HOTLINE_CONFIG.sourceName,
    sourceGlobalId: attributes.globalid,
    sourceObjectId: attributes.objectid,
    requestId: attributes.RequestID || null,
    reportCategory: attributes.report_category || null,
    problemType: attributes.PROBTYPE || null,
    locationText: attributes.LOCDESC || null,
    status: attributes.STATUS || null,
    recordKind: OMAHA_HOTLINE_CONFIG.recordKind,
    reportedAt,
    reportedAtSource,
    completedAt: actDate,
    sourceCreatedAt: creationDate,
    sourceEditedAt: editDate,
    latitude,
    longitude,
    publicView: attributes.PUBLICVIEW || 'Yes',
    sourceUrl,
    sanitizedPayload,
    contentHash,
    snapshotIdentifier,
  };
}
