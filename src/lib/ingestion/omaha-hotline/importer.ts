import { PrismaClient } from '@prisma/client';
import { OMAHA_HOTLINE_CONFIG } from './config';
import { fetchHotlineFeatures, fetchHotlineEnvelope } from './arcgis-client';
import { normalizeHotlineFeature } from './normalize';

export interface ImportHotlineOptions {
  limit?: number;
  pageSize?: number;
  dryRun?: boolean;
  maxObjectId?: number;
  onProgress?: (info: {
    page: number;
    fetched: number;
    inserted: number;
    updated: number;
    unchanged: number;
    skipped: number;
    failed: number;
  }) => void;
}

export interface ImportHotlineStats {
  runId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  durationMs: number;
  sourceMinObjectId?: number;
  sourceMaxObjectId?: number;
  totalEligibleInSource?: number;
  errors: string[];
}

/**
 * Main importer orchestrator for Omaha Hotline records.
 * Ensures idempotent execution, snapshot provenance in SourceRecord, and tracking in IngestionRun.
 * Includes graceful signal interception and incremental IngestionRun checkpointing to avoid stale RUNNING records.
 */
export async function importOmahaHotlineRecords(
  prisma: PrismaClient,
  options: ImportHotlineOptions = {}
): Promise<ImportHotlineStats> {
  const {
    limit = 3000,
    pageSize = options.pageSize || OMAHA_HOTLINE_CONFIG.defaultPageSize,
    dryRun = false,
    onProgress,
  } = options;

  const startTime = Date.now();
  const runId = `run-hotline-${Date.now()}`;

  const stats: ImportHotlineStats = {
    runId,
    sourceName: OMAHA_HOTLINE_CONFIG.sourceName,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
    errors: [],
  };

  // Step 1: Capture upper source envelope boundary before querying pages
  let sourceUpperLimit: number | undefined = options.maxObjectId;
  try {
    const envelope = await fetchHotlineEnvelope();
    stats.sourceMinObjectId = envelope.minObjectId;
    stats.sourceMaxObjectId = envelope.maxObjectId;
    stats.totalEligibleInSource = envelope.totalCount;

    if (!sourceUpperLimit) {
      sourceUpperLimit = envelope.maxObjectId;
    }
  } catch (envError) {
    const msg = envError instanceof Error ? envError.message : String(envError);
    stats.errors.push(`Notice: Could not query initial envelope stats (${msg}). Paging will proceed without fixed upper boundary.`);
  }

  let ingestionRunCreated = false;
  if (!dryRun) {
    try {
      await prisma.ingestionRun.create({
        data: {
          id: runId,
          sourceName: OMAHA_HOTLINE_CONFIG.sourceName,
          status: 'RUNNING',
          recordsIngested: 0,
          signalsCreated: 0,
        },
      });
      ingestionRunCreated = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`Failed to initialize ingestion run: ${msg}`);
      stats.failed++;
      return stats;
    }
  }

  // Graceful signal handler to prevent orphaned RUNNING state
  let isAborted = false;
  const abortHandler = async (signalName: string) => {
    if (isAborted) return;
    isAborted = true;
    console.log(`\n[Importer] Interruption signal received (${signalName}). Safely concluding IngestionRun in database...`);
    if (ingestionRunCreated) {
      try {
        await prisma.ingestionRun.update({
          where: { id: runId },
          data: {
            status: stats.inserted > 0 || stats.updated > 0 ? 'PARTIAL' : 'FAILED',
            recordsIngested: stats.inserted + stats.updated,
            completedAt: new Date(),
            errorsJson: [`Process interrupted by ${signalName}`],
            statsJson: {
              ...stats,
              interruptedBySignal: signalName,
              interruptedAt: new Date().toISOString(),
            } as any,
          },
        });
      } catch (runAbortError) {
        console.error('Failed to update IngestionRun on abort:', runAbortError);
      }
    }
  };

  const sigintListener = () => {
    abortHandler('SIGINT').finally(() => {
      prisma.$disconnect().finally(() => process.exit(130));
    });
  };
  const sigtermListener = () => {
    abortHandler('SIGTERM').finally(() => {
      prisma.$disconnect().finally(() => process.exit(143));
    });
  };

  process.on('SIGINT', sigintListener);
  process.on('SIGTERM', sigtermListener);

  try {
    let lastObjectId = 0;
    let keepPaging = true;
    let pageCount = 0;

    while (keepPaging && stats.fetched < limit && !isAborted) {
      pageCount++;
      const recordsToFetch = Math.min(pageSize, limit - stats.fetched);
      const { features } = await fetchHotlineFeatures({
        afterObjectId: lastObjectId,
        maxObjectId: sourceUpperLimit,
        resultRecordCount: recordsToFetch,
      });

      if (!features || features.length === 0) {
        break;
      }

      stats.fetched += features.length;

      for (const feature of features) {
        if (isAborted) break;

        if (feature.attributes?.objectid) {
          lastObjectId = Math.max(lastObjectId, feature.attributes.objectid);
        }

        const normalized = normalizeHotlineFeature(feature);
        if (!normalized) {
          stats.skipped++;
          continue;
        }

        if (dryRun) {
          stats.inserted++;
          continue;
        }

        try {
          // Check for existing normalized report
          const existingReport = await prisma.hotlineReport.findUnique({
            where: { sourceGlobalId: normalized.sourceGlobalId },
            include: { latestSourceRecord: true },
          });

          if (!existingReport) {
            // Brand new record: Create SourceRecord snapshot then create HotlineReport
            const sourceRecord = await prisma.sourceRecord.upsert({
              where: {
                sourceName_sourceRecordId: {
                  sourceName: normalized.sourceName,
                  sourceRecordId: normalized.snapshotIdentifier,
                },
              },
              create: {
                sourceName: normalized.sourceName,
                sourceRecordId: normalized.snapshotIdentifier,
                rawPayloadJson: normalized.sanitizedPayload as any,
                ingestionRunId: runId,
                matchedStatus: 'UNMATCHED',
              },
              update: {},
            });

            await prisma.hotlineReport.create({
              data: {
                sourceName: normalized.sourceName,
                sourceGlobalId: normalized.sourceGlobalId,
                sourceObjectId: normalized.sourceObjectId,
                requestId: normalized.requestId,
                reportCategory: normalized.reportCategory,
                problemType: normalized.problemType,
                locationText: normalized.locationText,
                status: normalized.status,
                recordKind: normalized.recordKind,
                reportedAt: normalized.reportedAt,
                reportedAtSource: normalized.reportedAtSource,
                completedAt: normalized.completedAt,
                sourceCreatedAt: normalized.sourceCreatedAt,
                sourceEditedAt: normalized.sourceEditedAt,
                latitude: normalized.latitude,
                longitude: normalized.longitude,
                publicView: normalized.publicView,
                sourceUrl: normalized.sourceUrl,
                latestSourceRecordId: sourceRecord.id,
                matchStatus: 'UNMATCHED',
                lastSeenAt: new Date(),
              },
            });

            stats.inserted++;
          } else {
            // Record exists: check if content snapshot has changed
            const existingSnapshotId = existingReport.latestSourceRecord?.sourceRecordId;
            const incomingSnapshotId = normalized.snapshotIdentifier;

            if (existingSnapshotId !== incomingSnapshotId) {
              // Upstream record content or edit timestamp changed: create new immutable SourceRecord snapshot
              const sourceRecord = await prisma.sourceRecord.upsert({
                where: {
                  sourceName_sourceRecordId: {
                    sourceName: normalized.sourceName,
                    sourceRecordId: normalized.snapshotIdentifier,
                  },
                },
                create: {
                  sourceName: normalized.sourceName,
                  sourceRecordId: normalized.snapshotIdentifier,
                  rawPayloadJson: normalized.sanitizedPayload as any,
                  ingestionRunId: runId,
                  matchedStatus: existingReport.matchStatus,
                },
                update: {},
              });

              await prisma.hotlineReport.update({
                where: { id: existingReport.id },
                data: {
                  sourceObjectId: normalized.sourceObjectId,
                  requestId: normalized.requestId,
                  reportCategory: normalized.reportCategory,
                  problemType: normalized.problemType,
                  locationText: normalized.locationText,
                  status: normalized.status,
                  reportedAt: normalized.reportedAt,
                  reportedAtSource: normalized.reportedAtSource,
                  completedAt: normalized.completedAt,
                  sourceEditedAt: normalized.sourceEditedAt,
                  latitude: normalized.latitude,
                  longitude: normalized.longitude,
                  publicView: normalized.publicView,
                  latestSourceRecordId: sourceRecord.id,
                  lastSeenAt: new Date(),
                },
              });

              stats.updated++;
            } else {
              // Record is unchanged: touch lastSeenAt only
              await prisma.hotlineReport.update({
                where: { id: existingReport.id },
                data: { lastSeenAt: new Date() },
              });

              stats.unchanged++;
            }
          }
        } catch (recordError) {
          const msg = recordError instanceof Error ? recordError.message : String(recordError);
          stats.errors.push(`Record ${normalized.sourceGlobalId} error: ${msg}`);
          stats.failed++;
        }
      }

      // Checkpoint incremental progress to IngestionRun in database
      if (!dryRun && ingestionRunCreated) {
        try {
          await prisma.ingestionRun.update({
            where: { id: runId },
            data: {
              recordsIngested: stats.inserted + stats.updated,
            },
          });
        } catch {
          // Non-fatal checkpoint failure
        }
      }

      onProgress?.({
        page: pageCount,
        fetched: stats.fetched,
        inserted: stats.inserted,
        updated: stats.updated,
        unchanged: stats.unchanged,
        skipped: stats.skipped,
        failed: stats.failed,
      });

      if (features.length < pageSize) {
        keepPaging = false;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Batch pagination error: ${msg}`);
  } finally {
    process.off('SIGINT', sigintListener);
    process.off('SIGTERM', sigtermListener);

    stats.durationMs = Date.now() - startTime;

    if (!dryRun && ingestionRunCreated && !isAborted) {
      try {
        await prisma.ingestionRun.update({
          where: { id: runId },
          data: {
            completedAt: new Date(),
            status: stats.failed > 0 ? (stats.inserted > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
            recordsIngested: stats.inserted + stats.updated,
            statsJson: stats as any,
            errorsJson: stats.errors.length > 0 ? (stats.errors as any) : null,
          },
        });
      } catch (runUpdateError) {
        console.error('Failed to update IngestionRun final status:', runUpdateError);
      }
    }
  }

  return stats;
}
