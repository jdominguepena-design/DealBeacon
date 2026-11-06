import assert from 'node:assert';
import {
  checkIngestionHealth,
  FRESHNESS_THRESHOLDS_HOURS,
  evaluatePipelineHealth,
  evaluateUpstreamFreshness,
} from '../../../../scripts/check-ingestion-health';

async function runHealthMonitorTests() {
  console.log('========================================================================');
  console.log('  INGESTION HEALTH & FRESHNESS MONITOR UNIT TEST SUITE                  ');
  console.log('========================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------------
  // Test 1: Source Registry Completeness & Cadence Thresholds
  // -------------------------------------------------------------------------
  const expectedSources = [
    'OMAHA_CODE_VIOLATIONS_ACTIVE',
    'OMAHA_ACCELA_CODE_ENFORCEMENT',
    'OMAHA_HOTLINE',
    'DOUGLAS_COUNTY_TAX_LIEN',
    'DOUGLAS_COUNTY_ASSESSOR',
  ];

  for (const s of expectedSources) {
    assert(s in FRESHNESS_THRESHOLDS_HOURS, `Source ${s} must have a defined freshness threshold`);
  }
  assert.strictEqual(FRESHNESS_THRESHOLDS_HOURS.OMAHA_CODE_VIOLATIONS_ACTIVE, 48, 'Active code violations threshold must be 48h');
  assert.strictEqual(FRESHNESS_THRESHOLDS_HOURS.OMAHA_HOTLINE, 168, 'Hotline threshold must be 168h (7 days)');
  assert.strictEqual(FRESHNESS_THRESHOLDS_HOURS.DOUGLAS_COUNTY_TAX_LIEN, 720, 'Tax lien threshold must be 720h (30 days)');
  assert.strictEqual(FRESHNESS_THRESHOLDS_HOURS.DOUGLAS_COUNTY_ASSESSOR, 720, 'County Assessor threshold must be 720h (30 days)');
  passed++;
  console.log('✔ PASS 1: All 5 municipal data sources are registered with appropriate operational cadence thresholds');

  // -------------------------------------------------------------------------
  // Test 2: Active Code Violations Full Domain Count Representation
  // -------------------------------------------------------------------------
  const { sources } = await checkIngestionHealth({ skipPreflight: true });
  const activeSource = sources.find((s) => s.sourceName === 'OMAHA_CODE_VIOLATIONS_ACTIVE');

  assert(activeSource, 'OMAHA_CODE_VIOLATIONS_ACTIVE must be present in health check results');
  assert.strictEqual(activeSource.totalSourceRecords, 1175, 'Active source must report 1,175 raw source records');
  assert.strictEqual(
    activeSource.totalDomainRecords,
    1175,
    'Active source must represent all 1,175 domain cases (including 245 historical overlap cases)'
  );
  assert.strictEqual(activeSource.linkedCount, 1170, 'Active source must report 1,170 linked cases');
  assert.strictEqual(activeSource.unmatchedCount, 5, 'Active source must report 5 unmatched cases');
  passed++;
  console.log('✔ PASS 2: Active source metrics accurately reflect all 1,175 active cases across both source layers');

  // -------------------------------------------------------------------------
  // Test 3: Distinction Between Pipeline Sync and Upstream Data Freshness
  // -------------------------------------------------------------------------
  // Verify database record flags stagnant municipal dataset independently
  assert(activeSource.hoursSinceLastSuccess !== null, 'Pipeline sync timestamp must be recorded');
  assert.strictEqual(activeSource.upstreamDataFreshness, 'STAGNANT', 'Upstream data must reflect stagnant publisher data');
  assert(activeSource.upstreamStatusMessage.includes('WARNING: Stagnant'), 'Must include explicit stagnant warning');
  assert(activeSource.daysSinceUpstreamUpdate !== null && activeSource.daysSinceUpstreamUpdate > 60, 'Days since upstream update must reflect true municipal date');

  // Unit verification: fresh pipeline sync with stagnant upstream dataset
  const testNow = 1730000000000;
  const mockHealthyPipeline = evaluatePipelineHealth({
    source: 'OMAHA_CODE_VIOLATIONS_ACTIVE',
    latestRun: { id: 'run-fresh', status: 'SUCCESS', startedAt: new Date(testNow - 2 * 3600 * 1000) },
    lastSuccessRun: { id: 'run-fresh', completedAt: new Date(testNow - 2 * 3600 * 1000) },
    now: testNow,
  });
  const mockStagnantUpstream = evaluateUpstreamFreshness({
    source: 'OMAHA_CODE_VIOLATIONS_ACTIVE',
    latestUpstreamUpdateAt: new Date(testNow - 95 * 86400 * 1000),
    now: testNow,
  });

  assert.strictEqual(mockHealthyPipeline.pipelineHealth, 'HEALTHY', 'Pipeline sync within 48h must report HEALTHY');
  assert.strictEqual(mockStagnantUpstream.upstreamDataFreshness, 'STAGNANT', 'Upstream dataset > 30d must report STAGNANT');
  assert(mockStagnantUpstream.upstreamStatusMessage.includes('WARNING: Stagnant'), 'Stagnant dataset must emit warning message');
  passed++;
  console.log('✔ PASS 3: Health monitor distinguishes pipeline sync freshness from upstream publisher data age');

  // -------------------------------------------------------------------------
  // Test 4: Detection of Stale Datasets (Omaha Hotline)
  // -------------------------------------------------------------------------
  const hotlineSource = sources.find((s) => s.sourceName === 'OMAHA_HOTLINE');
  assert(hotlineSource, 'OMAHA_HOTLINE must be present in health check results');
  assert.strictEqual(hotlineSource.pipelineHealth, 'STALE', 'Hotline pipeline must be detected as STALE (> 168h)');
  assert(hotlineSource.alert.includes('WARNING: Ingestion Stale'), 'Alert message must flag stale ingestion');
  passed++;
  console.log('✔ PASS 4: Health monitor reliably detects stale pipeline synchronization');

  // -------------------------------------------------------------------------
  // Test 5: Historical Accela Baseline Stability
  // -------------------------------------------------------------------------
  const histSource = sources.find((s) => s.sourceName === 'OMAHA_ACCELA_CODE_ENFORCEMENT');
  assert(histSource, 'OMAHA_ACCELA_CODE_ENFORCEMENT must be present in health check results');
  assert.strictEqual(histSource.totalSourceRecords, 12153, 'Historical source must maintain exactly 12,153 source records');
  assert.strictEqual(histSource.totalDomainRecords, 12153, 'Historical source must maintain exactly 12,153 domain records');
  assert.strictEqual(histSource.pipelineHealth, 'HEALTHY', 'Historical source within annual baseline threshold must be HEALTHY');
  assert.strictEqual(histSource.upstreamDataFreshness, 'STATIC_BASELINE', 'Historical source must be flagged as static baseline');
  passed++;
  console.log('✔ PASS 5: Historical Accela baseline maintains stable record counts and appropriate baseline threshold');

  // -------------------------------------------------------------------------
  // Test 6: Precedence of Failure and Stuck Alerting Over Recent Success
  // -------------------------------------------------------------------------
  const mockNow = Date.now();
  const recentSuccess = { id: 'run-success-prev', completedAt: new Date(mockNow - 5 * 60 * 1000) }; // 5 min ago

  // Case A: Recent success, but latest run FAILED
  const failedEval = evaluatePipelineHealth({
    source: 'OMAHA_CODE_VIOLATIONS_ACTIVE',
    latestRun: { id: 'run-fail-1', status: 'FAILED', startedAt: new Date(mockNow - 60000) },
    lastSuccessRun: recentSuccess,
    now: mockNow,
  });
  assert.strictEqual(failedEval.pipelineHealth, 'FAILED', 'Failed run must take precedence over recent success');
  assert.strictEqual(failedEval.alert, 'ALERT: Latest run FAILED (run-fail-1)');

  // Case B: Recent success, but latest run STUCK in RUNNING > 60m
  const stuckEval = evaluatePipelineHealth({
    source: 'OMAHA_CODE_VIOLATIONS_ACTIVE',
    latestRun: { id: 'run-stuck-1', status: 'RUNNING', startedAt: new Date(mockNow - 90 * 60 * 1000) },
    lastSuccessRun: recentSuccess,
    now: mockNow,
  });
  assert.strictEqual(stuckEval.pipelineHealth, 'STUCK', 'Run in RUNNING > 60m must take precedence over recent success');
  assert.strictEqual(stuckEval.alert, 'ALERT: Run stuck in RUNNING > 60m');

  // Case C: No prior runs
  const noRunsEval = evaluatePipelineHealth({
    source: 'OMAHA_CODE_VIOLATIONS_ACTIVE',
    latestRun: null,
    lastSuccessRun: null,
    now: mockNow,
  });
  assert.strictEqual(noRunsEval.pipelineHealth, 'NO_RUNS');
  assert.strictEqual(noRunsEval.alert, 'NOTICE: No IngestionRuns recorded');

  passed++;
  console.log('✔ PASS 6: Failed or stuck run detection takes precedence over prior successful runs');

  console.log('\n========================================================================');
  console.log(`  ALL ${passed} INGESTION HEALTH MONITOR UNIT TESTS PASSED!`);
  console.log('========================================================================\n');
}

runHealthMonitorTests().catch((err) => {
  console.error('Health monitor test failed:', err);
  process.exit(1);
});
