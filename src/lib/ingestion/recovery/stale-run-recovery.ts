/**
 * DealBeacon — Safe Stale IngestionRun Recovery Process.
 *
 * Rules:
 * 1. Never classify an interrupted run as SUCCESS unless its completion is independently verified.
 * 2. Preserve original timestamps (startedAt) and existing audit evidence.
 * 3. Record interrupted runs with valid existing schema values: 'PARTIAL' (if child records exist)
 *    or 'FAILED' (if 0 child records exist).
 * 4. Idempotent: only acts on records with status === 'RUNNING'; repeated execution is safe.
 * 5. Dry-run plan inspects state and provides exact proposed changes before applying.
 */

import { PrismaClient, IngestionStatus } from '@prisma/client';

export interface StaleRunDetailPlan {
  runId: string;
  sourceName: string;
  startedAt: Date;
  currentStatus: IngestionStatus;
  currentRecordsIngested: number;
  currentCompletedAt: Date | null;
  verifiedSourceRecordsCount: number;
  latestSourceRecordTimestamp: Date | null;
  proposedStatus: IngestionStatus;
  proposedRecordsIngested: number;
  proposedCompletedAt: Date;
  proposedStatsJson: Record<string, any>;
  proposedErrorsJson: string[];
}

export interface StaleRunRecoveryPlan {
  inspectedAt: string;
  totalStaleRunsFound: number;
  plans: StaleRunDetailPlan[];
}

export interface StaleRunExecutionResult {
  executedAt: string;
  runsReconciled: number;
  runsSkipped: number;
  details: Array<{
    runId: string;
    previousStatus: IngestionStatus;
    newStatus: IngestionStatus;
    recordsIngested: number;
    completedAt: Date;
  }>;
}

/**
 * Inspects all IngestionRun records currently in RUNNING state and computes
 * an exact proposed reconciliation plan without modifying any database records.
 */
export async function planStaleRunRecovery(
  prisma: PrismaClient,
  options: { maxAgeMinutes?: number } = {}
): Promise<StaleRunRecoveryPlan> {
  const maxAgeMinutes = options.maxAgeMinutes ?? 0;
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  const staleRuns = await prisma.ingestionRun.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lte: cutoff },
    },
    orderBy: { startedAt: 'asc' },
  });

  const plans: StaleRunDetailPlan[] = [];

  for (const run of staleRuns) {
    // Independently query child SourceRecords linked to this run
    const sourceRecords = await prisma.sourceRecord.findMany({
      where: { ingestionRunId: run.id },
      select: { id: true, ingestedAt: true },
      orderBy: { ingestedAt: 'desc' },
    });

    const verifiedCount = sourceRecords.length;
    const latestTimestamp = sourceRecords.length > 0 ? sourceRecords[0].ingestedAt : null;

    // Determine safe status: PARTIAL if records were saved before crash, FAILED if 0
    const proposedStatus: IngestionStatus = verifiedCount > 0 ? 'PARTIAL' : 'FAILED';
    const proposedRecordsIngested = verifiedCount;
    const proposedCompletedAt = latestTimestamp || run.startedAt;

    // Preserve existing stats and error payloads, appending recovery metadata
    const existingStats = (run.statsJson && typeof run.statsJson === 'object' && !Array.isArray(run.statsJson))
      ? (run.statsJson as Record<string, any>)
      : {};

    const existingErrors = Array.isArray(run.errorsJson)
      ? (run.errorsJson as string[])
      : run.errorsJson
      ? [String(run.errorsJson)]
      : [];

    const proposedStatsJson: Record<string, any> = {
      ...existingStats,
      reconciliation: {
        reconciledAt: new Date().toISOString(),
        reason: 'Process terminated unexpectedly before clean shutdown; reconciled via Phase 2A recovery',
        completedAtBasis: 'Reconciled terminal timestamp based on latest verified linked record (not a naturally completed import)',
        verifiedSourceRecordsCount: verifiedCount,
        previousRecordsIngested: run.recordsIngested,
      },
    };

    const recoveryMessage =
      proposedStatus === 'PARTIAL'
        ? `Run terminated prematurely before natural completion. Reconciled to PARTIAL with ${verifiedCount} verified source record(s).`
        : 'Run terminated prematurely before processing any records. Reconciled to FAILED.';

    const proposedErrorsJson = [...existingErrors, recoveryMessage];

    plans.push({
      runId: run.id,
      sourceName: run.sourceName,
      startedAt: run.startedAt,
      currentStatus: run.status,
      currentRecordsIngested: run.recordsIngested,
      currentCompletedAt: run.completedAt,
      verifiedSourceRecordsCount: verifiedCount,
      latestSourceRecordTimestamp: latestTimestamp,
      proposedStatus,
      proposedRecordsIngested,
      proposedCompletedAt,
      proposedStatsJson,
      proposedErrorsJson,
    });
  }

  return {
    inspectedAt: new Date().toISOString(),
    totalStaleRunsFound: plans.length,
    plans,
  };
}

/**
 * Applies a pre-calculated recovery plan.
 * Idempotent: validates that each record is still in RUNNING state before modifying.
 */
export async function executeStaleRunRecovery(
  prisma: PrismaClient,
  plan: StaleRunRecoveryPlan
): Promise<StaleRunExecutionResult> {
  const result: StaleRunExecutionResult = {
    executedAt: new Date().toISOString(),
    runsReconciled: 0,
    runsSkipped: 0,
    details: [],
  };

  for (const item of plan.plans) {
    // Check if the run is still in RUNNING state (idempotency guard)
    const current = await prisma.ingestionRun.findUnique({
      where: { id: item.runId },
    });

    if (!current || current.status !== 'RUNNING') {
      result.runsSkipped++;
      continue;
    }

    await prisma.ingestionRun.update({
      where: { id: item.runId },
      data: {
        status: item.proposedStatus,
        recordsIngested: item.proposedRecordsIngested,
        completedAt: item.proposedCompletedAt,
        statsJson: item.proposedStatsJson,
        errorsJson: item.proposedErrorsJson,
      },
    });

    result.runsReconciled++;
    result.details.push({
      runId: item.runId,
      previousStatus: current.status,
      newStatus: item.proposedStatus,
      recordsIngested: item.proposedRecordsIngested,
      completedAt: item.proposedCompletedAt,
    });
  }

  return result;
}
