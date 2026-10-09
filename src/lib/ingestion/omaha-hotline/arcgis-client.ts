import { OMAHA_HOTLINE_CONFIG } from './config';
import { ArcGISQueryResponse, ArcGISFeature } from './types';

export interface FetchHotlineParams {
  afterObjectId?: number;
  maxObjectId?: number;
  resultRecordCount?: number;
}

/**
 * Queries the current min/max objectid and total count from ArcGIS to establish
 * an immutable upper boundary for the entire run.
 */
export async function fetchHotlineEnvelope(): Promise<{
  minObjectId: number;
  maxObjectId: number;
  totalCount: number;
}> {
  const queryParams = new URLSearchParams({
    where: OMAHA_HOTLINE_CONFIG.baseWhereClause,
    outStatistics: JSON.stringify([
      { statisticType: 'min', onStatisticField: 'objectid', outStatisticFieldName: 'min_oid' },
      { statisticType: 'max', onStatisticField: 'objectid', outStatisticFieldName: 'max_oid' },
      { statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'total' },
    ]),
    f: 'json',
  });

  const url = `${OMAHA_HOTLINE_CONFIG.endpoint}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ArcGIS envelope: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error fetching envelope: ${data.error.message}`);
  }

  const stats = data.features?.[0]?.attributes;
  if (!stats) {
    throw new Error('No statistics returned from ArcGIS envelope query');
  }

  return {
    minObjectId: Number(stats.min_oid) || 0,
    maxObjectId: Number(stats.max_oid) || 0,
    totalCount: Number(stats.total) || 0,
  };
}

/**
 * Robust HTTP client for the City of Omaha ArcGIS FeatureServer.
 * Handles timeouts, retries with exponential backoff, and JSON error parsing.
 */
export async function fetchHotlineFeatures(
  params: FetchHotlineParams = {}
): Promise<{ features: ArcGISFeature[]; exceededTransferLimit: boolean }> {
  const {
    afterObjectId = 0,
    maxObjectId,
    resultRecordCount = OMAHA_HOTLINE_CONFIG.defaultPageSize,
  } = params;

  let where = OMAHA_HOTLINE_CONFIG.baseWhereClause;
  if (afterObjectId > 0) {
    where += ` AND objectid > ${afterObjectId}`;
  }
  if (typeof maxObjectId === 'number' && maxObjectId > 0) {
    where += ` AND objectid <= ${maxObjectId}`;
  }

  const queryParams = new URLSearchParams({
    where,
    outFields: OMAHA_HOTLINE_CONFIG.outFields.join(','),
    orderByFields: 'objectid ASC',
    resultRecordCount: String(resultRecordCount),
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });

  const url = `${OMAHA_HOTLINE_CONFIG.endpoint}?${queryParams.toString()}`;

  let attempts = 0;
  while (attempts < OMAHA_HOTLINE_CONFIG.maxRetries) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OMAHA_HOTLINE_CONFIG.requestTimeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DealBeacon-Omaha-Hotline-Importer/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as ArcGISQueryResponse;

      if (data.error) {
        throw new Error(
          `ArcGIS server error code ${data.error.code}: ${data.error.message} (${data.error.details?.join(' ') || ''})`
        );
      }

      return {
        features: data.features || [],
        exceededTransferLimit: Boolean(data.exceededTransferLimit),
      };
    } catch (err) {
      const isLastAttempt = attempts >= OMAHA_HOTLINE_CONFIG.maxRetries;
      if (isLastAttempt) {
        throw new Error(`Failed to fetch Omaha Hotline records after ${attempts} attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delayMs = Math.pow(2, attempts - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Unreachable code in fetchHotlineFeatures');
}
