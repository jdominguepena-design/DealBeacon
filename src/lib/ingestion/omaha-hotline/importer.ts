import { PrismaClient } from '@prisma/client';
import { OMAHA_HOTLINE_CONFIG } from './config';
import { fetchHotlineFeatures } from './arcgis-client';
import { normalizeHotlineFeature } from './normalize';

export interface ImportHotlineOptions {
  limit?: number;
  pageSize?: number;
  dryRun?: boolean;
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
  errors: string[];
}

/**
 * Main importer orchestrator for Omaha Hotline records.
 * Ensures idempotent execution, snapshot provenance in SourceRecord, and tracking in IngestionRun.
 */
export async function importOmahaHotlineRecords(
  prisma: PrismaClient,
  options: ImportHotlineOptions = {}
): Promise<ImportHotlineStats> {
  const {
    limit = 25,
    pageSize = Math.min(options.limit || 25, OMAHA_HOTLINE_CONFIG.defaultPageSize),
    dryRun = false,
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

  try {
    let lastObjectId = 0;
    let keepPaging = true;

    while (keepPaging && stats.fetched < limit) {
      const recordsToFetch = Math.min(pageSize, limit - stats.fetched);
      const { features } = await fetchHotlineFeatures({
        afterObjectId: lastObjectId,
        resultRecordCount: recordsToFetch,
      });

      if (!features || features.length === 0) {
        break;
      }

      stats.fetched += features.length;

      for (const feature of features) {
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
            // Record exists: check if EditDate has changed
            const existingEditTime = existingReport.sourceEditedAt?.getTime() ?? 0;
            const incomingEditTime = normalized.sourceEditedAt?.getTime() ?? 0;

            if (incomingEditTime !== existingEditTime && incomingEditTime > 0) {
              // Upstream record was edited: create new immutable SourceRecord snapshot
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

      if (features.length < pageSize) {
        keepPaging = false;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Batch pagination error: ${msg}`);
  } finally {
    stats.durationMs = Date.now() - startTime;

    if (!dryRun && ingestionRunCreated) {
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
