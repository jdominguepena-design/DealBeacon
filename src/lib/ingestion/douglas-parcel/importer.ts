import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../../neon-preflight';
import { DOUGLAS_PARCEL_CONFIG } from './config';
import { fetchParcelEnvelope, fetchParcelFeatures } from './arcgis-client';
import { normalizeDouglasParcel } from './normalize';
import { ImportParcelsStats, NormalizedParcelRecord } from './types';
import {
  classifyParcelMunicipalJurisdiction,
  fetchOmahaMunicipalBoundary,
} from '../../geo/municipal-boundary';
import { OmahaMunicipalBoundary } from '../../geo/types';

import {
  executeParcelBatchUpsert,
  executeQuarantineBatch,
} from './batch-upsert';
import { resolveTrustworthyCheckpoint } from './checkpoint';

export interface ImportParcelsOptions {
  limit?: number;
  pageSize?: number;
  afterObjectId?: number;
  resume?: boolean;
  cityFilter?: string;
  maxObjectId?: number;
  dryRun?: boolean;
  writeMode?: 'sequential' | 'batched';
  batchSize?: number; // Conservative default: 25-50
  failedRecordStrategy?: 'STOP_AT_FAILURE' | 'QUARANTINE_FAILURE';
  onProgress?: (stats: ImportParcelsStats) => void;
}

/**
 * Foreground, bounded importer for Douglas County Parcels.
 * Adheres strictly to fail-closed Neon dev preflight, bounded pagination,
 * checkpointed IngestionRuns, and idempotent upserts.
 */
export async function importDouglasParcels(
  prisma: PrismaClient,
  options: ImportParcelsOptions = {}
): Promise<ImportParcelsStats> {
  // Preflight validation: Strictly enforce Neon Dev target
  verifyNeonDevEndpoints();

  const {
    limit = DOUGLAS_PARCEL_CONFIG.pilotLimit,
    pageSize = DOUGLAS_PARCEL_CONFIG.defaultPageSize,
    cityFilter,
    dryRun = false,
    writeMode = 'sequential',
    batchSize = 25,
    failedRecordStrategy = 'STOP_AT_FAILURE',
    onProgress,
  } = options;

  const checkpointResolution = await resolveTrustworthyCheckpoint(prisma, {
    afterObjectId: options.afterObjectId,
    resume: options.resume,
    sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
  });
  const startAfterObjectId = checkpointResolution.startAfterObjectId;

  const startTime = Date.now();
  const runId = `run-parcel-${Date.now()}`;

  const stats: ImportParcelsStats = {
    runId,
    sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
    startAfterObjectId,
    lastProcessedObjectId: startAfterObjectId,
    pageCount: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    insideOmaha: 0,
    outsideOmahaSkipped: 0,
    crossesBoundaryQuarantined: 0,
    unresolvedQuarantined: 0,
    quarantined: 0,
    quarantinedRecords: [],
    failedRecords: [],
    durationMs: 0,
    errors: [],
  };

  // 1. Fetch Envelope and Authoritative Omaha Municipal Boundary
  let municipalBoundary: OmahaMunicipalBoundary | null = null;
  try {
    municipalBoundary = await fetchOmahaMunicipalBoundary();
  } catch (bErr: any) {
    stats.errors.push(`Warning: Failed to load Omaha municipal boundary: ${bErr.message}`);
  }
  let sourceUpperLimit: number | undefined = options.maxObjectId;
  try {
    const envelope = await fetchParcelEnvelope(cityFilter);
    stats.sourceMinObjectId = envelope.minObjectId;
    stats.sourceMaxObjectId = envelope.maxObjectId;
    stats.totalInSource = envelope.totalCount;

    if (!sourceUpperLimit) {
      sourceUpperLimit = envelope.maxObjectId;
    }
  } catch (envError) {
    const msg = envError instanceof Error ? envError.message : String(envError);
    stats.errors.push(`Notice: Could not query initial envelope stats (${msg}).`);
  }

  let ingestionRunCreated = false;
  if (!dryRun) {
    try {
      await prisma.ingestionRun.create({
        data: {
          id: runId,
          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
          status: 'RUNNING',
          recordsIngested: 0,
          signalsCreated: 0,
        },
      });
      ingestionRunCreated = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to initialize IngestionRun in database: ${msg}`);
    }
  }

  // Graceful signal handling
  let isAborted = false;
  const abortHandler = async (signalName: string) => {
    if (isAborted) return;
    isAborted = true;
    stats.errors.push(`Interrupted by process signal: ${signalName}`);
    if (!dryRun && ingestionRunCreated) {
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
      } catch (err) {
        console.error('Failed to update IngestionRun on abort:', err);
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
    let lastObjectId = startAfterObjectId;
    let keepPaging = true;
    let pageCount = 0;

    while (keepPaging && stats.fetched < limit && !isAborted) {
      pageCount++;
      stats.pageCount = pageCount;
      const pageStartObjectId = lastObjectId;
      const recordsToFetch = Math.min(pageSize, limit - stats.fetched);
      const { features } = await fetchParcelFeatures({
        afterObjectId: lastObjectId,
        maxObjectId: sourceUpperLimit,
        resultRecordCount: recordsToFetch,
        cityFilter,
      });

      if (!features || features.length === 0) {
        break;
      }

      stats.fetched += features.length;

      // Ingestion and database writes: either sequential or batched
      if (writeMode === 'batched' && !dryRun) {
        // Collect page items into candidate arrays
        const validInsideRecords: NormalizedParcelRecord[] = [];
        const quarantineRecords: Array<{ normalized: NormalizedParcelRecord; reason: string }> = [];

        for (const feature of features) {
          if (isAborted) break;

          const normalized = normalizeDouglasParcel(feature);
          if (!normalized) {
            stats.skipped++;
            continue;
          }

          if (municipalBoundary) {
            const rings = feature.geometry?.rings;
            const centroid =
              normalized.latitude !== null && normalized.longitude !== null
                ? { lat: normalized.latitude, lon: normalized.longitude }
                : null;

            const boundaryResult = classifyParcelMunicipalJurisdiction(
              rings,
              municipalBoundary,
              centroid
            );

            normalized.boundaryClassification = {
              outcome: boundaryResult.outcome,
              totalVertices: boundaryResult.totalVertices,
              insideVertices: boundaryResult.insideVertices,
              outsideVertices: boundaryResult.outsideVertices,
              centroidInsideBoundary: boundaryResult.centroidInsideBoundary,
              notes: boundaryResult.notes,
            };

            if (boundaryResult.outcome === 'OUTSIDE_OMAHA') {
              stats.outsideOmahaSkipped++;
              stats.skipped++;
              continue;
            }

            if (boundaryResult.outcome === 'CROSSES_BOUNDARY' || boundaryResult.outcome === 'UNRESOLVED') {
              const isCross = boundaryResult.outcome === 'CROSSES_BOUNDARY';
              if (isCross) stats.crossesBoundaryQuarantined++;
              else stats.unresolvedQuarantined++;
              stats.quarantined++;

              const reason = boundaryResult.notes.join('; ');
              stats.quarantinedRecords?.push({
                parcelId: normalized.parcelId,
                address: normalized.address,
                outcome: boundaryResult.outcome,
                reason,
              });

              quarantineRecords.push({ normalized, reason });
              continue;
            }

            // Strictly INSIDE_OMAHA
            stats.insideOmaha++;
          }

          validInsideRecords.push(normalized);
        }

        // Process quarantines in batches
        let quarantineErrorOccurred = false;
        if (quarantineRecords.length > 0) {
          try {
            await executeQuarantineBatch(prisma, quarantineRecords, runId);
          } catch (qErr: any) {
            quarantineErrorOccurred = true;
            stats.errors.push(`Quarantine batch error: ${qErr.message}`);
          }
        }

        // Process valid inside records in conservative atomic batches (25-50)
        let insideFailureOccurred = false;
        const effectiveBatchSize = Math.max(1, Math.min(batchSize, 50));
        for (let b = 0; b < validInsideRecords.length; b += effectiveBatchSize) {
          if (isAborted) break;
          const chunk = validInsideRecords.slice(b, b + effectiveBatchSize);
          try {
            const batchRes = await executeParcelBatchUpsert(prisma, chunk, runId);
            stats.inserted += batchRes.insertedCount;
            stats.updated += batchRes.updatedCount;
            stats.unchanged += batchRes.unchangedCount;
          } catch (batchErr: any) {
            // Batch transaction failed and was rolled back atomically by Prisma.
            // Fall back to record-by-record processing for this chunk to isolate any failing record!
            stats.errors.push(`Batch transaction failed (${batchErr.message}), falling back to record isolation`);
            for (const rec of chunk) {
              if (isAborted) break;
              try {
                await upsertNormalizedParcel(prisma, rec, runId, stats);
              } catch (singleErr: any) {
                stats.failed++;
                insideFailureOccurred = true;
                const errDetail = `PIN ${rec.parcelId} (OID ${rec.sourceObjectId}): ${singleErr.message}`;
                stats.errors.push(errDetail);
                stats.failedRecords?.push({
                  parcelId: rec.parcelId,
                  sourceObjectId: rec.sourceObjectId,
                  error: singleErr.message,
                });

                if (failedRecordStrategy === 'QUARANTINE_FAILURE') {
                  // Persist durable quarantined failure in SourceRecord so it is auditable and retryable
                  try {
                    await prisma.sourceRecord.upsert({
                      where: {
                        sourceName_sourceRecordId: {
                          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
                          sourceRecordId: `PARCEL-${rec.parcelId}`,
                        },
                      },
                      update: {
                        rawPayloadJson: {
                          ...rec.sanitizedPayload,
                          contentHash: rec.contentHash,
                          quarantineReason: `Ingestion failure: ${singleErr.message}`,
                        } as any,
                        ingestionRunId: runId,
                        matchedStatus: 'QUARANTINED',
                      },
                      create: {
                        sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
                        sourceRecordId: `PARCEL-${rec.parcelId}`,
                        rawPayloadJson: {
                          ...rec.sanitizedPayload,
                          contentHash: rec.contentHash,
                          quarantineReason: `Ingestion failure: ${singleErr.message}`,
                        } as any,
                        ingestionRunId: runId,
                        matchedStatus: 'QUARANTINED',
                      },
                    });
                  } catch (qErr: any) {
                    stats.errors.push(`Failed to persist quarantine for failed record: ${qErr.message}`);
                    keepPaging = false;
                    break;
                  }
                } else {
                  // Default STOP_AT_FAILURE: halt further ingestion immediately.
                  // NEVER advance checkpoint past the failed record!
                  keepPaging = false;
                  break;
                }
              }
            }
            if (!keepPaging) break;
          }
        }

        // Determine contiguous safely handled checkpoint progression across this page:
        // A feature is safely handled if:
        // - It was successfully normalized and skipped (e.g. OUTSIDE_OMAHA, or un-normalizable skipped)
        // - It was quarantined and executeQuarantineBatch succeeded
        // - It was INSIDE_OMAHA and committed (batch or fallback), or persisted as QUARANTINE_FAILURE
        // If an unhandled failure occurred (e.g. under STOP_AT_FAILURE, or quarantine batch error),
        // we advance ONLY up to the last durably handled feature strictly preceding the failure.
        if (!quarantineErrorOccurred && !insideFailureOccurred && !isAborted) {
          // Entire page handled successfully with zero failures
          const maxPageOid = Math.max(...features.map((f) => f.attributes?.OBJECTID ?? 0));
          lastObjectId = Math.max(lastObjectId, maxPageOid);
          stats.lastProcessedObjectId = lastObjectId;
        } else {
          // Failure or abort encountered: compute highest contiguous safely handled OBJECTID in ascending order
          const sortedFeatures = [...features]
            .filter((f) => f.attributes?.OBJECTID !== undefined && f.attributes?.OBJECTID !== null)
            .sort((a, b) => a.attributes.OBJECTID - b.attributes.OBJECTID);

          const failedOids = new Set((stats.failedRecords ?? []).map((r) => r.sourceObjectId));

          for (const feat of sortedFeatures) {
            const featOid = feat.attributes.OBJECTID;
            if (failedOids.has(featOid)) {
              // Reached the failed record under STOP_AT_FAILURE; stop advancing immediately
              break;
            }
            // If quarantine batch errored and this feature was one of the quarantine records, stop advancing
            if (quarantineErrorOccurred && quarantineRecords.some((q) => q.normalized.sourceObjectId === featOid)) {
              break;
            }
            lastObjectId = Math.max(lastObjectId, featOid);
            stats.lastProcessedObjectId = lastObjectId;
          }
        }
      } else {
        // Sequential mode (original resilient path or dryRun)
        for (const feature of features) {
          if (isAborted) break;

          if (feature.attributes?.OBJECTID) {
            lastObjectId = Math.max(lastObjectId, feature.attributes.OBJECTID);
            stats.lastProcessedObjectId = lastObjectId;
          }

          const normalized = normalizeDouglasParcel(feature);
          if (!normalized) {
            stats.skipped++;
            continue;
          }

          // Spatial Boundary Classification & Quarantine Enforcement
          if (municipalBoundary) {
            const rings = feature.geometry?.rings;
            const centroid =
              normalized.latitude !== null && normalized.longitude !== null
                ? { lat: normalized.latitude, lon: normalized.longitude }
                : null;

            const boundaryResult = classifyParcelMunicipalJurisdiction(
              rings,
              municipalBoundary,
              centroid
            );

            normalized.boundaryClassification = {
              outcome: boundaryResult.outcome,
              totalVertices: boundaryResult.totalVertices,
              insideVertices: boundaryResult.insideVertices,
              outsideVertices: boundaryResult.outsideVertices,
              centroidInsideBoundary: boundaryResult.centroidInsideBoundary,
              notes: boundaryResult.notes,
            };

            if (boundaryResult.outcome === 'OUTSIDE_OMAHA') {
              stats.outsideOmahaSkipped++;
              stats.skipped++;
              continue;
            }

            if (boundaryResult.outcome === 'CROSSES_BOUNDARY' || boundaryResult.outcome === 'UNRESOLVED') {
              const isCross = boundaryResult.outcome === 'CROSSES_BOUNDARY';
              if (isCross) stats.crossesBoundaryQuarantined++;
              else stats.unresolvedQuarantined++;
              stats.quarantined++;

              const reason = boundaryResult.notes.join('; ');
              stats.quarantinedRecords?.push({
                parcelId: normalized.parcelId,
                address: normalized.address,
                outcome: boundaryResult.outcome,
                reason,
              });

              if (!dryRun) {
                const sourceRecordId = `PARCEL-${normalized.parcelId}`;
                const existingSrc = await prisma.sourceRecord.findUnique({
                  where: {
                    sourceName_sourceRecordId: {
                      sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
                      sourceRecordId,
                    },
                  },
                  select: { propertyId: true },
                });

                await prisma.sourceRecord.upsert({
                  where: {
                    sourceName_sourceRecordId: {
                      sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
                      sourceRecordId,
                    },
                  },
                  update: {
                    rawPayloadJson: {
                      ...normalized.sanitizedPayload,
                      contentHash: normalized.contentHash,
                      boundaryClassification: normalized.boundaryClassification,
                      quarantineReason: reason,
                    } as any,
                    ingestionRunId: runId,
                    matchedStatus: 'QUARANTINED',
                  },
                  create: {
                    sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
                    sourceRecordId,
                    rawPayloadJson: {
                      ...normalized.sanitizedPayload,
                      contentHash: normalized.contentHash,
                      boundaryClassification: normalized.boundaryClassification,
                      quarantineReason: reason,
                    } as any,
                    ingestionRunId: runId,
                    propertyId: existingSrc?.propertyId ?? null,
                    matchedStatus: 'QUARANTINED',
                  },
                });
              }

              continue;
            }

            // Strictly INSIDE_OMAHA
            stats.insideOmaha++;
          }

          if (dryRun) {
            stats.inserted++;
            continue;
          }

          // Database upsert
          try {
            await upsertNormalizedParcel(prisma, normalized, runId, stats);
          } catch (dbErr: any) {
            stats.failed++;
            stats.errors.push(`PIN ${normalized.parcelId}: ${dbErr.message}`);
          }
        }
      }

      // Checkpoint IngestionRun after every page
      if (!dryRun && ingestionRunCreated) {
        try {
          await prisma.ingestionRun.update({
            where: { id: runId },
            data: {
              recordsIngested: stats.inserted + stats.updated,
              statsJson: {
                ...stats,
                pageCount,
                lastObjectId,
                lastCheckpointAt: new Date().toISOString(),
              } as any,
            },
          });
        } catch (checkpointErr) {
          console.warn('Warning: Checkpoint update failed:', checkpointErr);
        }
      }

      if (onProgress) {
        stats.durationMs = Date.now() - startTime;
        onProgress({ ...stats });
      }

      if (features.length < recordsToFetch) {
        keepPaging = false;
      }

      // Explicit no-progress guard: if ArcGIS returned a nonempty page, no intentional
      // halt occurred, but the cursor failed to advance beyond pageStartObjectId, fail closed
      // to prevent an infinite loop fetching identical source features.
      if (
        features.length > 0 &&
        lastObjectId === pageStartObjectId &&
        stats.failed === 0 &&
        !isAborted &&
        keepPaging
      ) {
        throw new Error(
          `Batched importer cursor failed to advance from OBJECTID ${lastObjectId} on nonempty page of ${features.length} features. Halting to prevent infinite loop.`
        );
      }
    }

    stats.durationMs = Date.now() - startTime;

    // Terminal update for IngestionRun
    if (!dryRun && ingestionRunCreated) {
      const finalStatus = stats.failed > 0 && stats.inserted === 0 ? 'FAILED' : 'SUCCESS';
      await prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          recordsIngested: stats.inserted + stats.updated,
          completedAt: new Date(),
          statsJson: stats as any,
          errorsJson: stats.errors.length > 0 ? (stats.errors as any) : undefined,
        },
      });
    }

    return stats;
  } finally {
    process.removeListener('SIGINT', sigintListener);
    process.removeListener('SIGTERM', sigtermListener);
  }
}

/**
 * Idempotently upserts a Property and linked OwnershipRecord & SourceRecord.
 */
async function upsertNormalizedParcel(
  prisma: PrismaClient,
  record: NormalizedParcelRecord,
  runId: string,
  stats: ImportParcelsStats
): Promise<void> {
  const existingProperty = await prisma.property.findUnique({
    where: { parcelId: record.parcelId },
    select: { id: true, updatedAt: true },
  });

  const propertyData: any = {
    parcelId: record.parcelId,
    address: record.address,
    hasAuthoritativeAddress: record.hasAuthoritativeAddress,
    city: record.city,
    state: record.state,
    zip: record.zip,
    propertyType: record.propertyType,
    yearBuilt: record.yearBuilt,
    squareFeet: record.squareFeet,
    lotSizeSqFt: record.lotSizeSqFt,
    countyClass: record.countyClass,
    condition: record.condition,
    quality: record.quality,
    dcaAccountType: record.dcaAccountType,
    legalDescription: record.legalDescription,
    assessorUrl: record.assessorUrl,
    treasurerUrl: record.treasurerUrl,
    latitude: record.latitude,
    longitude: record.longitude,
    geometryGeoJson: record.geometryGeoJson,
    municipalJurisdiction: record.boundaryClassification?.outcome ?? 'UNRESOLVED',
  };

  const existingSource = await prisma.sourceRecord.findUnique({
    where: {
      sourceName_sourceRecordId: {
        sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
        sourceRecordId: `PARCEL-${record.parcelId}`,
      },
    },
    select: { id: true, rawPayloadJson: true },
  });

  const existingHash = (existingSource?.rawPayloadJson as any)?.contentHash;
  const isUnchanged = Boolean(existingProperty && existingHash && existingHash === record.contentHash);

  let propertyId: string;

  if (existingProperty) {
    propertyId = existingProperty.id;
    if (isUnchanged) {
      stats.unchanged++;
    } else {
      await prisma.property.update({
        where: { id: propertyId },
        data: propertyData,
      });
      stats.updated++;
    }
  } else {
    const created = await prisma.property.create({
      data: propertyData,
    });
    propertyId = created.id;
    stats.inserted++;
  }

  // Upsert OwnershipRecord
  const existingOwnership = await prisma.ownershipRecord.findFirst({
    where: { propertyId, isCurrent: true },
    select: { id: true },
  });

  const ownershipData: any = {
    propertyId,
    ownerName: record.ownerName,
    mailingAddress: record.mailingAddress,
    mailingCity: record.mailingCity,
    mailingState: record.mailingState,
    mailingZip: record.mailingZip,
    isAbsentee: record.isAbsentee,
    isOutOfState: record.isOutOfState,
    isCorporate: record.isCorporate,
    absenteeStatus: record.absenteeStatus,
    outOfStateStatus: record.outOfStateStatus,
    corporateStatus: record.corporateStatus,
    isCurrent: true,
  };

  if (existingOwnership) {
    await prisma.ownershipRecord.update({
      where: { id: existingOwnership.id },
      data: ownershipData,
    });
  } else {
    await prisma.ownershipRecord.create({
      data: ownershipData,
    });
  }

  // Record SourceRecord immutable snapshot
  const sourceRecordId = `PARCEL-${record.parcelId}`;
  await prisma.sourceRecord.upsert({
    where: {
      sourceName_sourceRecordId: {
        sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
        sourceRecordId,
      },
    },
    update: {
      rawPayloadJson: {
        ...record.sanitizedPayload,
        contentHash: record.contentHash,
        boundaryClassification: record.boundaryClassification,
      } as any,
      ingestionRunId: runId,
      propertyId,
    },
    create: {
      sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
      sourceRecordId,
      rawPayloadJson: {
        ...record.sanitizedPayload,
        contentHash: record.contentHash,
        boundaryClassification: record.boundaryClassification,
      } as any,
      ingestionRunId: runId,
      propertyId,
      matchedStatus: 'MATCHED',
    },
  });
}
