import { PrismaClient } from '@prisma/client';
import { DOUGLAS_PARCEL_CONFIG } from './config';

export interface CheckpointResolutionResult {
  startAfterObjectId: number;
  source: 'EXPLICIT_OPTION' | 'RUN_CHECKPOINT' | 'FRESH_START';
  runId?: string;
  runStatus?: string;
  notes: string[];
}

export class CheckpointResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointResolutionError';
  }
}

/**
 * Resolves the trustworthy starting OBJECTID for parcel ingestion.
 *
 * Requirements:
 * 1. If explicit `afterObjectId` is provided, always honor it.
 * 2. If `resume` is requested:
 *    - Query the latest IngestionRun for DOUGLAS_COUNTY_ASSESSOR.
 *    - If no run exists, and 0 source records exist, allow fresh start from 0.
 *    - If a run exists with trustworthy checkpoint metadata (statsJson.lastProcessedObjectId or statsJson.lastObjectId):
 *      - Verify the checkpoint is numeric and >= 0.
 *      - Use that run's last durably committed contiguous OBJECTID.
 *    - NEVER use global SELECT MAX(rawPayloadJson->>'OBJECTID') across all source records,
 *      because a failed run could have processed isolated records or failed at an earlier OID,
 *      which would cause uncommitted/failed records to be silently skipped!
 *    - If the run is malformed, has no checkpoint, or checkpoint is corrupted:
 *      FAIL CLOSED: throw CheckpointResolutionError requiring an explicit --after-object-id.
 * 3. If neither resume nor afterObjectId is provided, default to 0 (fresh import).
 */
export async function resolveTrustworthyCheckpoint(
  prisma: PrismaClient,
  options: {
    afterObjectId?: number;
    resume?: boolean;
    sourceName?: string;
  }
): Promise<CheckpointResolutionResult> {
  const sourceName = options.sourceName ?? DOUGLAS_PARCEL_CONFIG.sourceName;

  // 1. Explicit option takes precedence
  if (typeof options.afterObjectId === 'number') {
    if (isNaN(options.afterObjectId) || options.afterObjectId < 0) {
      throw new CheckpointResolutionError(
        `Invalid explicit afterObjectId provided: ${options.afterObjectId}. Must be a non-negative number.`
      );
    }
    return {
      startAfterObjectId: options.afterObjectId,
      source: 'EXPLICIT_OPTION',
      notes: [`Explicit afterObjectId provided: ${options.afterObjectId}`],
    };
  }

  // 2. If not resuming, fresh start from 0
  if (!options.resume) {
    return {
      startAfterObjectId: 0,
      source: 'FRESH_START',
      notes: ['Fresh start requested (resume=false, afterObjectId=undefined)'],
    };
  }

  // 3. Resume requested: Inspect latest IngestionRun for this source
  const latestRun = await prisma.ingestionRun.findFirst({
    where: { sourceName },
    orderBy: { startedAt: 'desc' },
  });

  if (!latestRun) {
    // Check if any source records exist
    const sourceCount = await prisma.sourceRecord.count({
      where: { sourceName },
    });
    if (sourceCount === 0) {
      return {
        startAfterObjectId: 0,
        source: 'FRESH_START',
        notes: ['Resume requested but no prior IngestionRun or SourceRecords exist; starting from 0.'],
      };
    }
    // Source records exist but no IngestionRun! Fail closed.
    throw new CheckpointResolutionError(
      `Cannot safely resume: ${sourceCount} SourceRecords exist for "${sourceName}", but no IngestionRun checkpoint was found. ` +
      `To prevent skipping failed or uncommitted records, specify an explicit starting OBJECTID with --after-object-id <number>.`
    );
  }

  // Inspect run's statsJson for durable checkpoint
  const stats = (latestRun.statsJson as any) ?? {};
  const checkpointOid =
    typeof stats.lastProcessedObjectId === 'number'
      ? stats.lastProcessedObjectId
      : typeof stats.lastObjectId === 'number'
      ? stats.lastObjectId
      : undefined;

  if (typeof checkpointOid !== 'number' || isNaN(checkpointOid) || checkpointOid < 0) {
    throw new CheckpointResolutionError(
      `Cannot safely resume run "${latestRun.id}" (status: ${latestRun.status}): ` +
      `Checkpoint metadata is missing or malformed (lastProcessedObjectId: ${stats.lastProcessedObjectId}). ` +
      `Failing closed to prevent skipping records. Specify an explicit starting OBJECTID with --after-object-id <number>.`
    );
  }

  return {
    startAfterObjectId: checkpointOid,
    source: 'RUN_CHECKPOINT',
    runId: latestRun.id,
    runStatus: latestRun.status,
    notes: [
      `Resuming from latest IngestionRun "${latestRun.id}" (status: ${latestRun.status}) checkpoint: OBJECTID ${checkpointOid}`,
      `Durable checkpoint source: statsJson.lastProcessedObjectId`,
    ],
  };
}
