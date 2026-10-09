import { OMAHA_HOTLINE_CONFIG } from './config';
import { ArcGISQueryResponse, ArcGISFeature } from './types';

export interface FetchHotlineParams {
  afterObjectId?: number;
  resultRecordCount?: number;
}

/**
 * Robust HTTP client for the City of Omaha ArcGIS FeatureServer.
 * Handles timeouts, retries with exponential backoff, and JSON error parsing.
 */
export async function fetchHotlineFeatures(
  params: FetchHotlineParams = {}
): Promise<{ features: ArcGISFeature[]; exceededTransferLimit: boolean }> {
  const { afterObjectId = 0, resultRecordCount = OMAHA_HOTLINE_CONFIG.defaultPageSize } = params;

  let where = OMAHA_HOTLINE_CONFIG.baseWhereClause;
  if (afterObjectId > 0) {
    where += ` AND objectid > ${afterObjectId}`;
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
