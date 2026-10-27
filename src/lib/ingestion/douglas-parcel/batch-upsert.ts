import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { NormalizedParcelRecord, ImportParcelsStats } from './types';
import { DOUGLAS_PARCEL_CONFIG } from './config';

export type ExecutionStrategy = 'SEQUENTIAL' | 'BULK_EXPERIMENTAL';

export interface BatchTimingMetrics {
  connectionAcquireMs?: number;
  dbPrefetchMs: number;
  dbWritesMs: number;
  dbCheckpointMs: number;
  txTotalMs: number;
  strategyUsed: ExecutionStrategy;
  recordsCount: number;
}

export interface BatchCheckpointOptions {
  lastProcessedObjectId?: number;
  lastProcessedPin?: string;
  batchIndex?: number;
  preserveStats?: Record<string, any>;
  executionStrategy?: ExecutionStrategy;
  onTiming?: (timing: BatchTimingMetrics) => void;
}

export interface BatchUpsertOptions {
  batchSize?: number;
  executionStrategy?: ExecutionStrategy;
}

export interface BatchUpsertResult {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  errors: string[];
  timing?: BatchTimingMetrics;
}

/**
 * Executes a single atomic transaction for a conservative batch of normalized parcel records (25-50).
 * Preserves relational integrity, idempotent PIN upserts, contentHash-based change detection,
 * source provenance (SourceRecord), ownership link (OwnershipRecord), and fail-closed atomicity.
 *
 * If ANY record in this batch fails, the entire transaction rolls back cleanly, leaving
 * the database unmodified for this batch so that the caller does not advance checkpoints past
 * durably committed records.
 *
 * Atomically advances IngestionRun progress and checkpoint in the SAME transaction.
 */
export async function executeParcelBatchUpsert(
  prisma: PrismaClient | Prisma.TransactionClient,
  records: NormalizedParcelRecord[],
  runId: string,
  checkpointOptions?: BatchCheckpointOptions
): Promise<BatchUpsertResult> {
  if (records.length === 0) {
    return {
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  const result: BatchUpsertResult = {
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const parcelIds = records.map((r) => r.parcelId);
  const legacySourceRecordIds = records.map((r) => `PARCEL-${r.parcelId}`);
  const versionedSourceRecordIds = records.map((r) => `PARCEL-${r.parcelId}-${r.contentHash}`);
  const candidateSourceIds = Array.from(new Set([...legacySourceRecordIds, ...versionedSourceRecordIds]));

  const executionStrategy = checkpointOptions?.executionStrategy || 'SEQUENTIAL';

  let prefetchDurationMs = 0;
  let writesDurationMs = 0;
  let checkpointDurationMs = 0;
  let connectionAcquireMs = 0;
  const txDispatchMs = performance.now();
  let operationStartMs = 0;

  const runOperation = async (tx: Prisma.TransactionClient) => {
    operationStartMs = performance.now();
    connectionAcquireMs = operationStartMs - txDispatchMs;

    // 1. Bulk pre-fetch existing records to determine insert vs update vs unchanged
    const prefetchStart = performance.now();
    const existingProperties = await tx.property.findMany({
      where: { parcelId: { in: parcelIds } },
      select: { id: true, parcelId: true },
    });
    const propertyMap = new Map<string, string>();
    for (const p of existingProperties) {
      propertyMap.set(p.parcelId, p.id);
    }

    const existingSources = await tx.sourceRecord.findMany({
      where: {
        sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
        sourceRecordId: { in: candidateSourceIds },
      },
      select: { id: true, sourceRecordId: true, propertyId: true, matchedStatus: true, rawPayloadJson: true },
    });
    const sourceByRecordId = new Map<
      string,
      {
        id: string;
        sourceRecordId: string;
        propertyId: string | null;
        matchedStatus: string;
        rawPayloadJson: any;
      }
    >();
    for (const s of existingSources) {
      sourceByRecordId.set(s.sourceRecordId, s as any);
    }

    // Verify if runId references an existing IngestionRun to satisfy foreign key constraint
    let validIngestionRunId: string | null = null;
    if (runId) {
      const existingRun = await tx.ingestionRun.findUnique({
        where: { id: runId },
        select: { id: true },
      });
      if (existingRun) {
        validIngestionRunId = existingRun.id;
      }
    }

    const existingOwnerships = await tx.ownershipRecord.findMany({
      where: {
        propertyId: { in: Array.from(propertyMap.values()) },
        isCurrent: true,
      },
      select: {
        id: true,
        propertyId: true,
        ownerName: true,
        mailingAddress: true,
      },
    });
    const ownershipMap = new Map<string, { id: string; ownerName: string; mailingAddress: string }>();
    for (const o of existingOwnerships) {
      ownershipMap.set(o.propertyId, o);
    }
    prefetchDurationMs = performance.now() - prefetchStart;

    // 2. Process records within the transaction
    const writesStart = performance.now();

    if (executionStrategy === 'BULK_EXPERIMENTAL') {
      // Experimental bulk-insert path:
      // Separate records into:
      // - Genuinely new properties (not in propertyMap) with no prior source records
      // - Existing properties or records with existing source records (handled by sequential fallback to protect tenure & provenance)
      const bulkCandidateRecords: NormalizedParcelRecord[] = [];
      const sequentialFallbackRecords: NormalizedParcelRecord[] = [];

      const seenNewPins = new Set<string>();

      for (const record of records) {
        const existingPropId = propertyMap.get(record.parcelId);
        const legacySourceRecId = `PARCEL-${record.parcelId}`;
        const versionedSourceRecId = `PARCEL-${record.parcelId}-${record.contentHash}`;
        const existingVersioned = sourceByRecordId.get(versionedSourceRecId);
        const existingLegacy = sourceByRecordId.get(legacySourceRecId);

        if (!existingPropId && !existingVersioned && !existingLegacy && !seenNewPins.has(record.parcelId)) {
          bulkCandidateRecords.push(record);
          seenNewPins.add(record.parcelId);
        } else {
          sequentialFallbackRecords.push(record);
        }
      }

      // Execute bulk insertion for new canonical properties
      if (bulkCandidateRecords.length > 0) {
        // Generate valid, deterministic IDs before bulk insert so children can reference propertyId directly
        const newPropertyRows: any[] = [];
        const newOwnershipRows: any[] = [];
        const newSourceRows: any[] = [];

        for (const record of bulkCandidateRecords) {
          const generatedPropertyId = randomUUID();
          propertyMap.set(record.parcelId, generatedPropertyId);

          newPropertyRows.push({
            id: generatedPropertyId,
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
            geometryGeoJson: (record.geometryGeoJson as any) ?? Prisma.JsonNull,
            municipalJurisdiction: (record.boundaryClassification?.outcome as any) ?? 'UNRESOLVED',
          });

          const generatedOwnershipId = randomUUID();
          newOwnershipRows.push({
            id: generatedOwnershipId,
            propertyId: generatedPropertyId,
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
            purchaseDate: null,
          });

          ownershipMap.set(generatedPropertyId, {
            id: generatedOwnershipId,
            ownerName: record.ownerName,
            mailingAddress: record.mailingAddress,
          });

          const versionedSourceRecId = `PARCEL-${record.parcelId}-${record.contentHash}`;
          newSourceRows.push({
            id: randomUUID(),
            sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
            sourceRecordId: versionedSourceRecId,
            rawPayloadJson: {
              ...record.sanitizedPayload,
              contentHash: record.contentHash,
              boundaryClassification: record.boundaryClassification,
            } as any,
            ingestionRunId: validIngestionRunId,
            propertyId: generatedPropertyId,
            matchedStatus: 'MATCHED',
          });

          sourceByRecordId.set(versionedSourceRecId, {
            id: versionedSourceRecId,
            sourceRecordId: versionedSourceRecId,
            propertyId: generatedPropertyId,
            matchedStatus: 'MATCHED',
            rawPayloadJson: record.sanitizedPayload,
          });
        }

        // Execute bulk insertions in 3 single operations (without skipDuplicates)
        await tx.property.createMany({ data: newPropertyRows });
        await tx.ownershipRecord.createMany({ data: newOwnershipRows });
        await tx.sourceRecord.createMany({ data: newSourceRows });

        result.insertedCount += bulkCandidateRecords.length;
      }

      // Process any existing or conflicting records in the batch via the safe sequential path
      for (const record of sequentialFallbackRecords) {
        await processSingleRecordSequential(tx, record, propertyMap, ownershipMap, sourceByRecordId, validIngestionRunId, result);
      }
    } else {
      // Default: Strict sequential processing (Preserved as fallback)
      for (const record of records) {
        await processSingleRecordSequential(tx, record, propertyMap, ownershipMap, sourceByRecordId, validIngestionRunId, result);
      }
    }
    writesDurationMs = performance.now() - writesStart;

    // 3. Atomically advance IngestionRun progress, heartbeat, and checkpoint in the SAME transaction
    if (runId) {
      const checkpointStart = performance.now();
      const existingRun = await tx.ingestionRun.findUnique({
        where: { id: runId },
        select: { statsJson: true, recordsIngested: true },
      });

      if (existingRun) {
        const currentStats = (existingRun.statsJson as Record<string, any>) || {};
        const batchRecordsCount = records.length;
        const maxBatchObjectId =
          checkpointOptions?.lastProcessedObjectId ??
          Math.max(...records.map((r) => r.sourceObjectId).filter((n) => !isNaN(n) && n > 0), 0);
        const maxBatchPin =
          checkpointOptions?.lastProcessedPin ??
          records[records.length - 1]?.parcelId;

        const updatedStats = {
          ...currentStats,
          ...(checkpointOptions?.preserveStats || {}),
          lastProcessedObjectId: maxBatchObjectId > 0 ? maxBatchObjectId : currentStats.lastProcessedObjectId,
          lastProcessedPin: maxBatchPin || currentStats.lastProcessedPin,
          lastBatchCommittedAt: new Date().toISOString(),
          lastHeartbeatAt: new Date().toISOString(),
          totalBatchesCommitted: (currentStats.totalBatchesCommitted || 0) + 1,
        };

        await tx.ingestionRun.update({
          where: { id: runId },
          data: {
            recordsIngested: { increment: batchRecordsCount },
            statsJson: updatedStats,
          },
        });
      }
      checkpointDurationMs = performance.now() - checkpointStart;
    }
  };

  if ('$transaction' in prisma && typeof (prisma as any).$transaction === 'function') {
    await (prisma as PrismaClient).$transaction(runOperation, {
      maxWait: 15000, // 15s max waiting for pool slot
      timeout: 30000, // 30s max transaction lifetime
    });
  } else {
    await runOperation(prisma as Prisma.TransactionClient);
  }

  const txTotalMs = performance.now() - txDispatchMs;
  const timing: BatchTimingMetrics = {
    connectionAcquireMs,
    dbPrefetchMs: prefetchDurationMs,
    dbWritesMs: writesDurationMs,
    dbCheckpointMs: checkpointDurationMs,
    txTotalMs,
    strategyUsed: executionStrategy,
    recordsCount: records.length,
  };

  result.timing = timing;
  if (checkpointOptions?.onTiming) {
    checkpointOptions.onTiming(timing);
  }

  return result;
}

/**
 * Helper to process a single record with full tenure updates, append-only source snapshots,
 * and conflict detection. Used by sequential execution and mixed bulk fallback.
 */
async function processSingleRecordSequential(
  tx: Prisma.TransactionClient,
  record: NormalizedParcelRecord,
  propertyMap: Map<string, string>,
  ownershipMap: Map<string, { id: string; ownerName: string; mailingAddress: string }>,
  sourceByRecordId: Map<string, { id: string; sourceRecordId: string; propertyId: string | null; matchedStatus: string; rawPayloadJson: any }>,
  runId: string | null,
  result: BatchUpsertResult
) {
  const existingPropId = propertyMap.get(record.parcelId);
  const legacySourceRecId = `PARCEL-${record.parcelId}`;
  const versionedSourceRecId = `PARCEL-${record.parcelId}-${record.contentHash}`;
  const existingVersioned = sourceByRecordId.get(versionedSourceRecId);
  const existingLegacy = sourceByRecordId.get(legacySourceRecId);

  // To be safely treated as an unchanged no-op:
  // 1. Property must exist
  // 2. Current OwnershipRecord must exist with identical titleholder
  // 3. SourceRecord matching this exact contentHash must exist and be linked to this property
  const currentOwnership = existingPropId ? ownershipMap.get(existingPropId) : undefined;
  const hasCurrentOwnership = Boolean(currentOwnership);
  const isOwnerIdentical = Boolean(
    currentOwnership &&
    currentOwnership.ownerName.trim().toUpperCase() === record.ownerName.trim().toUpperCase()
  );

  const hasMatchingSourceSnapshot = Boolean(
    (existingVersioned &&
      (existingVersioned.propertyId === existingPropId || existingVersioned.propertyId === undefined)) ||
    (existingLegacy &&
      (existingLegacy.propertyId === existingPropId || existingLegacy.propertyId === undefined) &&
      existingLegacy.matchedStatus !== 'QUARANTINED' &&
      (existingLegacy.rawPayloadJson as any)?.contentHash === record.contentHash)
  );

  const isUnchanged = Boolean(existingPropId && hasCurrentOwnership && isOwnerIdentical && hasMatchingSourceSnapshot);

  const propertyData: Prisma.PropertyCreateInput = {
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
    geometryGeoJson: (record.geometryGeoJson as any) ?? Prisma.JsonNull,
    municipalJurisdiction: (record.boundaryClassification?.outcome as any) ?? 'UNRESOLVED',
  };

  let resolvedPropertyId: string;

  if (existingPropId) {
    resolvedPropertyId = existingPropId;
    if (isUnchanged) {
      result.unchangedCount++;
      return; // Pure no-op for unchanged parcel: zero mutations, zero writes
    } else {
      await tx.property.update({
        where: { id: existingPropId },
        data: propertyData,
      });
      result.updatedCount++;
    }
  } else {
    const created = await tx.property.create({
      data: propertyData,
    });
    resolvedPropertyId = created.id;
    propertyMap.set(record.parcelId, resolvedPropertyId);
    result.insertedCount++;
  }

  // Upsert OwnershipRecord preserving historical chain
  const activeOwnership = ownershipMap.get(resolvedPropertyId);
  const ownershipData = {
    propertyId: resolvedPropertyId,
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
    purchaseDate: null,
  };

  if (activeOwnership) {
    const isLegalOwnerChanged =
      activeOwnership.ownerName.trim().toUpperCase() !== record.ownerName.trim().toUpperCase();

    if (isLegalOwnerChanged) {
      // Legal titleholder change: close previous tenure and create new current ownership record
      await tx.ownershipRecord.update({
        where: { id: activeOwnership.id },
        data: { isCurrent: false },
      });
      const createdOwn = await tx.ownershipRecord.create({
        data: ownershipData,
      });
      ownershipMap.set(resolvedPropertyId, {
        id: createdOwn.id,
        ownerName: createdOwn.ownerName,
        mailingAddress: createdOwn.mailingAddress,
      });
    } else {
      // Same titleholder: update mailing address and absentee flags WITHOUT closing ownership tenure
      await tx.ownershipRecord.update({
        where: { id: activeOwnership.id },
        data: {
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
        },
      });
    }
  } else {
    const createdOwn = await tx.ownershipRecord.create({
      data: ownershipData,
    });
    ownershipMap.set(resolvedPropertyId, {
      id: createdOwn.id,
      ownerName: createdOwn.ownerName,
      mailingAddress: createdOwn.mailingAddress,
    });
  }

  // Append-Only SourceRecord
  let existingVersionedSource = sourceByRecordId.get(versionedSourceRecId);
  if (!existingVersionedSource && typeof tx.sourceRecord.findUnique === 'function') {
    existingVersionedSource = (await tx.sourceRecord.findUnique({
      where: {
        sourceName_sourceRecordId: {
          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
          sourceRecordId: versionedSourceRecId,
        },
      },
      select: { id: true, sourceRecordId: true, propertyId: true, matchedStatus: true, rawPayloadJson: true },
    })) as any;
  }

  if (existingVersionedSource) {
    if (existingVersionedSource.propertyId && existingVersionedSource.propertyId !== resolvedPropertyId) {
      throw new Error(
        `Integrity conflict: SourceRecord "${versionedSourceRecId}" is already linked to property "${existingVersionedSource.propertyId}", cannot link to "${resolvedPropertyId}"!`
      );
    }
    if (!existingVersionedSource.propertyId) {
      if (typeof tx.sourceRecord.update === 'function') {
        await tx.sourceRecord.update({
          where: { id: existingVersionedSource.id },
          data: { propertyId: resolvedPropertyId, matchedStatus: 'MATCHED' },
        });
      }
      existingVersionedSource.propertyId = resolvedPropertyId;
      existingVersionedSource.matchedStatus = 'MATCHED';
    }
  } else {
    let existingLegacySource = sourceByRecordId.get(legacySourceRecId);
    if (!existingLegacySource && typeof tx.sourceRecord.findUnique === 'function') {
      existingLegacySource = (await tx.sourceRecord.findUnique({
        where: {
          sourceName_sourceRecordId: {
            sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
            sourceRecordId: legacySourceRecId,
          },
        },
        select: { id: true, sourceRecordId: true, propertyId: true, matchedStatus: true, rawPayloadJson: true },
      })) as any;
    }

    if (existingLegacySource) {
      const legacyHash = (existingLegacySource.rawPayloadJson as any)?.contentHash;
      if (existingLegacySource.propertyId && existingLegacySource.propertyId !== resolvedPropertyId) {
        throw new Error(
          `Integrity conflict: Legacy SourceRecord "${legacySourceRecId}" belongs to property "${existingLegacySource.propertyId}", cannot link to "${resolvedPropertyId}"!`
        );
      }

      if (existingLegacySource.matchedStatus === 'QUARANTINED' || legacyHash !== record.contentHash) {
        const createdSrc = await tx.sourceRecord.create({
          data: {
            sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
            sourceRecordId: versionedSourceRecId,
            rawPayloadJson: {
              ...record.sanitizedPayload,
              contentHash: record.contentHash,
              boundaryClassification: record.boundaryClassification,
            } as any,
            ingestionRunId: runId,
            propertyId: resolvedPropertyId,
            matchedStatus: 'MATCHED',
          },
        });
        sourceByRecordId.set(versionedSourceRecId, createdSrc as any);
      } else if (!existingLegacySource.propertyId) {
        if (typeof tx.sourceRecord.update === 'function') {
          await tx.sourceRecord.update({
            where: { id: existingLegacySource.id },
            data: { propertyId: resolvedPropertyId, matchedStatus: 'MATCHED' },
          });
        }
        existingLegacySource.propertyId = resolvedPropertyId;
        existingLegacySource.matchedStatus = 'MATCHED';
      }
    } else {
      const createdSrc = await tx.sourceRecord.create({
        data: {
          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
          sourceRecordId: versionedSourceRecId,
          rawPayloadJson: {
            ...record.sanitizedPayload,
            contentHash: record.contentHash,
            boundaryClassification: record.boundaryClassification,
          } as any,
          ingestionRunId: runId,
          propertyId: resolvedPropertyId,
          matchedStatus: 'MATCHED',
        },
      });
      sourceByRecordId.set(versionedSourceRecId, createdSrc as any);
    }
  }
}

/**
 * Quarantines an array of boundary-crossing or unresolved parcels within a single transaction.
 */
export async function executeQuarantineBatch(
  prisma: PrismaClient | Prisma.TransactionClient,
  records: Array<{
    normalized: NormalizedParcelRecord;
    reason: string;
  }>,
  runId: string
): Promise<{ quarantinedCount: number; maxCommittedObjectId: number }> {
  if (records.length === 0) {
    return { quarantinedCount: 0, maxCommittedObjectId: 0 };
  }

  const maxCommittedObjectId = Math.max(...records.map((r) => r.normalized.sourceObjectId));
  const sourceRecordIds = records.map((r) => `PARCEL-${r.normalized.parcelId}`);

  const runOperation = async (tx: Prisma.TransactionClient) => {
    const existingSources = await tx.sourceRecord.findMany({
      where: {
        sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
        sourceRecordId: { in: sourceRecordIds },
      },
      select: { sourceRecordId: true, propertyId: true },
    });
    const propMap = new Map<string, string | null>();
    for (const s of existingSources) {
      propMap.set(s.sourceRecordId, s.propertyId);
    }

    for (const item of records) {
      const sourceRecordId = `PARCEL-${item.normalized.parcelId}`;
      const existingPropertyId = propMap.get(sourceRecordId) ?? null;

      await tx.sourceRecord.upsert({
        where: {
          sourceName_sourceRecordId: {
            sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
            sourceRecordId,
          },
        },
        update: {
          rawPayloadJson: {
            ...item.normalized.sanitizedPayload,
            contentHash: item.normalized.contentHash,
            boundaryClassification: item.normalized.boundaryClassification,
            quarantineReason: item.reason,
          } as any,
          ingestionRunId: runId,
          matchedStatus: 'QUARANTINED',
        },
        create: {
          sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
          sourceRecordId,
          rawPayloadJson: {
            ...item.normalized.sanitizedPayload,
            contentHash: item.normalized.contentHash,
            boundaryClassification: item.normalized.boundaryClassification,
            quarantineReason: item.reason,
          } as any,
          ingestionRunId: runId,
          propertyId: existingPropertyId,
          matchedStatus: 'QUARANTINED',
        },
      });
    }
  };

  if ('$transaction' in prisma && typeof (prisma as any).$transaction === 'function') {
    await (prisma as PrismaClient).$transaction(runOperation, {
      maxWait: 10000,
      timeout: 20000,
    });
  } else {
    await runOperation(prisma as Prisma.TransactionClient);
  }

  return {
    quarantinedCount: records.length,
    maxCommittedObjectId,
  };
}
