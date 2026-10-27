import { DOUGLAS_TAX_LIEN_CONFIG } from './config';
import { DouglasTaxLienEnvelope, DouglasTaxLienFeature } from './types';

export interface FetchTaxLiensParams {
  afterObjectId?: number;
  maxObjectId?: number;
  resultRecordCount?: number;
}

export interface ArcGISFeatureQueryResponse {
  features: DouglasTaxLienFeature[];
  exceededTransferLimit?: boolean;
  objectIdFieldName?: string;
  error?: {
    code: number;
    message: string;
    details?: string[];
  };
}

/**
 * Queries the min/max objectid and total count from ArcGIS DC Tax Liens
 * to establish an immutable boundary for pagination and reconciliation.
 */
export async function fetchTaxLienEnvelope(): Promise<DouglasTaxLienEnvelope> {
  const queryParams = new URLSearchParams({
    where: DOUGLAS_TAX_LIEN_CONFIG.baseWhereClause,
    outStatistics: JSON.stringify([
      { statisticType: 'min', onStatisticField: 'objectid', outStatisticFieldName: 'min_oid' },
      { statisticType: 'max', onStatisticField: 'objectid', outStatisticFieldName: 'max_oid' },
      { statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'total' },
    ]),
    f: 'json',
  });

  const url = `${DOUGLAS_TAX_LIEN_CONFIG.endpoint}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ArcGIS tax lien envelope: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(`ArcGIS error fetching envelope: ${data.error.message}`);
  }

  const stats = data.features?.[0]?.attributes;
  if (!stats) {
    throw new Error('No statistics returned from ArcGIS tax lien envelope query');
  }

  return {
    minObjectId: Number(stats.min_oid) || 0,
    maxObjectId: Number(stats.max_oid) || 0,
    totalCount: Number(stats.total) || 0,
  };
}

/**
 * Robust HTTP client for the Douglas County GIS DC Tax Liens FeatureServer.
 * Handles timeouts, retries with exponential backoff, and pagination.
 */
export async function fetchTaxLienPage(
  params: FetchTaxLiensParams = {}
): Promise<{ features: DouglasTaxLienFeature[]; exceededTransferLimit: boolean }> {
  const {
    afterObjectId = 0,
    maxObjectId,
    resultRecordCount = DOUGLAS_TAX_LIEN_CONFIG.defaultPageSize,
  } = params;

  let where = DOUGLAS_TAX_LIEN_CONFIG.baseWhereClause;
  if (afterObjectId > 0) {
    where += ` AND objectid > ${afterObjectId}`;
  }
  if (typeof maxObjectId === 'number' && maxObjectId > 0) {
    where += ` AND objectid <= ${maxObjectId}`;
  }

  const queryParams = new URLSearchParams({
    where,
    outFields: DOUGLAS_TAX_LIEN_CONFIG.outFields.join(','),
    orderByFields: 'objectid ASC',
    resultRecordCount: String(resultRecordCount),
    outSR: DOUGLAS_TAX_LIEN_CONFIG.outSR,
    returnGeometry: 'true',
    f: 'json',
  });

  const url = `${DOUGLAS_TAX_LIEN_CONFIG.endpoint}?${queryParams.toString()}`;

  let attempts = 0;
  while (attempts < DOUGLAS_TAX_LIEN_CONFIG.maxRetries) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        DOUGLAS_TAX_LIEN_CONFIG.requestTimeoutMs
      );

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DealBeacon-Douglas-Tax-Lien-Adapter/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ArcGIS server returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as ArcGISFeatureQueryResponse;

      if (data.error) {
        throw new Error(
          `ArcGIS error code ${data.error.code}: ${data.error.message} - ${data.error.details?.join(', ') ?? ''}`
        );
      }

      return {
        features: data.features ?? [],
        exceededTransferLimit: Boolean(data.exceededTransferLimit),
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const errorMsg = isAbort ? 'Request timed out' : err.message;

      if (attempts >= DOUGLAS_TAX_LIEN_CONFIG.maxRetries) {
        throw new Error(
          `Failed after ${DOUGLAS_TAX_LIEN_CONFIG.maxRetries} attempts fetching tax liens (afterObjectId: ${afterObjectId}): ${errorMsg}`
        );
      }

      // Exponential backoff with jitter
      const backoffMs = Math.min(1000 * Math.pow(2, attempts) + Math.random() * 500, 10000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error(`Exhausted retries fetching tax liens`);
}

/**
 * Paginates through all features between minObjectId and maxObjectId,
 * reconciling the total retrieved record count against the envelope.
 */
export async function fetchAllTaxLiens(options?: {
  pageSize?: number;
  envelope?: DouglasTaxLienEnvelope;
}): Promise<{
  envelope: DouglasTaxLienEnvelope;
  features: DouglasTaxLienFeature[];
}> {
  const envelope = options?.envelope ?? (await fetchTaxLienEnvelope());
  const pageSize = options?.pageSize ?? DOUGLAS_TAX_LIEN_CONFIG.defaultPageSize;

  const allFeatures: DouglasTaxLienFeature[] = [];
  let currentAfterOid = 0;

  while (true) {
    const page = await fetchTaxLienPage({
      afterObjectId: currentAfterOid,
      maxObjectId: envelope.maxObjectId,
      resultRecordCount: pageSize,
    });

    if (page.features.length === 0) {
      break;
    }

    allFeatures.push(...page.features);

    const highestOid = Math.max(...page.features.map((f) => f.attributes.objectid));
    currentAfterOid = highestOid;

    // If we've reached or exceeded maxObjectId, stop
    if (currentAfterOid >= envelope.maxObjectId) {
      break;
    }

    // Safety guard against infinite loops
    if (page.features.length < pageSize && !page.exceededTransferLimit) {
      break;
    }
  }

  // Reconcile count against envelope
  if (allFeatures.length !== envelope.totalCount) {
    console.warn(
      `[DouglasTaxLienClient] Reconciled count difference: retrieved ${allFeatures.length} features, envelope reported ${envelope.totalCount}`
    );
  }

  return {
    envelope,
    features: allFeatures,
  };
}
