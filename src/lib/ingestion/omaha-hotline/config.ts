/**
 * Configuration for City of Omaha Hotline ArcGIS FeatureServer ingestion.
 *
 * Source: City of Omaha Public Works / Mayor's Hotline
 * Read-only view layer 0 endpoint
 */

export const OMAHA_HOTLINE_CONFIG = {
  sourceName: 'OMAHA_HOTLINE',
  recordKind: 'UNVERIFIED_COMPLAINT',

  // Read-only public feature server endpoint
  endpoint:
    'https://services1.arcgis.com/tIBLyYZX96jUntYm/arcgis/rest/services/Omahahotline_2.0_PROD_read_only_view/FeatureServer/0/query',

  // Conservative field allowlist strictly requested from the server.
  // Prohibited/excluded fields (NOT fetched from server):
  // - DETAILS (free text commentary)
  // - Creator, Editor (staff/reporter identifiers)
  // - email_status, search_key, GEOGRAPHIC_ASSIGNMENT
  outFields: [
    'objectid',
    'globalid',
    'RequestID',
    'report_category',
    'PROBTYPE',
    'LOCDESC',
    'STATUS',
    'SUBMITDT',
    'ACTDATE',
    'CreationDate',
    'EditDate',
    'PUBLICVIEW',
  ] as const,

  // Only public view approved records
  baseWhereClause: "PUBLICVIEW = 'Yes'",

  // Categories excluded in Phase 1 per safety and sensitivity requirements
  excludedCategories: ['Homeless Encampment'],

  // Default query page size and timeout
  defaultPageSize: 250,
  maxPageSize: 1000,
  requestTimeoutMs: 20000,
  maxRetries: 3,

  // Bounding box for Greater Omaha / Douglas County geographic validation (WGS84)
  geoBoundingBox: {
    minLat: 41.10,
    maxLat: 41.45,
    minLon: -96.35,
    maxLon: -95.80,
  },
} as const;

export type OmahaHotlineOutField = (typeof OMAHA_HOTLINE_CONFIG.outFields)[number];
