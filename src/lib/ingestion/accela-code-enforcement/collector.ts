import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db';
import {
  acquireIngestionAdvisoryLock,
  releaseIngestionAdvisoryLock,
  createDedicatedDirectLockClient,
} from '../coordinator';
import {
  AccelaRawFeature,
  AccelaCollectorOptions,
  AccelaCollectorResult,
} from './types';
import { classifyEnforcementStage, parseAccelaDate } from './normalize';

const ACCELA_FEATURE_SERVER_URL =
  'https://dcgis.org/server/rest/services/Hosted/Accela_Planning_Layers_view/FeatureServer/2/query';

const SOURCE_NAME = 'OMAHA_ACCELA_CODE_ENFORCEMENT';

async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json && json.error) {
          throw new Error(`ArcGIS Server Error ${json.error.code}: ${json.error.message}`);
        }
        return json;
      }
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP Server Error ${res.status}`);
      }
      throw new Error(`HTTP Error ${res.status}`);
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
      console.warn(
        `[Retry] Fetch failed (${err.message}). Retrying in ${delay.toFixed(0)}ms (attempt ${attempt}/${maxRetries})...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function formatArcGisTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `TIMESTAMP '${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}'`;
}

/**
 * Determines the cutoff date for incremental synchronization.
 * Checks the latest successful IngestionRun for OMAHA_ACCELA_CODE_ENFORCEMENT.
 * Uses a 24-hour safety overlap buffer to guarantee no near-boundary upstream edits are missed.
 */
export async function getIncrementalCutoffDate(
  prisma: PrismaClient,
  fallbackDays: number = 2
): Promise<Date> {
  const lastSuccess = await prisma.ingestionRun.findFirst({
    where: {
      sourceName: SOURCE_NAME,
      status: 'SUCCESS',
    },
    orderBy: { startedAt: 'desc' },
  });

  if (lastSuccess?.startedAt) {
    // 24-hour lookback buffer before the last successful run's start time
    const bufferMs = 24 * 60 * 60 * 1000;
    return new Date(lastSuccess.startedAt.getTime() - bufferMs);
  }

  // Fallback if no prior successful run is recorded
  const fallbackMs = fallbackDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - fallbackMs);
}

/**
 * Core collector orchestrator for Omaha Accela Code Enforcement cases.
 * Supports:
 * - Incremental sync (default, queries lastupdated >= cutoff)
 * - Full reconciliation (pages through 1=1)
 * - Advisory locking to prevent concurrent collector runs
 * - Tracked IngestionRun lifecycle (RUNNING -> SUCCESS | FAILED)
 * - Safe exact 10-digit PIN matching
 * - Complete source payload preservation in SourceRecord
 */
export async function runAccelaCollector(
  options: AccelaCollectorOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<AccelaCollectorResult> {
  const mode = options.mode ?? 'incremental';
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? 500;
  const maxRecords = options.maxRecords ?? 50000;
  let offset = options.offset ?? 0;

  const startTime = Date.now();
  const runId = `run-accela-${Date.now()}`;

  console.log('========================================================================');
  console.log(`  ACCELA CODE ENFORCEMENT AUTOMATED COLLECTOR`);
  console.log(`  Mode: ${mode.toUpperCase()} | Dry Run: ${dryRun ? 'YES (0 writes)' : 'NO (live writes)'}`);
  console.log('========================================================================\n');

  // 1. Concurrency Protection via Session-Level Advisory Lock
  let directClient: PrismaClient | null = null;
  let lockAcquired = false;

  if (process.env.DIRECT_URL) {
    try {
      directClient = createDedicatedDirectLockClient();
      const lockRes = await acquireIngestionAdvisoryLock(directClient, SOURCE_NAME);
      if (!lockRes.acquired) {
        console.warn(`[Lock] Skipping collector run: ${lockRes.reason}`);
        throw new Error(`Concurrent job active: ${lockRes.reason}`);
      }
      lockAcquired = true;
      console.log(`✔ Acquired session advisory lock for "${SOURCE_NAME}".`);
    } catch (err: any) {
      if (directClient) await directClient.$disconnect().catch(() => {});
      throw err;
    }
  } else {
    console.warn('[Lock] DIRECT_URL not set; skipping session advisory lock check.');
  }

  let ingestionRunDbId: string | null = null;
  if (!dryRun) {
    const run = await prisma.ingestionRun.create({
      data: {
        sourceName: SOURCE_NAME,
        status: 'RUNNING',
        recordsIngested: 0,
        statsJson: { mode, runId, batchSize },
      },
    });
    ingestionRunDbId = run.id;
    console.log(`✔ Created IngestionRun: ${ingestionRunDbId}`);
  }

  const result: AccelaCollectorResult = {
    runId,
    mode,
    dryRun,
    startedAt: new Date(startTime).toISOString(),
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    activeViolationsCount: 0,
    activeCitationsCount: 0,
    pendingInspectionsCount: 0,
    historicalClosedCount: 0,
    activeVacantCount: 0,
    historicalVacantCount: 0,
    activeDemoCount: 0,
    historicalDemoCount: 0,
    batchesCompleted: 0,
    errors: [],
  };

  try {
    // 2. Build Query Where Clause
    let whereClause = '1%3D1';
    if (mode === 'incremental') {
      const cutoffDate = options.sinceDate || (await getIncrementalCutoffDate(prisma));
      const timestampExpr = formatArcGisTimestamp(cutoffDate);
      console.log(`[Incremental] Querying cases updated since: ${cutoffDate.toISOString()} (${timestampExpr})`);
      whereClause = encodeURIComponent(`lastupdated >= ${timestampExpr}`);
    } else {
      console.log('[Full Reconciliation] Querying all records (1=1)...');
    }

    // 3. Page through records
    while (result.totalFetched < maxRecords) {
      const fetchCount = Math.min(batchSize, maxRecords - result.totalFetched);
      const queryUrl = `${ACCELA_FEATURE_SERVER_URL}?where=${whereClause}&outFields=*&resultOffset=${offset}&resultRecordCount=${fetchCount}&f=json`;

      const data = await fetchWithRetry(queryUrl);
      const features: AccelaRawFeature[] = (data.features || []).map((f: any) => f.attributes);
      if (features.length === 0) break;

      result.totalFetched += features.length;
      result.batchesCompleted++;

      // Bulk property lookup for this batch
      const batchPins = Array.from(
        new Set(features.map((f) => (f.pin || '').trim()).filter((p) => p.length > 0))
      );
      const matchedProps = await prisma.property.findMany({
        where: { parcelId: { in: batchPins } },
        select: { id: true, parcelId: true },
      });
      const propertyByPin = new Map(matchedProps.map((p) => [p.parcelId, p]));

      // Bulk check existing records to distinguish insert vs update
      const caseNumbers = features.map((f) => (f.permitnum || '').trim()).filter(Boolean);
      const existingRecords = await (prisma as any).codeViolation.findMany({
        where: { caseNumber: { in: caseNumbers } },
        select: { caseNumber: true },
      });
      const existingSet = new Set(existingRecords.map((r: any) => r.caseNumber));

      let batchMatched = 0;
      let batchUnmatched = 0;
      let batchInserted = 0;
      let batchUpdated = 0;

      for (const raw of features) {
        const caseNumber = (raw.permitnum || '').trim();
        if (!caseNumber) continue;

        const sourcePin = (raw.pin || '').trim();
        const stage = classifyEnforcementStage(raw.statuscurrentmapped, raw.statuscurrent);
        const matchedProp = sourcePin ? propertyByPin.get(sourcePin) : undefined;
        const isMatched = Boolean(matchedProp);

        if (isMatched) {
          result.matchedCount++;
          batchMatched++;
        } else {
          result.unmatchedCount++;
          batchUnmatched++;
        }

        const isVacant = String(raw.vacant || '').trim().toLowerCase() === 'yes';
        const hasDemoOrder = String(raw.demo_order || '').trim().toLowerCase() === 'yes';
        const isActive = stage === 'ACTIVE_CONFIRMED_VIOLATION' || stage === 'ACTIVE_LEGAL_CITATION';

        if (stage === 'ACTIVE_CONFIRMED_VIOLATION') result.activeViolationsCount++;
        else if (stage === 'ACTIVE_LEGAL_CITATION') result.activeCitationsCount++;
        else if (stage === 'INSPECTION_PENDING') result.pendingInspectionsCount++;
        else result.historicalClosedCount++;

        if (isVacant) {
          if (isActive) result.activeVacantCount++;
          else result.historicalVacantCount++;
        }
        if (hasDemoOrder) {
          if (isActive) result.activeDemoCount++;
          else result.historicalDemoCount++;
        }

        if (existingSet.has(caseNumber)) {
          result.totalUpdated++;
          batchUpdated++;
        } else {
          result.totalInserted++;
          batchInserted++;
        }
      }

      // Micro-batched concurrent upserts when not dry-run
      if (!dryRun) {
        const CHUNK_SIZE = 25;
        for (let i = 0; i < features.length; i += CHUNK_SIZE) {
          const chunk = features.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async (raw) => {
              const caseNumber = (raw.permitnum || '').trim();
              if (!caseNumber) return;

              const sourcePin = (raw.pin || '').trim();
              const stage = classifyEnforcementStage(raw.statuscurrentmapped, raw.statuscurrent);
              const matchedProp = sourcePin ? propertyByPin.get(sourcePin) : undefined;
              const isMatched = Boolean(matchedProp);

              const isVacant = String(raw.vacant || '').trim().toLowerCase() === 'yes';
              const hasDemoOrder = String(raw.demo_order || '').trim().toLowerCase() === 'yes';

              const openedDate =
                parseAccelaDate(raw.first_process_date) || parseAccelaDate(raw.initial_inspection);
              const initialInspectionDate = parseAccelaDate(raw.initial_inspection);
              const lastReInspectionDate = parseAccelaDate(raw.last_re_inspection);
              const complianceDeadline =
                parseAccelaDate(raw.extended_compliance_deadline) ||
                parseAccelaDate(raw.first_compliance_deadline);
              const complianceDate = parseAccelaDate(raw.compliance_date);
              const demoIssuedDate = parseAccelaDate(raw.demo_issued_date);
              const lastUpdatedSource = parseAccelaDate(raw.lastupdated);

              // 1. SourceRecord (Immutable raw provenance)
              const sourceRecord = await (prisma as any).sourceRecord.upsert({
                where: {
                  sourceName_sourceRecordId: {
                    sourceName: SOURCE_NAME,
                    sourceRecordId: caseNumber,
                  },
                },
                create: {
                  sourceName: SOURCE_NAME,
                  sourceRecordId: caseNumber,
                  propertyId: matchedProp ? matchedProp.id : null,
                  rawPayloadJson: raw as any,
                  ingestionRunId: ingestionRunDbId,
                  matchedStatus: isMatched ? 'MATCHED' : 'UNMATCHED',
                },
                update: {
                  propertyId: matchedProp ? matchedProp.id : null,
                  rawPayloadJson: raw as any,
                  ingestionRunId: ingestionRunDbId,
                  matchedStatus: isMatched ? 'MATCHED' : 'UNMATCHED',
                },
              });

              // 2. CodeViolation domain entity
              await (prisma as any).codeViolation.upsert({
                where: { caseNumber },
                create: {
                  sourceName: SOURCE_NAME,
                  sourceObjectId: raw.objectid,
                  sourceGlobalId: raw.globalid,
                  caseNumber,
                  sourcePin,
                  propertyId: matchedProp ? matchedProp.id : null,
                  matchStatus: isMatched ? 'MATCHED_EXACT_PIN' : 'UNMATCHED_COUNTY_PIN',
                  caseType: raw.casetype || 'Housing Inspection Case',
                  caseRecordClassMapped: raw.caserecordclassmapped || null,
                  statusCurrent: raw.statuscurrent || 'Unknown',
                  statusCurrentMapped: raw.statuscurrentmapped || 'Unknown',
                  enforcementStage: stage,
                  violationType: raw.casetype || 'HOUSING_CODE_INSPECTION',
                  severity: hasDemoOrder ? 'CRITICAL' : isVacant ? 'HIGH' : 'MEDIUM',
                  status: raw.statuscurrentmapped || 'OPEN',
                  description: `Housing Inspection Case: ${raw.statuscurrent || 'In Progress'}`,
                  inspectorNotes: raw.vacate_reason ? `Vacate reason: ${raw.vacate_reason}` : null,
                  violationDate: openedDate || initialInspectionDate || new Date(),
                  isVacant,
                  vacateReason: raw.vacate_reason || null,
                  hasDemoOrder,
                  demoIssuedDate,
                  openedDate,
                  initialInspectionDate,
                  lastReInspectionDate,
                  complianceDeadline,
                  complianceDate,
                  lastUpdatedSource,
                  originalAddress: raw.originaladdress1?.trim() || null,
                  originalCity: raw.originalcity?.trim() || null,
                  originalState: raw.originalstate?.trim() || null,
                  originalZip: raw.originalzip?.trim() || null,
                  accelaUrl: raw.link || null,
                  latestSourceRecordId: sourceRecord.id,
                },
                update: {
                  propertyId: matchedProp ? matchedProp.id : null,
                  matchStatus: isMatched ? 'MATCHED_EXACT_PIN' : 'UNMATCHED_COUNTY_PIN',
                  sourceObjectId: raw.objectid,
                  sourceGlobalId: raw.globalid,
                  caseType: raw.casetype || 'Housing Inspection Case',
                  caseRecordClassMapped: raw.caserecordclassmapped || null,
                  statusCurrent: raw.statuscurrent || 'Unknown',
                  statusCurrentMapped: raw.statuscurrentmapped || 'Unknown',
                  enforcementStage: stage,
                  status: raw.statuscurrentmapped || 'OPEN',
                  description: `Housing Inspection Case: ${raw.statuscurrent || 'In Progress'}`,
                  inspectorNotes: raw.vacate_reason ? `Vacate reason: ${raw.vacate_reason}` : null,
                  isVacant,
                  vacateReason: raw.vacate_reason || null,
                  hasDemoOrder,
                  demoIssuedDate,
                  lastReInspectionDate,
                  complianceDeadline,
                  complianceDate,
                  lastUpdatedSource,
                  latestSourceRecordId: sourceRecord.id,
                },
              });
            })
          );
        }
      }

      console.log(
        `[Batch ${result.batchesCompleted.toString().padStart(2)}] Offset ${offset.toString().padStart(5)}..${(offset + features.length).toString().padStart(5)}: ` +
        `${features.length} features (Matched: ${batchMatched}, Unmatched: ${batchUnmatched}, ` +
        `New: ${batchInserted}, Updated: ${batchUpdated})`
      );

      if (features.length < fetchCount) break;
      offset += features.length;
    }

    const duration = Date.now() - startTime;
    result.completedAt = new Date().toISOString();
    result.durationMs = duration;

    if (!dryRun && ingestionRunDbId) {
      await prisma.ingestionRun.update({
        where: { id: ingestionRunDbId },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          recordsIngested: result.totalInserted + result.totalUpdated,
          statsJson: result as any,
        },
      });
      console.log(`✔ Marked IngestionRun ${ingestionRunDbId} as SUCCESS.`);
    }

    console.log('\n========================================================================');
    console.log('  COLLECTOR RUN SUMMARY                                                 ');
    console.log('========================================================================');
    console.log(`Mode:                     ${mode.toUpperCase()}`);
    console.log(`Dry Run:                  ${dryRun ? 'YES (0 writes)' : 'NO'}`);
    console.log(`Features Processed:       ${result.totalFetched}`);
    console.log(`Net New Cases:            ${result.totalInserted}`);
    console.log(`In-Place Updated Cases:   ${result.totalUpdated}`);
    console.log(`Matched to Properties:    ${result.matchedCount}`);
    console.log(`Unmatched County Cases:   ${result.unmatchedCount}`);
    console.log(`Active Violations:        ${result.activeViolationsCount}`);
    console.log(`Duration:                 ${(duration / 1000).toFixed(1)}s\n`);

    return result;
  } catch (err: any) {
    console.error('❌ Collector error:', err);
    result.errors.push(err.message);
    if (!dryRun && ingestionRunDbId) {
      await prisma.ingestionRun.update({
        where: { id: ingestionRunDbId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorsJson: { error: err.message, stack: err.stack },
        },
      });
    }
    throw err;
  } finally {
    if (directClient && lockAcquired) {
      await releaseIngestionAdvisoryLock(directClient, SOURCE_NAME).catch(() => {});
      await directClient.$disconnect().catch(() => {});
      console.log(`✔ Released advisory lock for "${SOURCE_NAME}".`);
    }
  }
}
