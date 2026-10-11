import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getHotlineReviewDataset } from '@/lib/matching/hotline-review-service';
import {
  evaluateHotlineCandidate,
  normalizeStreetAddress,
  ParcelSpatialCandidate,
  HotlineCandidateInput,
} from '@/lib/matching/hotline-matcher';
import * as turf from '@turf/turf';

const prisma = new PrismaClient();

async function runHotlineReviewWorkspaceTests() {
  console.log('=== STAGE 12B.1: HOTLINE CANDIDATE REVIEW WORKSPACE TESTS ===\n');

  // Verify initial database counts (Zero-write invariant)
  const preHotlines = await prisma.hotlineReport.count();
  const preMatched = await prisma.hotlineReport.count({ where: { propertyId: { not: null } } });
  const preProps = await prisma.property.count();

  // Test 1: Service returns complete evaluated dataset
  console.log('1. Testing Hotline Review Service data loading...');
  const dataset = await getHotlineReviewDataset();
  assert.equal(dataset.totalReports, 2459, 'Must evaluate all 2,459 reports');
  assert.equal(dataset.totalParcelsIndexed, 2839, 'Must index all 2,839 eligible parcels');
  assert.equal(dataset.validationSampleCount, 50, 'Must extract exactly 50 stratified validation sample records');
  assert.equal(dataset.classificationCounts.DUAL_EVIDENCE_CANDIDATE, 17, 'Must match 17 dual evidence candidates');
  assert.equal(dataset.classificationCounts.ADDRESS_ONLY_CANDIDATE, 8, 'Must match 8 address only candidates');
  assert.equal(dataset.classificationCounts.SPATIAL_ONLY_CANDIDATE, 47, 'Must match 47 spatial only candidates');
  console.log('  ✔ PASS: Service loads 2,459 reports and 2,839 parcels with exact aggregate counts');

  // Test 2: Validation sample is correctly tagged
  console.log('2. Testing Validation Sample flags...');
  const sampleItems = dataset.items.filter((i) => i.isValidationSample);
  assert.equal(sampleItems.length, 50, 'Validation sample must contain exactly 50 items');
  console.log('  ✔ PASS: Exactly 50 items tagged as validation sample');

  // Test 3: Curbside distance check (> 0m for address-only candidates)
  console.log('3. Testing Address-Only distance-count integrity...');
  const addressOnlyItems = dataset.items.filter(
    (i) => i.evaluation.classification === 'ADDRESS_ONLY_CANDIDATE'
  );
  assert.equal(addressOnlyItems.length, 8, 'Must have exactly 8 address-only candidates');
  for (const item of addressOnlyItems) {
    assert.ok(
      item.evaluation.distanceToPolygonMeters !== null &&
        item.evaluation.distanceToPolygonMeters > 0,
      `Address-only candidate #${item.requestId} must have non-zero distance (>0m)`
    );
  }
  console.log('  ✔ PASS: All 8 address-only candidates have valid physical distances > 0m');

  // Test 4: Right-of-way problem type warning flag
  console.log('4. Testing Right-of-Way problem type warnings...');
  const rowProblemItems = dataset.items.filter(
    (i) => i.evaluation.hasRightOfWayProblemTypeWarning
  );
  assert.ok(rowProblemItems.length > 0, 'Must flag candidates with ROW problem types');
  const sample630050 = dataset.items.find((i) => i.requestId === '630050');
  assert.ok(sample630050, 'Request 630050 must exist');
  assert.equal(sample630050.evaluation.hasRightOfWayProblemTypeWarning, true);
  assert.ok(
    sample630050.evaluation.locationConsistencyNotes.includes('Problem type relates to public right-of-way'),
    'Notes must include warning text'
  );
  console.log('  ✔ PASS: Candidates with public ROW problem types correctly flagged with warning');

  // Test 5: Strict Invariants across all items
  console.log('5. Testing strict non-attribution invariants across all records...');
  for (const item of dataset.items) {
    assert.equal(
      item.evaluation.isResponsibilityEstablished,
      false,
      'isResponsibilityEstablished must be false'
    );
    assert.equal(
      item.evaluation.isOfficiallyVerifiedViolation,
      false,
      'isOfficiallyVerifiedViolation must be false'
    );
  }
  console.log('  ✔ PASS: 100% of candidate evaluations preserve responsibility & violation false invariants');

  // Test 6: Zero-write verification
  console.log('6. Testing zero-write database invariant...');
  const postHotlines = await prisma.hotlineReport.count();
  const postMatched = await prisma.hotlineReport.count({ where: { propertyId: { not: null } } });
  const postProps = await prisma.property.count();

  assert.equal(preHotlines, postHotlines, 'Hotlines count must not change');
  assert.equal(preMatched, postMatched, 'Matched count must remain 0');
  assert.equal(preProps, postProps, 'Properties count must not change');
  console.log('  ✔ PASS: Absolute zero-write invariant confirmed (0 database mutations)');

  console.log('\n======================================================');
  console.log('ALL HOTLINE REVIEW WORKSPACE TESTS PASSED');
  console.log('======================================================\n');
}

runHotlineReviewWorkspaceTests()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
