/**
 * Configuration for Douglas County GIS (DCGIS) Tax Liens FeatureServer ingestion.
 *
 * Source: Douglas County GIS Department / County Treasurer
 * Service: DC Tax Liens
 * Endpoint: Hosted FeatureServer Layer 0
 */

export const DOUGLAS_TAX_LIEN_CONFIG = {
  sourceName: 'DOUGLAS_COUNTY_TAX_LIEN',
  recordKind: 'COUNTY_STRUCK_OFF_TAX_SALE_CERTIFICATE',

  // Read-only public feature server endpoint
  endpoint:
    'https://dcgis.org/server/rest/services/Hosted/DC_Tax_Liens_view/FeatureServer/0/query',

  // Explicit field list requested from the ArcGIS REST service
  outFields: [
    'objectid',
    'pin',
    'year',
    'amt',
    'address',
    'class',
    'addition',
    'created_user',
    'created_date',
    'last_edited_user',
    'last_edited_date',
    'SHAPE__Area',
    'SHAPE__Length',
  ] as const,

  // Base where clause for live query
  baseWhereClause: '1=1',

  // Paging and reliability parameters
  defaultPageSize: 200,
  maxPageSize: 1000,
  requestTimeoutMs: 20000,
  maxRetries: 3,

  // Coordinate spatial reference output (WGS84)
  outSR: '4326',
} as const;

export type DouglasTaxLienOutField = (typeof DOUGLAS_TAX_LIEN_CONFIG.outFields)[number];
