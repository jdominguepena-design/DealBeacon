/**
 * Stage 12B.3 — Export the deterministic 50-record Hotline validation sample as a
 * blank human-review CSV template.
 *
 * READ-ONLY: performs SELECT queries only. Never writes to Neon.
 * Output goes to testing-artifacts/ (Git-ignored) because it contains source data.
 *
 * Reviewer decision columns are intentionally left BLANK. This script must never
 * populate human verdicts.
 *
 * Exits non-zero if the stratified distribution or source-category cross-check fails.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getHotlineReviewDataset } from '../src/lib/matching/hotline-review-service';
import type { CandidateMatchClassification } from '../src/lib/matching/hotline-matcher';

const prisma = new PrismaClient();

const EXPECTED_DISTRIBUTION: Partial<Record<CandidateMatchClassification, number>> = {
  DUAL_EVIDENCE_CANDIDATE: 15,
  SPATIAL_ONLY_CANDIDATE: 10,
  ADDRESS_ONLY_CANDIDATE: 5,
  EXCLUDED_PUBLIC_INFRASTRUCTURE: 10,
  EXCLUDED_RIGHT_OF_WAY: 5,
  UNMATCHED: 5,
};

const OUTPUT_DIR = path.resolve('testing-artifacts', 'hotline-validation');

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  const preMatched = await prisma.hotlineReport.count({ where: { propertyId: { not: null } } });
  const preHotline = await prisma.hotlineReport.count();

  const dataset = await getHotlineReviewDataset();
  const sample = dataset.items.filter((i) => i.isValidationSample);

  // --- 1. Stratified distribution check ---
  const actual: Record<string, number> = {};
  for (const item of sample) {
    const cls = item.evaluation.classification;
    actual[cls] = (actual[cls] ?? 0) + 1;
  }

  console.log('1. STRATIFIED DISTRIBUTION CHECK');
  let distributionOk = sample.length === 50;
  for (const [cls, expected] of Object.entries(EXPECTED_DISTRIBUTION)) {
    const got = actual[cls] ?? 0;
    const ok = got === expected;
    if (!ok) distributionOk = false;
    console.log(`   ${ok ? 'OK  ' : 'FAIL'} ${cls.padEnd(32)} expected ${expected}, got ${got}`);
  }
  for (const cls of Object.keys(actual)) {
    if (!(cls in EXPECTED_DISTRIBUTION)) {
      distributionOk = false;
      console.log(`   FAIL unexpected tier in sample: ${cls} (${actual[cls]})`);
    }
  }
  console.log(`   Total sample records: ${sample.length}\n`);

  // --- 2. Source-category cross-check against latest immutable source record ---
  const reportRows = await prisma.hotlineReport.findMany({
    where: { id: { in: sample.map((s) => s.reportId) } },
    select: { id: true, latestSourceRecordId: true },
  });
  const latestIdByReport = new Map(reportRows.map((r) => [r.id, r.latestSourceRecordId]));
  const sourceRows = await prisma.sourceRecord.findMany({
    where: { id: { in: reportRows.map((r) => r.latestSourceRecordId).filter((x): x is string => !!x) } },
    select: { id: true, rawPayloadJson: true },
  });
  const payloadById = new Map(sourceRows.map((s) => [s.id, s.rawPayloadJson as Record<string, unknown> | null]));

  console.log('2. SOURCE CATEGORY CROSS-CHECK (hotline_reports vs latest source_records payload)');
  let categoryMismatches = 0;
  const verification = new Map<string, string>();
  for (const item of sample) {
    const srcId = latestIdByReport.get(item.reportId);
    const payload = srcId ? payloadById.get(srcId) : null;
    if (!payload) {
      verification.set(item.reportId, 'NO_SOURCE_RECORD');
      categoryMismatches++;
      continue;
    }
    const srcCategory = payload['report_category'] ?? null;
    const srcProblem = payload['PROBTYPE'] ?? null;
    const match = srcCategory === item.reportCategory && srcProblem === item.problemType;
    verification.set(item.reportId, match ? 'MATCHES_SOURCE' : `MISMATCH(source=${srcCategory}/${srcProblem})`);
    if (!match) categoryMismatches++;
  }
  console.log(`   Records matching source payload: ${sample.length - categoryMismatches}/${sample.length}`);

  const r631422 = sample.find((s) => s.requestId === '631422');
  if (r631422) {
    console.log(
      `   RequestID 631422: ${r631422.reportCategory} / ${r631422.problemType} -> ${verification.get(r631422.reportId)}`
    );
  }
  console.log('');

  // --- 3. Write CSV template ---
  const headers = [
    'packet_item',
    'request_id',
    'source_category',
    'source_problem_type',
    'source_payload_check',
    'original_location_text',
    'normalized_report_address',
    'report_latitude',
    'report_longitude',
    'candidate_pin',
    'candidate_assessor_situs',
    'point_in_polygon',
    'boundary_distance_m_exact',
    'automated_classification',
    'row_problem_type_warning',
    'classification_rationale',
    'review_status',
    'reviewer_geographic_consistency',
    'reviewer_property_relevance',
    'reviewer_confidence',
    'reviewer_notes',
    'reviewer_initials',
    'review_date',
  ];

  const lines = [headers.map(csvCell).join(',')];
  sample.forEach((item, idx) => {
    const e = item.evaluation;
    lines.push(
      [
        idx + 1,
        item.requestId,
        item.reportCategory,
        item.problemType,
        verification.get(item.reportId),
        item.originalLocationText,
        e.normalizedReportAddress,
        item.latitude,
        item.longitude,
        e.candidatePin,
        e.candidateAddress,
        e.spatialContainment ? 'YES' : 'NO',
        e.distanceToPolygonMeters, // full precision, no rounding or clamping
        e.classification,
        e.hasRightOfWayProblemTypeWarning ? 'YES' : 'NO',
        e.locationConsistencyNotes,
        'UNREVIEWED',
        '', // reviewer_geographic_consistency — human only
        '', // reviewer_property_relevance — human only
        '', // reviewer_confidence — human only
        '', // reviewer_notes — human only
        '', // reviewer_initials — human only
        '', // review_date — human only
      ]
        .map(csvCell)
        .join(',')
    );
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, 'hotline-validation-sample-50.csv');
  fs.writeFileSync(outPath, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');

  console.log('3. CSV TEMPLATE WRITTEN');
  console.log(`   Path: ${outPath}`);
  console.log(`   Rows: ${sample.length} (+1 header). Reviewer columns left blank; review_status = UNREVIEWED.\n`);

  // --- 4. Zero-write check ---
  const postMatched = await prisma.hotlineReport.count({ where: { propertyId: { not: null } } });
  const postHotline = await prisma.hotlineReport.count();
  const zeroWrite = preMatched === postMatched && preHotline === postHotline;
  console.log('4. ZERO-WRITE CHECK');
  console.log(`   hotline_reports ${preHotline} -> ${postHotline}; matched ${preMatched} -> ${postMatched}\n`);

  const ok = distributionOk && categoryMismatches === 0 && zeroWrite;
  console.log(ok ? 'EXPORT VERIFIED' : 'EXPORT VERIFICATION FAILED');
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Export failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
