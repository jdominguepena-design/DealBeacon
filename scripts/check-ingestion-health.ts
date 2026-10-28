import { prisma } from '../src/lib/db';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

const AUTHORIZED_NEON_DEV_ENDPOINT = 'ep-restless-bonus-b4xv9ig1';

export interface SourceHealthMetrics {
  sourceName: string;
  displayName: string;
  totalSourceRecords: number;
  totalDomainRecords: number;
  linkedCount: number;
  unmatchedCount: number;
  latestRunId: string | null;
  latestStatus: string | null;
  lastSuccessAt: string | null;
  hoursSinceLastSuccess: number | null;
  latestUpstreamUpdateAt: string | null;
  daysSinceUpstreamUpdate: number | null;
  pipelineHealth: 'HEALTHY' | 'STALE' | 'FAILED' | 'STUCK' | 'NO_RUNS';
  upstreamDataFreshness: 'FRESH' | 'STAGNANT' | 'STATIC_BASELINE' | 'UNKNOWN';
  upstreamStatusMessage: string;
  cadenceRecommendation: string;
  alert: string;
}

export const FRESHNESS_THRESHOLDS_HOURS: Record<string, number> = {
  OMAHA_CODE_VIOLATIONS_ACTIVE: 48,      // Daily active full snapshot
  OMAHA_ACCELA_CODE_ENFORCEMENT: 8760,   // Static historical 2024 extract (1 year baseline)
  OMAHA_HOTLINE: 168,                    // Weekly public complaints refresh (7 days)
  DOUGLAS_COUNTY_TAX_LIEN: 720,          // Monthly tax sale delinquency roll (30 days)
  DOUGLAS_COUNTY_ASSESSOR: 720,          // Monthly countywide GIS parcel refresh (30 days)
};

export async function checkIngestionHealth(options: { skipPreflight?: boolean } = {}): Promise<{
  allHealthy: boolean;
  sources: SourceHealthMetrics[];
}> {
  if (!options.skipPreflight) {
    verifyNeonDevEndpoints({
      expectedEndpointId: process.env.NEON_DEV_ENDPOINT_ID || AUTHORIZED_NEON_DEV_ENDPOINT,
    });
  }

  console.log('===================================================================================================================');
  console.log('  DEALBEACON CLOUD INGESTION HEALTH, FRESHNESS & CADENCE MONITOR                                                   ');
  console.log('===================================================================================================================\n');

  const sourcesToCheck = [
    'OMAHA_CODE_VIOLATIONS_ACTIVE',
    'OMAHA_ACCELA_CODE_ENFORCEMENT',
    'OMAHA_HOTLINE',
    'DOUGLAS_COUNTY_TAX_LIEN',
    'DOUGLAS_COUNTY_ASSESSOR',
  ];

  const now = Date.now();
  const results: SourceHealthMetrics[] = [];
  let allHealthy = true;

  for (const source of sourcesToCheck) {
    let displayName = source;
    let totalSourceRecords = 0;
    let totalDomainRecords = 0;
    let linkedCount = 0;
    let unmatchedCount = 0;
    let latestUpstreamUpdateAt: Date | null = null;
    let cadenceRecommendation = '';

    // 1. Source-specific counts and upstream timestamps
    if (source === 'OMAHA_CODE_VIOLATIONS_ACTIVE') {
      displayName = 'Active Code Violations';
      cadenceRecommendation = 'Daily Full Snapshot (24-48h threshold)';
      totalSourceRecords = await prisma.sourceRecord.count({ where: { sourceName: source } });

      // Represents all 1,175 active cases, including the 245 cases whose CodeViolation.sourceName remains historical
      const activeViolations = await prisma.codeViolation.findMany({
        where: {
          latestSourceRecord: { sourceName: source },
        },
        select: {
          id: true,
          propertyId: true,
          lastUpdatedSource: true,
        },
      });

      totalDomainRecords = activeViolations.length;
      linkedCount = activeViolations.filter((v) => v.propertyId !== null).length;
      unmatchedCount = activeViolations.filter((v) => v.propertyId === null).length;

      for (const v of activeViolations) {
        if (v.lastUpdatedSource) {
          if (!latestUpstreamUpdateAt || v.lastUpdatedSource > latestUpstreamUpdateAt) {
            latestUpstreamUpdateAt = v.lastUpdatedSource;
          }
        }
      }
    } else if (source === 'OMAHA_ACCELA_CODE_ENFORCEMENT') {
      displayName = 'Historical Accela (2024)';
      cadenceRecommendation = 'Static Baseline (No recurring polling required)';
      totalSourceRecords = await prisma.sourceRecord.count({ where: { sourceName: source } });
      totalDomainRecords = await (prisma as any).codeViolation.count({ where: { sourceName: source } });

      const linked = await (prisma as any).codeViolation.count({
        where: { sourceName: source, propertyId: { not: null } },
      });
      const unmatched = await (prisma as any).codeViolation.count({
        where: { sourceName: source, propertyId: null },
      });
      linkedCount = linked;
      unmatchedCount = unmatched;

      const maxUpdated = await (prisma as any).codeViolation.aggregate({
        where: { sourceName: source },
        _max: { lastUpdatedSource: true },
      });
      latestUpstreamUpdateAt = maxUpdated._max?.lastUpdatedSource || null;
    } else if (source === 'OMAHA_HOTLINE') {
      displayName = "Mayor's Hotline (Complaints)";
      cadenceRecommendation = 'Weekly Incremental Sync (168h threshold)';
      totalSourceRecords = await prisma.sourceRecord.count({ where: { sourceName: source } });
      totalDomainRecords = await prisma.hotlineReport.count();

      linkedCount = await prisma.hotlineReport.count({ where: { propertyId: { not: null } } });
      unmatchedCount = await prisma.hotlineReport.count({ where: { propertyId: null } });

      const maxReport = await prisma.hotlineReport.aggregate({
        _max: { sourceEditedAt: true, sourceCreatedAt: true },
      });
      latestUpstreamUpdateAt = maxReport._max?.sourceEditedAt || maxReport._max?.sourceCreatedAt || null;
    } else if (source === 'DOUGLAS_COUNTY_TAX_LIEN') {
      displayName = 'Tax Delinquencies & Liens';
      cadenceRecommendation = 'Monthly Ingestion (720h / 30-day threshold)';
      totalSourceRecords = await prisma.sourceRecord.count({ where: { sourceName: source } });
      totalDomainRecords = await prisma.taxLienRecord.count();

      linkedCount = await prisma.taxLienRecord.count({ where: { propertyId: { not: null } } });
      unmatchedCount = await prisma.taxLienRecord.count({ where: { propertyId: null } });

      const maxTax = await prisma.taxLienRecord.aggregate({
        _max: { lastObservedAt: true },
      });
      latestUpstreamUpdateAt = maxTax._max?.lastObservedAt || null;
    } else if (source === 'DOUGLAS_COUNTY_ASSESSOR') {
      displayName = 'County Assessor Parcels';
      cadenceRecommendation = 'Monthly Refresh (720h / 30-day threshold)';
      totalSourceRecords = await prisma.sourceRecord.count({ where: { sourceName: source } });
      totalDomainRecords = await prisma.property.count();
      linkedCount = totalDomainRecords; // All Property records are canonical
      unmatchedCount = 0;

      const maxProp = await prisma.property.aggregate({
        _max: { updatedAt: true },
      });
      latestUpstreamUpdateAt = maxProp._max?.updatedAt || null;
    }

    // 2. IngestionRun Lifecycle Metrics
    const latestRun = await prisma.ingestionRun.findFirst({
      where: { sourceName: source },
      orderBy: { startedAt: 'desc' },
    });

    const lastSuccessRun = await prisma.ingestionRun.findFirst({
      where: { sourceName: source, status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
    });

    let hoursSinceLastSuccess: number | null = null;
    if (lastSuccessRun?.completedAt) {
      hoursSinceLastSuccess = parseFloat(
        ((now - lastSuccessRun.completedAt.getTime()) / (1000 * 60 * 60)).toFixed(1)
      );
    }

    let daysSinceUpstreamUpdate: number | null = null;
    if (latestUpstreamUpdateAt) {
      daysSinceUpstreamUpdate = parseFloat(
        ((now - latestUpstreamUpdateAt.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
      );
    }

    // 3. Independent Evaluation: Pipeline Status vs. Upstream Publisher Freshness
    const threshold = FRESHNESS_THRESHOLDS_HOURS[source] || 48;
    const isStale = hoursSinceLastSuccess !== null && hoursSinceLastSuccess > threshold;
    const hasStuckRun =
      latestRun?.status === 'RUNNING' && now - latestRun.startedAt.getTime() > 60 * 60 * 1000;
    const hasRecentFailure = latestRun?.status === 'FAILED';

    let pipelineHealth: SourceHealthMetrics['pipelineHealth'] = 'HEALTHY';
    let alert = 'OK (Healthy)';

    // Failures and stuck runs override any previous success timestamp
    if (hasStuckRun) {
      pipelineHealth = 'STUCK';
      alert = 'ALERT: Run stuck in RUNNING > 60m';
      allHealthy = false;
    } else if (hasRecentFailure) {
      pipelineHealth = 'FAILED';
      alert = `ALERT: Latest run FAILED (${latestRun?.id})`;
      allHealthy = false;
    } else if (isStale) {
      pipelineHealth = 'STALE';
      alert = `WARNING: Ingestion Stale (${hoursSinceLastSuccess}h > ${threshold}h)`;
      allHealthy = false;
    } else if (!latestRun) {
      pipelineHealth = 'NO_RUNS';
      alert = 'NOTICE: No IngestionRuns recorded';
    }

    // Upstream publisher evaluation (reported independently of pipeline health)
    let upstreamDataFreshness: SourceHealthMetrics['upstreamDataFreshness'] = 'UNKNOWN';
    let upstreamStatusMessage = 'Unknown publisher state';

    if (source === 'OMAHA_ACCELA_CODE_ENFORCEMENT') {
      upstreamDataFreshness = 'STATIC_BASELINE';
      upstreamStatusMessage = 'Static 2024 Baseline (Final extract)';
    } else if (daysSinceUpstreamUpdate !== null) {
      if (daysSinceUpstreamUpdate <= 7) {
        upstreamDataFreshness = 'FRESH';
        upstreamStatusMessage = `Fresh (updated ${daysSinceUpstreamUpdate}d ago)`;
      } else if (daysSinceUpstreamUpdate > 30) {
        upstreamDataFreshness = 'STAGNANT';
        upstreamStatusMessage = `WARNING: Stagnant (${daysSinceUpstreamUpdate}d without publisher update)`;
      } else {
        upstreamDataFreshness = 'FRESH';
        upstreamStatusMessage = `Current (${daysSinceUpstreamUpdate}d ago)`;
      }
    }

    results.push({
      sourceName: source,
      displayName,
      totalSourceRecords,
      totalDomainRecords,
      linkedCount,
      unmatchedCount,
      latestRunId: latestRun?.id || null,
      latestStatus: latestRun?.status || null,
      lastSuccessAt: lastSuccessRun?.completedAt?.toISOString() || null,
      hoursSinceLastSuccess,
      latestUpstreamUpdateAt: latestUpstreamUpdateAt?.toISOString() || null,
      daysSinceUpstreamUpdate,
      pipelineHealth,
      upstreamDataFreshness,
      upstreamStatusMessage,
      cadenceRecommendation,
      alert,
    });
  }

  // Formatted Console Reporting Table
  console.table(
    results.map((r) => ({
      Source: r.displayName,
      'Source Records': r.totalSourceRecords,
      'Domain Records': r.totalDomainRecords,
      Linked: r.linkedCount,
      Unmatched: r.unmatchedCount,
      'Pipeline Sync': r.hoursSinceLastSuccess !== null ? `${r.hoursSinceLastSuccess}h ago` : 'N/A',
      'Pipeline Health': r.alert,
      'Publisher Date': r.latestUpstreamUpdateAt ? r.latestUpstreamUpdateAt.split('T')[0] : 'N/A',
      'Publisher Freshness': r.upstreamStatusMessage,
    }))
  );

  return { allHealthy, sources: results };
}

if (require.main === module) {
  checkIngestionHealth()
    .then(({ allHealthy }) => {
      if (!allHealthy) {
        console.warn('\n⚠ One or more sources require operational attention.');
      } else {
        console.log('\n✔ All active ingestion pipelines are healthy and meeting freshness SLAs.');
      }
    })
    .catch((err) => {
      console.error('Fatal health check error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
