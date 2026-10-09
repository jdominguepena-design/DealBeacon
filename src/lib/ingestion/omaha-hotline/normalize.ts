import { OMAHA_HOTLINE_CONFIG } from './config';
import { ArcGISFeature, NormalizedHotlineRecord } from './types';

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
 * Excludes sensitive fields and handles date fallbacks.
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

  // Stable snapshot identifier: incorporates edit timestamp or creation timestamp
  const versionTime = editDate?.getTime() ?? creationDate?.getTime() ?? 0;
  const snapshotIdentifier = `${attributes.globalid}@${versionTime}`;

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
    snapshotIdentifier,
  };
}
