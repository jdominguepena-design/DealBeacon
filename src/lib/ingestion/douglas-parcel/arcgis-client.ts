import { DOUGLAS_PARCEL_CONFIG } from './config';
import { DouglasParcelEnvelope, DouglasParcelFeature } from './types';

export interface FetchParcelParams {
  afterObjectId?: number;
  maxObjectId?: number;
  resultRecordCount?: number;
  cityFilter?: string; // Optional filter (e.g. PROP_CITY = 'OMAHA')
}

/**
 * Queries min/max OBJECTID and total count from Douglas County FeatureServer.
 */
export async function fetchParcelEnvelope(cityFilter?: string): Promise<DouglasParcelEnvelope> {
  let where = '1=1';
  if (cityFilter) {
    where += ` AND PROP_CITY = '${cityFilter.replace(/'/g, "''")}'`;
  }

  const queryParams = new URLSearchParams({
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'min', onStatisticField: 'OBJECTID', outStatisticFieldName: 'min_oid' },
      { statisticType: 'max', onStatisticField: 'OBJECTID', outStatisticFieldName: 'max_oid' },
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'total' },
    ]),
    f: 'json',
  });

  const url = `${DOUGLAS_PARCEL_CONFIG.endpoint}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Douglas parcel envelope: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error fetching parcel envelope: ${data.error.message}`);
  }

  const stats = data.features?.[0]?.attributes;
  if (!stats) {
    throw new Error('No statistics returned from Douglas parcel envelope query');
  }

  return {
    minObjectId: Number(stats.min_oid) || 0,
    maxObjectId: Number(stats.max_oid) || 0,
    totalCount: Number(stats.total) || 0,
  };
}

/**
 * Robust HTTP client for Douglas County Parcels FeatureServer Layer 0.
 * Requests polygon geometries reprojected to WGS84 (outSR=4326).
 */
export async function fetchParcelFeatures(
  params: FetchParcelParams = {}
): Promise<{ features: DouglasParcelFeature[]; exceededTransferLimit: boolean }> {
  const {
    afterObjectId = 0,
    maxObjectId,
    resultRecordCount = DOUGLAS_PARCEL_CONFIG.defaultPageSize,
    cityFilter,
  } = params;

  let where = '1=1';
  if (afterObjectId > 0) {
    where += ` AND OBJECTID > ${afterObjectId}`;
  }
  if (typeof maxObjectId === 'number' && maxObjectId > 0) {
    where += ` AND OBJECTID <= ${maxObjectId}`;
  }
  if (cityFilter) {
    where += ` AND PROP_CITY = '${cityFilter.replace(/'/g, "''")}'`;
  }

  const queryParams = new URLSearchParams({
    where,
    outFields: DOUGLAS_PARCEL_CONFIG.outFields.join(','),
    orderByFields: 'OBJECTID ASC',
    resultRecordCount: String(resultRecordCount),
    outSR: DOUGLAS_PARCEL_CONFIG.outSpatialReference,
    returnGeometry: 'true',
    f: 'json',
  });

  const url = `${DOUGLAS_PARCEL_CONFIG.endpoint}?${queryParams.toString()}`;

  let attempts = 0;
  while (attempts < DOUGLAS_PARCEL_CONFIG.maxRetries) {
    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOUGLAS_PARCEL_CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      if (data.error) {
        throw new Error(`ArcGIS error (${data.error.code}): ${data.error.message}`);
      }

      return {
        features: (data.features as DouglasParcelFeature[]) ?? [],
        exceededTransferLimit: Boolean(data.exceededTransferLimit),
      };
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError';
      const isLastAttempt = attempts >= DOUGLAS_PARCEL_CONFIG.maxRetries;

      if (isLastAttempt) {
        throw new Error(
          `Failed to fetch Douglas parcel features after ${attempts} attempts: ${
            isAbort ? 'Request timed out' : err.message
          }`
        );
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 6000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  return { features: [], exceededTransferLimit: false };
}
