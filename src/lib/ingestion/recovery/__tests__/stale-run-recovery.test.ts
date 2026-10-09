import { planStaleRunRecovery, executeStaleRunRecovery } from '../stale-run-recovery';
import { IngestionStatus } from '@prisma/client';

function runStaleRunRecoveryTests() {
  console.log('--- STALE INGESTION RUN RECOVERY UNIT TESTS ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✔ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✘ FAIL: ${name}`);
      if (detail) console.error(`     Detail: ${detail}`);
    }
  }

  // Simulated in-memory database store
  const testRuns: Array<{
    id: string;
    sourceName: string;
    startedAt: Date;
    completedAt: Date | null;
    status: IngestionStatus;
    recordsIngested: number;
    signalsCreated: number;
    statsJson: any;
    errorsJson: any;
  }> = [
    {
      id: 'run-zero-records',
      sourceName: 'OMAHA_HOTLINE',
      startedAt: new Date('2026-10-09T01:00:00.000Z'),
      completedAt: null,
      status: 'RUNNING',
      recordsIngested: 0,
      signalsCreated: 0,
      statsJson: null,
      errorsJson: null,
    },
    {
      id: 'run-with-records',
      sourceName: 'OMAHA_HOTLINE',
      startedAt: new Date('2026-10-09T01:30:00.000Z'),
      completedAt: null,
      status: 'RUNNING',
      recordsIngested: 0,
      signalsCreated: 0,
      statsJson: { existingFlag: true },
      errorsJson: ['Early network timeout warning'],
    },
    {
      id: 'run-already-completed',
      sourceName: 'OMAHA_HOTLINE',
      startedAt: new Date('2026-10-09T00:00:00.000Z'),
      completedAt: new Date('2026-10-09T00:05:00.000Z'),
      status: 'SUCCESS',
      recordsIngested: 23,
      signalsCreated: 0,
      statsJson: {},
      errorsJson: null,
    },
  ];

  const testSourceRecords: Array<{
    id: string;
    ingestionRunId: string | null;
    ingestedAt: Date;
  }> = [
    {
      id: 'src-1',
      ingestionRunId: 'run-with-records',
      ingestedAt: new Date('2026-10-09T01:32:00.000Z'),
    },
    {
      id: 'src-2',
      ingestionRunId: 'run-with-records',
      ingestedAt: new Date('2026-10-09T01:35:00.000Z'),
    },
  ];

  // Mock Prisma client adhering to exact interface used in stale-run-recovery
  const mockPrisma: any = {
    ingestionRun: {
      findMany: async ({ where }: any) => {
        return testRuns.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          return true;
        });
      },
      findUnique: async ({ where }: any) => {
        return testRuns.find((r) => r.id === where.id) || null;
      },
      update: async ({ where, data }: any) => {
        const item = testRuns.find((r) => r.id === where.id);
        if (!item) throw new Error('Not found');
        Object.assign(item, data);
        return item;
      },
    },
    sourceRecord: {
      findMany: async ({ where, orderBy }: any) => {
        let records = testSourceRecords.filter((s) => s.ingestionRunId === where.ingestionRunId);
        if (orderBy?.ingestedAt === 'desc') {
          records = [...records].sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime());
        }
        return records;
      },
    },
  };

  async function executeTests() {
    // Test 1: Plan ignores already completed runs
    const plan = await planStaleRunRecovery(mockPrisma);
    assert(plan.totalStaleRunsFound === 2, 'Finds exactly the 2 RUNNING runs and ignores SUCCESS');

    const planZero = plan.plans.find((p) => p.runId === 'run-zero-records')!;
    const planRecords = plan.plans.find((p) => p.runId === 'run-with-records')!;

    // Test 2: Interrupted run with 0 records plans FAILED
    assert(planZero.proposedStatus === 'FAILED', 'Interrupted run with 0 records plans FAILED');
    assert(planZero.proposedRecordsIngested === 0, 'Records ingested is 0');
    assert(planZero.proposedCompletedAt.toISOString() === planZero.startedAt.toISOString(), 'Completed at falls back to startedAt');

    // Test 3: Interrupted run with records plans PARTIAL (never SUCCESS)
    assert(planRecords.proposedStatus === 'PARTIAL', 'Interrupted run with records plans PARTIAL (never SUCCESS)');
    assert(planRecords.proposedRecordsIngested === 2, 'Records ingested matches independently verified source record count');
    assert(planRecords.proposedCompletedAt.toISOString() === '2026-10-09T01:35:00.000Z', 'CompletedAt reflects latest verified child record timestamp');

    // Test 4: Preserves original audit evidence
    assert(planRecords.proposedStatsJson.existingFlag === true, 'Preserves existing statsJson fields');
    assert(planRecords.proposedStatsJson.reconciliation !== undefined, 'Includes reconciliation audit metadata');
    assert(planRecords.proposedErrorsJson.includes('Early network timeout warning'), 'Preserves existing errorsJson');
    assert(planRecords.proposedErrorsJson.some((e) => e.includes('PARTIAL')), 'Appends recovery note to errors');

    // Test 5: Execution updates records accurately
    const execResult = await executeStaleRunRecovery(mockPrisma, plan);
    assert(execResult.runsReconciled === 2, 'Executes reconciliation on both runs');
    assert(execResult.runsSkipped === 0, 'Zero runs skipped on first execution');

    const updatedZero = testRuns.find((r) => r.id === 'run-zero-records')!;
    const updatedRecords = testRuns.find((r) => r.id === 'run-with-records')!;
    assert(updatedZero.status === 'FAILED', 'Database status updated to FAILED');
    assert(updatedRecords.status === 'PARTIAL', 'Database status updated to PARTIAL');
    assert(updatedRecords.recordsIngested === 2, 'Database recordsIngested updated to 2');

    // Test 6: Idempotency on repeated execution
    const repeatedPlan = await planStaleRunRecovery(mockPrisma);
    assert(repeatedPlan.totalStaleRunsFound === 0, 'Subsequent plan finds 0 stale runs');

    const reExecution = await executeStaleRunRecovery(mockPrisma, plan);
    assert(reExecution.runsReconciled === 0, 'Re-executing with original plan reconciles 0 runs');
    assert(reExecution.runsSkipped === 2, 'Skips runs that are no longer in RUNNING state');

    console.log(`\nSTALE RUN RECOVERY TEST RESULT: ${passed}/${total} passed\n`);
    if (passed !== total) process.exit(1);
  }

  executeTests().catch((e) => {
    console.error('Test execution threw:', e);
    process.exit(1);
  });
}

runStaleRunRecoveryTests();
