import { PrismaClient, Prisma } from '@prisma/client';
import { NormalizedParcelRecord, ImportParcelsStats } from './types';
import { DOUGLAS_PARCEL_CONFIG } from './config';

export interface BatchUpsertOptions {
  batchSize?: number;
}

export interface BatchUpsertResult {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Executes a single atomic transaction for a conservative batch of normalized parcel records (25-50).
 * Preserves relational integrity, idempotent PIN upserts, contentHash-based change detection,
 * source provenance (SourceRecord), ownership link (OwnershipRecord), and fail-closed atomicity.
 *
 * If ANY record in this batch fails, the entire transaction rolls back cleanly, leaving
 * the database unmodified for this batch so that the caller does not advance checkpoints past
 * durably committed records.
 */
export async function executeParcelBatchUpsert(
  prisma: PrismaClient | Prisma.TransactionClient,
  records: NormalizedParcelRecord[],
  runId: string
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
  const sourceRecordIds = records.map((r) => `PARCEL-${r.parcelId}`);

  const runOperation = async (tx: Prisma.TransactionClient) => {
    // 1. Bulk pre-fetch existing records to determine insert vs update vs unchanged
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
          sourceRecordId: { in: sourceRecordIds },
        },
        select: { id: true, sourceRecordId: true, rawPayloadJson: true },
      });
      const sourceHashMap = new Map<string, string | undefined>();
      for (const s of existingSources) {
        const hash = (s.rawPayloadJson as any)?.contentHash;
        sourceHashMap.set(s.sourceRecordId, hash);
      }

      const existingOwnerships = await tx.ownershipRecord.findMany({
        where: {
          propertyId: { in: Array.from(propertyMap.values()) },
          isCurrent: true,
        },
        select: { id: true, propertyId: true },
      });
      const ownershipMap = new Map<string, string>();
      for (const o of existingOwnerships) {
        ownershipMap.set(o.propertyId, o.id);
      }

      // 2. Process each record within the transaction
      for (const record of records) {
        const existingPropId = propertyMap.get(record.parcelId);
        const sourceRecId = `PARCEL-${record.parcelId}`;
        const existingHash = sourceHashMap.get(sourceRecId);

        const isUnchanged = Boolean(existingPropId && existingHash && existingHash === record.contentHash);

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

        // Upsert OwnershipRecord
        const existingOwnershipId = ownershipMap.get(resolvedPropertyId);
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
        };

        if (existingOwnershipId) {
          await tx.ownershipRecord.update({
            where: { id: existingOwnershipId },
            data: ownershipData,
          });
        } else {
          const createdOwn = await tx.ownershipRecord.create({
            data: ownershipData,
          });
          ownershipMap.set(resolvedPropertyId, createdOwn.id);
        }

        // Upsert SourceRecord
        await tx.sourceRecord.upsert({
          where: {
            sourceName_sourceRecordId: {
              sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
              sourceRecordId: sourceRecId,
            },
          },
          update: {
            rawPayloadJson: {
              ...record.sanitizedPayload,
              contentHash: record.contentHash,
              boundaryClassification: record.boundaryClassification,
            } as any,
            ingestionRunId: runId,
            propertyId: resolvedPropertyId,
          },
          create: {
            sourceName: DOUGLAS_PARCEL_CONFIG.sourceName,
            sourceRecordId: sourceRecId,
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
        sourceHashMap.set(sourceRecId, record.contentHash);
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

  return result;
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
