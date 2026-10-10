/**
 * Configuration for Douglas County GIS Parcels Ingestion.
 *
 * Source: Douglas County Geographic Information Systems (DCGIS / DOGIS)
 * & Douglas County Assessor.
 * Layer: Parcels_public (Layer 0)
 */

export const DOUGLAS_PARCEL_CONFIG = {
  sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
  datasetTitle: 'Douglas County Parcels (Public)',

  // Authoritative FeatureServer Layer 0 endpoint
  endpoint:
    'https://dcgis.org/server/rest/services/vector/Parcels_public/FeatureServer/0/query',

  // Authoritative Municipal Boundary FeatureServer (MAPA / City of Omaha)
  municipalBoundaryEndpoint:
    'https://services.arcgis.com/CHjpJeHqytL8t8op/arcgis/rest/services/City_Boundary/FeatureServer/27/query',

  // Strict field allowlist requested from the FeatureServer
  outFields: [
    'OBJECTID',
    'PIN',
    'PROPERTY_A',
    'HOUSE',
    'STREET_DIR',
    'STREET_NAM',
    'STREET_TYP',
    'APARTMENT',
    'PROP_CITY',
    'PROP_ZIP',
    'OWNER_NAME',
    'ADDRESS1',
    'ADDRESS2',
    'OWNER_CITY',
    'OWNER_STAT',
    'OWNER_ZIP',
    'CLASS',
    'DCAACCTYPE',
    'NUMBLDGS',
    'BLDG_SF',
    'BLDG_STORY',
    'BLDG_YRBLT',
    'BLDG_DESC',
    'QUALITY',
    'CONDITION',
    'ACRES',
    'SQ_FEET',
    'ASSESSOR',
    'TREASURER',
    'X_COORD',
    'Y_COORD',
    'ADDITION_N',
    'BLOCK',
    'LOT',
    'LEGAL1',
  ] as const,

  // Default paging and network parameters
  defaultPageSize: 100, // conservative page size when fetching polygon rings
  maxPageSize: 500,
  pilotLimit: 100,
  requestTimeoutMs: 25000,
  maxRetries: 3,

  // Spatial reference: Request server-side reprojection to standard WGS84
  outSpatialReference: '4326',

  // Douglas County geographical boundary (WGS84)
  geoBoundingBox: {
    minLat: 41.10,
    maxLat: 41.45,
    minLon: -96.38,
    maxLon: -95.80,
  },
} as const;

export type DouglasParcelOutField = (typeof DOUGLAS_PARCEL_CONFIG.outFields)[number];
