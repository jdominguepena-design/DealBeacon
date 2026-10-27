import { PrismaClient, Prisma } from '@prisma/client';
import { DOUGLAS_PARCEL_CONFIG } from './config';
import { normalizeDouglasParcel } from './normalize';
import { NormalizedParcelRecord, DouglasParcelFeature } from './types';
import {
  executeParcelBatchUpsert,
  executeQuarantineBatch,
  ExecutionStrategy,
  BatchTimingMetrics,
} from './batch-upsert';
import {
  acquireIngestionAdvisoryLock,
  releaseIngestionAdvisoryLock,
  createDedicatedDirectLockClient,
  getLatestIngestionCheckpoint,
} from '../coordinator';
import {
  fetchOmahaMunicipalBoundary,
  classifyParcelMunicipalJurisdiction,
} from '../../geo/municipal-boundary';

export interface CountywideRunnerOptions {
  batchSize?: number;
  pageSize?: number;
  maxRecordsToProcess?: number;
  dryRun?: boolean;
  startAfterObjectId?: number;
  forceFreshRun?: boolean;
  signal?: AbortSignal;
  mockBoundary?: any;
  customRunId?: string;
  executionStrategy?: ExecutionStrategy;
  onBatchTiming?: (timing: BatchTimingMetrics) => void;
}

export interface RunnerTimingSummary {
  fetchDurationMs: number;
  normalizationDurationMs: number;
  dbPrefetchMs: number;
  dbWritesMs: number;
  dbCheckpointMs: number;
  dbTransactionMs: number;
  totalDurationMs: number;
  averageBatchMs: number;
  batchesRecorded: number;
}

export interface CountywideRunnerStats {
  runId: string;
  mode: 'INCREMENTAL_RESUME' | 'FRESH_IMPORT' | 'DRY_RUN';
  startingObjectId: number;
  highestObjectIdProcessed: number;
  totalFetched: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  failedCount: number;
  insideOmahaCount: number;
  outsideOmahaCount: number;
  crossesBoundaryCount: number;
  batchesCommitted: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'DRY_RUN_COMPLETE';
  timingSummary?: RunnerTimingSummary;
  error?: string;
}

/**
 * Robust fetcher with backoff for DCGIS ArcGIS FeatureServer.
 * Handles rate limits, transient HTTP 5xx errors, and JSON errors safely.
 */
export async function fetchArcGISFeaturePage(
  afterObjectId: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<DouglasParcelFeature[]> {
  const params = new URLSearchParams({
    where: `OBJECTID > ${afterObjectId}`,
    outFields: DOUGLAS_PARCEL_CONFIG.outFields.join(','),
    orderByFields: 'OBJECTID ASC',
    resultRecordCount: String(pageSize),
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  const url = `${DOUGLAS_PARCEL_CONFIG.endpoint}?${params.toString()}`;
  let attempts = 0;
  const maxAttempts = 5;
  let delay = 1000;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error('ArcGIS fetch aborted by signal.');
    }

    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error(`DCGIS server error (HTTP ${response.status}) after ${maxAttempts} attempts.`);
          }
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        throw new Error(`DCGIS fetch failed with HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`ArcGIS FeatureServer error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return data.features || [];
    } catch (err: any) {
      if (signal?.aborted) throw err;
      attempts++;
      if (attempts >= maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }

  return [];
}

/**
 * Unified, Resumable Douglas County Parcel Ingestion Runner.
 *
 * Guarantees:
 * 1. Dedicated session advisory lock on DIRECT_URL prevents overlapping runs.
 * 2. Deterministic OBJECTID ASC pagination handles gaps and retired parcels gracefully.
 * 3. 25-record atomic batch transactions advance records and durable checkpoint simultaneously.
 * 4. Preserves legal ownership tenure chains and append-only versioned source snapshots.
 * 5. Spatial classification ensures only INSIDE_OMAHA properties are investor-eligible.
 * 6. Read-only dry-run simulation mode.
 */
export async function runDouglasCountyParcelImport(
  prisma: PrismaClient,
  directPrisma: PrismaClient,
  options: CountywideRunnerOptions = {}
): Promise<CountywideRunnerStats> {
  const {
    batchSize = 25,
    pageSize = 250,
    maxRecordsToProcess,
    dryRun = false,
    startAfterObjectId,
    forceFreshRun = false,
    signal,
    customRunId,
  } = options;

  const safePageSize = Math.min(Math.max(pageSize, 1), 250);

  const stats: CountywideRunnerStats = {
    runId: customRunId || `run-parcel-${Date.now()}`,
    mode: dryRun ? 'DRY_RUN' : 'FRESH_IMPORT',
    startingObjectId: 0,
    highestObjectIdProcessed: 0,
    totalFetched: 0,
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    quarantinedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    insideOmahaCount: 0,
    outsideOmahaCount: 0,
    crossesBoundaryCount: 0,
    batchesCommitted: 0,
    status: dryRun ? 'DRY_RUN_COMPLETE' : 'PARTIAL',
  };

  // Step 1: Concurrency Protection (DIRECT_URL Advisory Lock)
  let lockAcquired = false;
  if (!dryRun) {
    const lockResult = await acquireIngestionAdvisoryLock(directPrisma, DOUGLAS_PARCEL_CONFIG.sourceName);
    if (!lockResult.acquired) {
      throw new Error(`Countywide runner blocked: ${lockResult.reason}`);
    }
    lockAcquired = true;
  }

  try {
    // Step 2: Checkpoint Lookup & Resume Evaluation
    let currentCursor = 0;
    if (typeof startAfterObjectId === 'number') {
      currentCursor = startAfterObjectId;
    } else if (!forceFreshRun && !dryRun) {
      const prior = await getLatestIngestionCheckpoint(prisma, DOUGLAS_PARCEL_CONFIG.sourceName);
      if (prior.runId && (prior.status === 'RUNNING' || prior.status === 'PARTIAL')) {
        const lastOid = prior.checkpoint?.lastProcessedObjectId;
        if (typeof lastOid === 'number' && lastOid > 0) {
          currentCursor = lastOid;
          stats.mode = 'INCREMENTAL_RESUME';
          // Mark stale prior run as PARTIAL if still marked RUNNING
          if (prior.status === 'RUNNING') {
            await prisma.ingestionRun.update({
              where: { id: prior.runId },
              data: {
                status: 'PARTIAL',
                completedAt: new Date(),
                errorsJson: { note: `Superceded and resumed by run ${stats.runId} from cursor ${lastOid}` },
              },
            });
          }
        }
      }
    }

    stats.startingObjectId = currentCursor;
    stats.highestObjectIdProcessed = currentCursor;

    // Step 3: Initialize IngestionRun in DB
    if (!dryRun) {
      await prisma.ingestionRun.create({
        data: {
          id: stats.runId,
          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
          status: 'RUNNING',
          statsJson: {
            mode: stats.mode,
            startingObjectId: currentCursor,
            batchSize,
            pageSize: safePageSize,
            maxRecordsToProcess,
          },
        },
      });
    }

    // Step 4: Pre-load Municipal Boundary
    const municipalBoundary = options.mockBoundary || (await fetchOmahaMunicipalBoundary());

    // Step 5: Paginated Processing Loop
    let keepPaging = true;
    let recordsProcessedSoFar = 0;

    let cumulativeFetchMs = 0;
    let cumulativeNormalizeMs = 0;
    let cumulativeDbPrefetchMs = 0;
    let cumulativeDbWritesMs = 0;
    let cumulativeDbCheckpointMs = 0;
    let cumulativeDbTxMs = 0;
    let batchesRecorded = 0;

    const runnerStartTime = performance.now();

    while (keepPaging) {
      if (signal?.aborted) {
        throw new Error('Import loop terminated by abort signal.');
      }

      // Check max records limit if specified
      if (maxRecordsToProcess && recordsProcessedSoFar >= maxRecordsToProcess) {
        break;
      }

      const fetchLimit = maxRecordsToProcess
        ? Math.min(safePageSize, maxRecordsToProcess - recordsProcessedSoFar)
        : safePageSize;

      const fetchStart = performance.now();
      const rawFeatures = await fetchArcGISFeaturePage(currentCursor, fetchLimit, signal);
      cumulativeFetchMs += performance.now() - fetchStart;

      if (rawFeatures.length === 0) {
        // No more features beyond current cursor
        keepPaging = false;
        break;
      }

      stats.totalFetched += rawFeatures.length;

      // Classify and normalize records
      const normStart = performance.now();
      const normalizedBatch: NormalizedParcelRecord[] = [];
      const quarantineBatch: Array<{ normalized: NormalizedParcelRecord; reason: string }> = [];

      for (const feature of rawFeatures) {
        const norm = normalizeDouglasParcel(feature);
        if (!norm) {
          stats.skippedCount++;
          console.warn(`[Runner] Skipped unnormalizable feature: OBJECTID=${feature.attributes?.OBJECTID ?? 'UNKNOWN'}, PIN=${feature.attributes?.PIN ?? 'MISSING'}`);
          continue;
        }

        const rings = feature.geometry?.rings;
        const centroid =
          norm.latitude !== null && norm.longitude !== null
            ? { lat: norm.latitude, lon: norm.longitude }
            : null;

        const boundaryResult = classifyParcelMunicipalJurisdiction(rings, municipalBoundary, centroid);
        norm.boundaryClassification = {
          outcome: boundaryResult.outcome,
          totalVertices: boundaryResult.totalVertices,
          insideVertices: boundaryResult.insideVertices,
          outsideVertices: boundaryResult.outsideVertices,
          centroidInsideBoundary: boundaryResult.centroidInsideBoundary,
          notes: boundaryResult.notes,
        };

        if (boundaryResult.outcome === 'INSIDE_OMAHA') {
          normalizedBatch.push(norm);
        } else if (boundaryResult.outcome === 'OUTSIDE_OMAHA') {
          normalizedBatch.push(norm);
        } else if (boundaryResult.outcome === 'CROSSES_BOUNDARY') {
          normalizedBatch.push(norm);
        } else {
          stats.quarantinedCount++;
          quarantineBatch.push({ normalized: norm, reason: boundaryResult.notes.join('; ') });
        }
      }
      cumulativeNormalizeMs += performance.now() - normStart;

      if (dryRun) {
        for (const norm of normalizedBatch) {
          const outcome = norm.boundaryClassification?.outcome;
          if (outcome === 'INSIDE_OMAHA') stats.insideOmahaCount++;
          else if (outcome === 'OUTSIDE_OMAHA') stats.outsideOmahaCount++;
          else if (outcome === 'CROSSES_BOUNDARY') stats.crossesBoundaryCount++;
        }
        stats.insertedCount += normalizedBatch.length;
        const maxPageObjectId = Math.max(...rawFeatures.map((f) => f.attributes.OBJECTID));
        currentCursor = maxPageObjectId;
        stats.highestObjectIdProcessed = maxPageObjectId;
        recordsProcessedSoFar += rawFeatures.length;
        continue;
      }

      // Process Quarantines in atomic transaction
      if (quarantineBatch.length > 0) {
        await executeQuarantineBatch(prisma, quarantineBatch, stats.runId);
      }

      // Process normalized records in atomic sub-batches of 25
      for (let i = 0; i < normalizedBatch.length; i += batchSize) {
        const subBatch = normalizedBatch.slice(i, i + batchSize);
        const subBatchMaxOid = Math.max(...subBatch.map((r) => r.sourceObjectId));
        const subBatchMaxPin = subBatch[subBatch.length - 1]?.parcelId;

        // Calculate spatial metrics for this specific subBatch
        let subBatchInside = 0;
        let subBatchOutside = 0;
        let subBatchCrosses = 0;
        for (const r of subBatch) {
          const outcome = r.boundaryClassification?.outcome;
          if (outcome === 'INSIDE_OMAHA') subBatchInside++;
          else if (outcome === 'OUTSIDE_OMAHA') subBatchOutside++;
          else if (outcome === 'CROSSES_BOUNDARY') subBatchCrosses++;
        }

        const res = await executeParcelBatchUpsert(prisma, subBatch, stats.runId, {
          lastProcessedObjectId: subBatchMaxOid,
          lastProcessedPin: subBatchMaxPin,
          executionStrategy: options.executionStrategy,
          preserveStats: {
            insideOmahaCount: stats.insideOmahaCount + subBatchInside,
            outsideOmahaCount: stats.outsideOmahaCount + subBatchOutside,
            crossesBoundaryCount: stats.crossesBoundaryCount + subBatchCrosses,
          },
          onTiming: (t) => {
            cumulativeDbPrefetchMs += t.dbPrefetchMs;
            cumulativeDbWritesMs += t.dbWritesMs;
            cumulativeDbCheckpointMs += t.dbCheckpointMs;
            cumulativeDbTxMs += t.txTotalMs;
            batchesRecorded++;
            if (options.onBatchTiming) {
              options.onBatchTiming(t);
            }
          },
        });

        // Advance spatial counters ONLY after the batch transaction successfully commits
        stats.insideOmahaCount += subBatchInside;
        stats.outsideOmahaCount += subBatchOutside;
        stats.crossesBoundaryCount += subBatchCrosses;

        stats.insertedCount += res.insertedCount;
        stats.updatedCount += res.updatedCount;
        stats.unchangedCount += res.unchangedCount;
        stats.batchesCommitted++;
        currentCursor = subBatchMaxOid;
        stats.highestObjectIdProcessed = subBatchMaxOid;
      }

      recordsProcessedSoFar += rawFeatures.length;
    }

    const totalDurationMs = performance.now() - runnerStartTime;
    stats.timingSummary = {
      fetchDurationMs: cumulativeFetchMs,
      normalizationDurationMs: cumulativeNormalizeMs,
      dbPrefetchMs: cumulativeDbPrefetchMs,
      dbWritesMs: cumulativeDbWritesMs,
      dbCheckpointMs: cumulativeDbCheckpointMs,
      dbTransactionMs: cumulativeDbTxMs,
      totalDurationMs,
      averageBatchMs: batchesRecorded > 0 ? cumulativeDbTxMs / batchesRecorded : 0,
      batchesRecorded,
    };

    // Step 6: Finalize Run Status
    if (!dryRun) {
      stats.status = 'SUCCESS';
      const existingRun =
        typeof prisma.ingestionRun.findUnique === 'function'
          ? await prisma.ingestionRun.findUnique({
              where: { id: stats.runId },
              select: { statsJson: true },
            })
          : null;
      const currentStats = (existingRun?.statsJson as Record<string, any>) || {};

      await prisma.ingestionRun.update({
        where: { id: stats.runId },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          statsJson: {
            ...currentStats,
            ...stats,
            finalCursor: currentCursor,
            lastProcessedObjectId: currentStats.lastProcessedObjectId ?? currentCursor,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

  } catch (err: any) {
    stats.status = 'FAILED';
    stats.error = err.message;

    if (!dryRun) {
      try {
        await prisma.ingestionRun.update({
          where: { id: stats.runId },
          data: {
            status: 'PARTIAL',
            completedAt: new Date(),
            errorsJson: { error: err.message, stack: err.stack },
          },
        });
      } catch {}
    }
    throw err;
  } finally {
    if (lockAcquired) {
      await releaseIngestionAdvisoryLock(directPrisma, DOUGLAS_PARCEL_CONFIG.sourceName);
    }
  }

  return stats;
}
