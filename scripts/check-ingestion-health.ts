import { prisma } from '../src/lib/db';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

const AUTHORIZED_NEON_DEV_ENDPOINT = 'ep-restless-bonus-b4xv9ig1';

interface SourceHealth {
  sourceName: string;
  totalRecords: number;
  latestRunId: string | null;
  latestStatus: string | null;
  lastSuccessAt: string | null;
  hoursSinceLastSuccess: number | null;
  isStale: boolean;
  hasStuckRun: boolean;
  hasRecentFailure: boolean;
  alert: string;
}

const FRESHNESS_THRESHOLDS_HOURS: Record<string, number> = {
  OMAHA_ACCELA_CODE_ENFORCEMENT: 48,
  OMAHA_HOTLINE: 48,
  DOUGLAS_COUNTY_TAX_LIEN: 720, // 30 days
  DOUGLAS_COUNTY_ASSESSOR: 720, // 30 days
};

export async function checkIngestionHealth(): Promise<{
  allHealthy: boolean;
  sources: SourceHealth[];
}> {
  verifyNeonDevEndpoints({
    expectedEndpointId: process.env.NEON_DEV_ENDPOINT_ID || AUTHORIZED_NEON_DEV_ENDPOINT,
  });

  console.log('========================================================================');
  console.log('  DEALBEACON CLOUD INGESTION HEALTH & FRESHNESS MONITOR                ');
  console.log('========================================================================\n');

  const sourcesToCheck = [
    'OMAHA_ACCELA_CODE_ENFORCEMENT',
    'OMAHA_HOTLINE',
    'DOUGLAS_COUNTY_TAX_LIEN',
    'DOUGLAS_COUNTY_ASSESSOR',
  ];

  const now = Date.now();
  const results: SourceHealth[] = [];
  let allHealthy = true;

  for (const source of sourcesToCheck) {
    let totalRecords = 0;
    if (source === 'OMAHA_ACCELA_CODE_ENFORCEMENT') {
      totalRecords = await (prisma as any).codeViolation.count({ where: { sourceName: source } });
    } else if (source === 'OMAHA_HOTLINE') {
      totalRecords = await prisma.hotlineReport.count();
    } else if (source === 'DOUGLAS_COUNTY_TAX_LIEN') {
      totalRecords = await prisma.taxLienRecord.count();
    } else if (source === 'DOUGLAS_COUNTY_ASSESSOR') {
      totalRecords = await prisma.property.count();
    }

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

    const threshold = FRESHNESS_THRESHOLDS_HOURS[source] || 48;
    const isStale = hoursSinceLastSuccess !== null && hoursSinceLastSuccess > threshold;
    const hasStuckRun =
      latestRun?.status === 'RUNNING' &&
      now - latestRun.startedAt.getTime() > 60 * 60 * 1000;
    const hasRecentFailure = latestRun?.status === 'FAILED';

    let alert = 'OK (Healthy)';
    if (hasStuckRun) {
      alert = 'ALERT: Run stuck in RUNNING > 60m';
      allHealthy = false;
    } else if (hasRecentFailure) {
      alert = 'ALERT: Latest run FAILED';
      allHealthy = false;
    } else if (isStale) {
      alert = `WARNING: Stale (${hoursSinceLastSuccess}h > ${threshold}h)`;
      allHealthy = false;
    }

    results.push({
      sourceName: source,
      totalRecords,
      latestRunId: latestRun?.id || null,
      latestStatus: latestRun?.status || null,
      lastSuccessAt: lastSuccessRun?.completedAt?.toISOString() || null,
      hoursSinceLastSuccess,
      isStale,
      hasStuckRun,
      hasRecentFailure,
      alert,
    });
  }

  console.table(
    results.map((r) => ({
      Source: r.sourceName,
      Records: r.totalRecords,
      'Latest Status': r.latestStatus || 'NONE',
      'Hours Ago': r.hoursSinceLastSuccess ?? 'N/A',
      Health: r.alert,
    }))
  );

  return { allHealthy, sources: results };
}

if (require.main === module) {
  checkIngestionHealth()
    .then(({ allHealthy }) => {
      if (!allHealthy) {
        console.warn('⚠ One or more sources require attention.');
      } else {
        console.log('✔ All ingestion sources are healthy and fresh.');
      }
    })
    .catch((err) => {
      console.error('Fatal health check error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
