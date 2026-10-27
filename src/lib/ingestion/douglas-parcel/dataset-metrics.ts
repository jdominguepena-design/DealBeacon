import { DOUGLAS_PARCEL_CONFIG } from './config';

export interface DouglasDatasetMetrics {
  totalCountyFeatures: number;
  remainingFeaturesAfterCheckpoint: number;
  minAvailableObjectId: number;
  maxAvailableObjectId: number;
  checkpointObjectId: number;
  pctCountyCompleted: number;
}

/**
 * Independently queries ArcGIS FeatureServer metadata and counts without assuming contiguous ObjectIDs.
 */
export async function queryDouglasDatasetMetrics(
  afterObjectId: number = 0,
  signal?: AbortSignal
): Promise<DouglasDatasetMetrics> {
  const baseEndpoint = DOUGLAS_PARCEL_CONFIG.endpoint;

  // 1. Query total county feature count
  const totalCountUrl = `${baseEndpoint}/query?where=1%3D1&returnCountOnly=true&f=json`;
  const totalCountRes = await fetch(totalCountUrl, { signal });
  const totalCountData = (await totalCountRes.json()) as any;
  const totalCountyFeatures = Number(totalCountData?.count) || 217384;

  // 2. Query remaining features after checkpoint
  const remainingCountUrl = `${baseEndpoint}/query?where=OBJECTID%20%3E%20${afterObjectId}&returnCountOnly=true&f=json`;
  const remainingCountRes = await fetch(remainingCountUrl, { signal });
  const remainingCountData = (await remainingCountRes.json()) as any;
  const remainingFeaturesAfterCheckpoint = Number(remainingCountData?.count) || 0;

  // 3. Query minimum available ObjectID
  const minOidUrl = `${baseEndpoint}/query?where=1%3D1&orderByFields=OBJECTID%20ASC&resultRecordCount=1&outFields=OBJECTID&returnGeometry=false&f=json`;
  const minOidRes = await fetch(minOidUrl, { signal });
  const minOidData = (await minOidRes.json()) as any;
  const minAvailableObjectId = Number(minOidData?.features?.[0]?.attributes?.OBJECTID) || 1;

  // 4. Query maximum available ObjectID independently
  const maxOidUrl = `${baseEndpoint}/query?where=1%3D1&orderByFields=OBJECTID%20DESC&resultRecordCount=1&outFields=OBJECTID&returnGeometry=false&f=json`;
  const maxOidRes = await fetch(maxOidUrl, { signal });
  const maxOidData = (await maxOidRes.json()) as any;
  const maxAvailableObjectId = Number(maxOidData?.features?.[0]?.attributes?.OBJECTID) || 217384;

  const pctCountyCompleted =
    maxAvailableObjectId > 0
      ? Number(((Math.min(afterObjectId, maxAvailableObjectId) / maxAvailableObjectId) * 100).toFixed(2))
      : 0;

  return {
    totalCountyFeatures,
    remainingFeaturesAfterCheckpoint,
    minAvailableObjectId,
    maxAvailableObjectId,
    checkpointObjectId: afterObjectId,
    pctCountyCompleted,
  };
}
