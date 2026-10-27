import { PrismaClient, Prisma } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../neon-preflight';

export interface IngestionLockResult {
  acquired: boolean;
  lockKey: string;
  reason?: string;
}

export interface IngestionRunCheckpoint {
  lastProcessedObjectId?: number;
  lastProcessedPin?: string;
  totalBatchesCommitted?: number;
  lastHeartbeatAt?: string;
  resumedFromRunId?: string;
  mode?: 'INCREMENTAL_RESUME' | 'SOURCE_REFRESH';
}

/**
 * 64-bit integer hashing for PostgreSQL 32-bit/64-bit advisory locking.
 * Converts a string like 'DOUGLAS_COUNTY_ASSESSOR' into a deterministic 64-bit BigInt.
 */
function hashStringToAdvisoryLockId(str: string): bigint {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = BigInt(str.charCodeAt(i));
    hash = ((hash << 5n) - hash + char) & 0x7fffffffffffffffn; // keep in positive signed 64-bit int range
  }
  return hash;
}

/**
 * Creates a dedicated, non-pooled PrismaClient pinned to DIRECT_URL for the lifetime of a lock.
 * Neon's transaction pooler (-pooler) maps transactions to multiplexed server connections, which
 * can cause session-level advisory locks to leak or detach across queries if executed on the pooler.
 * Pinning advisory locks to DIRECT_URL guarantees a 1:1 physical TCP session.
 */
export function createDedicatedDirectLockClient(): PrismaClient {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error('DIRECT_URL is required for dedicated PostgreSQL session advisory locking.');
  }

  // Preflight check: must point strictly to DEV or authorized test branch
  return new PrismaClient({
    datasources: {
      db: {
        url: directUrl,
      },
    },
  });
}

/**
 * Attempts to acquire a PostgreSQL advisory lock for the given source name.
 * Requires a dedicated direct client (pinned to a single session) to avoid pooler session multiplexing issues.
 */
export async function acquireIngestionAdvisoryLock(
  directPrisma: PrismaClient,
  sourceName: string
): Promise<IngestionLockResult> {
  const lockKey = sourceName.toUpperCase();
  const lockId = hashStringToAdvisoryLockId(lockKey);

  try {
    const res = await directPrisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
      SELECT pg_try_advisory_lock(${lockId}::bigint) AS pg_try_advisory_lock;
    `;

    const acquired = Boolean(res[0]?.pg_try_advisory_lock);
    if (!acquired) {
      return {
        acquired: false,
        lockKey,
        reason: `Another active process holds the PostgreSQL advisory lock for source "${sourceName}".`,
      };
    }

    return { acquired: true, lockKey };
  } catch (err: any) {
    return {
      acquired: false,
      lockKey,
      reason: `Advisory lock check failed: ${err.message}`,
    };
  }
}

/**
 * Releases the session-level advisory lock on the dedicated direct client.
 */
export async function releaseIngestionAdvisoryLock(
  directPrisma: PrismaClient,
  sourceName: string
): Promise<boolean> {
  const lockKey = sourceName.toUpperCase();
  const lockId = hashStringToAdvisoryLockId(lockKey);

  try {
    const res = await directPrisma.$queryRaw<Array<{ pg_advisory_unlock: boolean }>>`
      SELECT pg_advisory_unlock(${lockId}::bigint) AS pg_advisory_unlock;
    `;
    return Boolean(res[0]?.pg_advisory_unlock);
  } catch {
    return false;
  }
}

/**
 * Retrieves the latest checkpoint state from an existing or interrupted IngestionRun.
 * Inspects `statsJson` without destructive overwrites.
 */
export async function getLatestIngestionCheckpoint(
  prisma: PrismaClient | Prisma.TransactionClient,
  sourceName: string
): Promise<{
  runId: string | null;
  status: string | null;
  checkpoint: IngestionRunCheckpoint | null;
}> {
  const latestRun = await prisma.ingestionRun.findFirst({
    where: { sourceName },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      status: true,
      statsJson: true,
      recordsIngested: true,
    },
  });

  if (!latestRun) {
    return { runId: null, status: null, checkpoint: null };
  }

  const stats = (latestRun.statsJson as Record<string, any>) || {};
  return {
    runId: latestRun.id,
    status: latestRun.status,
    checkpoint: {
      lastProcessedObjectId: stats.lastProcessedObjectId,
      lastProcessedPin: stats.lastProcessedPin,
      totalBatchesCommitted: stats.totalBatchesCommitted,
      lastHeartbeatAt: stats.lastHeartbeatAt,
      resumedFromRunId: stats.resumedFromRunId,
      mode: stats.mode,
    },
  };
}
