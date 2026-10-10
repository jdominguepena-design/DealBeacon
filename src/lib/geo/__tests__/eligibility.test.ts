import assert from 'node:assert/strict';
import {
  isInvestorEligible,
  filterInvestorEligible,
  assertInvestorEligible,
  canScoreProperty,
  INVESTOR_ELIGIBLE_WHERE,
  IneligibleJurisdictionError,
} from '../eligibility';
import { calculateOpportunityScore } from '../../scoring/engine';
import { MunicipalJurisdiction } from '@prisma/client';

console.log('--- INVESTOR ELIGIBILITY & JURISDICTION SAFEGUARD UNIT TESTS ---');

// 1. Authoritative Predicate: INSIDE_OMAHA is strictly required
{
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'INSIDE_OMAHA' }), true);
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'OUTSIDE_OMAHA' }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'CROSSES_BOUNDARY' }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'UNRESOLVED' }), false);
  console.log('  ✔ PASS: isInvestorEligible allows ONLY INSIDE_OMAHA and rejects other enum values');
}

// 2. Strict Fail-Closed Behavior on Missing, Null, Undefined, or Malformed Data
{
  assert.equal(isInvestorEligible(null), false);
  assert.equal(isInvestorEligible(undefined), false);
  assert.equal(isInvestorEligible({}), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: null }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: undefined }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: '' }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'UNKNOWN' }), false);
  assert.equal(isInvestorEligible({ municipalJurisdiction: 'OMAHA' }), false);
  console.log('  ✔ PASS: isInvestorEligible fails closed on null, undefined, blank, and unrecognized statuses');
}

// 3. Centralized Prisma WHERE Clause Predicate
{
  assert.deepEqual(INVESTOR_ELIGIBLE_WHERE, { municipalJurisdiction: 'INSIDE_OMAHA' });
  console.log('  ✔ PASS: INVESTOR_ELIGIBLE_WHERE strictly filters by municipalJurisdiction: INSIDE_OMAHA');
}

// 4. Batch Filtering of Properties
{
  const testParcels = [
    { id: '1', parcelId: '010001', municipalJurisdiction: 'INSIDE_OMAHA' as MunicipalJurisdiction },
    { id: '2', parcelId: '010002', municipalJurisdiction: 'OUTSIDE_OMAHA' as MunicipalJurisdiction },
    { id: '3', parcelId: '010003', municipalJurisdiction: 'CROSSES_BOUNDARY' as MunicipalJurisdiction },
    { id: '4', parcelId: '010004', municipalJurisdiction: 'UNRESOLVED' as MunicipalJurisdiction },
    { id: '5', parcelId: '010005', municipalJurisdiction: null },
    { id: '6', parcelId: '010006', municipalJurisdiction: 'INSIDE_OMAHA' as MunicipalJurisdiction },
  ];

  const eligible = filterInvestorEligible(testParcels);
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].id, '1');
  assert.equal(eligible[1].id, '6');
  console.log('  ✔ PASS: filterInvestorEligible filters out outside, boundary, unresolved, and null records');
}

// 5. Assertion Guard (assertInvestorEligible)
{
  assert.doesNotThrow(() => {
    assertInvestorEligible({ municipalJurisdiction: 'INSIDE_OMAHA' });
  });

  assert.throws(
    () => {
      assertInvestorEligible({ municipalJurisdiction: 'OUTSIDE_OMAHA' });
    },
    IneligibleJurisdictionError
  );

  assert.throws(
    () => {
      assertInvestorEligible({ municipalJurisdiction: 'CROSSES_BOUNDARY' });
    },
    IneligibleJurisdictionError
  );

  assert.throws(
    () => {
      assertInvestorEligible({ municipalJurisdiction: 'UNRESOLVED' });
    },
    IneligibleJurisdictionError
  );

  assert.throws(
    () => {
      assertInvestorEligible(null);
    },
    IneligibleJurisdictionError
  );
  console.log('  ✔ PASS: assertInvestorEligible throws IneligibleJurisdictionError for all ineligible records');
}

// 6. canScoreProperty Guard
{
  assert.equal(canScoreProperty({ municipalJurisdiction: 'INSIDE_OMAHA' }), true);
  assert.equal(canScoreProperty({ municipalJurisdiction: 'OUTSIDE_OMAHA' }), false);
  assert.equal(canScoreProperty({ municipalJurisdiction: 'CROSSES_BOUNDARY' }), false);
  assert.equal(canScoreProperty({ municipalJurisdiction: 'UNRESOLVED' }), false);
  assert.equal(canScoreProperty(null), false);
  console.log('  ✔ PASS: canScoreProperty correctly guards scoring evaluation');
}

// 7. Opportunity Scoring Engine Exclusion
{
  const highDistressContext = {
    taxRecords: [
      {
        id: 't-1',
        propertyId: 'p-1',
        taxYear: 2024,
        totalAssessed: 150000,
        annualTaxDue: 3500,
        amountDelinquent: 5200,
        isDelinquent: true,
        delinquentYears: 3,
        taxSaleStatus: null,
        createdAt: '2025-01-01',
      },
    ],
    codeViolations: [
      {
        id: 'cv-1',
        propertyId: 'p-1',
        caseNumber: 'CASE-001',
        violationDate: '2025-01-01',
        violationType: 'SAFETY_HAZARD',
        severity: 'CRITICAL' as const,
        status: 'OPEN',
        description: 'Imminent hazard',
        inspectorNotes: null,
        complianceDate: null,
        createdAt: '2025-01-01',
      },
    ],
    referenceDate: new Date('2025-08-01'),
  };

  // When jurisdiction is INSIDE_OMAHA, scoring succeeds with positive score
  const insideScore = calculateOpportunityScore({
    ...highDistressContext,
    municipalJurisdiction: 'INSIDE_OMAHA',
  });
  assert.ok(insideScore.totalScore > 0, 'INSIDE_OMAHA property with distress must score > 0');
  assert.ok(insideScore.breakdown.length > 0, 'Breakdown must have contributing factors');

  // When jurisdiction is OUTSIDE_OMAHA, scoring MUST return 0 score and empty breakdown
  const outsideScore = calculateOpportunityScore({
    ...highDistressContext,
    municipalJurisdiction: 'OUTSIDE_OMAHA',
  });
  assert.equal(outsideScore.totalScore, 0, 'OUTSIDE_OMAHA property must receive 0 opportunityScore');
  assert.equal(outsideScore.dataConfidence, 'LOW');
  assert.equal(outsideScore.breakdown.length, 0, 'OUTSIDE_OMAHA must receive empty breakdown');

  // When jurisdiction is CROSSES_BOUNDARY, scoring MUST return 0 score
  const crossesScore = calculateOpportunityScore({
    ...highDistressContext,
    municipalJurisdiction: 'CROSSES_BOUNDARY',
  });
  assert.equal(crossesScore.totalScore, 0, 'CROSSES_BOUNDARY property must receive 0 opportunityScore');

  // When jurisdiction is UNRESOLVED, scoring MUST return 0 score
  const unresolvedScore = calculateOpportunityScore({
    ...highDistressContext,
    municipalJurisdiction: 'UNRESOLVED',
  });
  assert.equal(unresolvedScore.totalScore, 0, 'UNRESOLVED property must receive 0 opportunityScore');

  console.log('  ✔ PASS: Scoring engine excludes OUTSIDE_OMAHA, CROSSES_BOUNDARY, and UNRESOLVED properties (score=0)');
}

// 8. Strict Rejection of Missing, Null, Blank, and Invalid Jurisdiction Values in calculateOpportunityScore
{
  const highDistressFixture = {
    taxRecords: [
      {
        id: 't-test',
        propertyId: 'p-test',
        taxYear: 2024,
        totalAssessed: 150000,
        annualTaxDue: 3500,
        amountDelinquent: 5200,
        isDelinquent: true,
        delinquentYears: 3,
        taxSaleStatus: null,
        createdAt: '2025-01-01',
      },
    ],
    codeViolations: [
      {
        id: 'cv-test',
        propertyId: 'p-test',
        caseNumber: 'CASE-001',
        violationDate: '2025-01-01',
        violationType: 'SAFETY_HAZARD',
        severity: 'CRITICAL' as const,
        status: 'OPEN',
        description: 'Imminent hazard',
        inspectorNotes: null,
        complianceDate: null,
        createdAt: '2025-01-01',
      },
    ],
    referenceDate: new Date('2025-08-01'),
  };

  const invalidJurisdictionValues: Array<any> = [
    undefined,                          // completely omitted
    null,                               // explicitly null
    '',                                 // empty string
    '   ',                              // whitespace string
    'UNKNOWN',                          // unrecognized string
    'OMAHA',                            // raw city name instead of enum
    'inside_omaha',                     // lower case
    'DOUGLAS_COUNTY',                   // non-existent jurisdiction
    'INVALID',                          // arbitrary value
  ];

  for (const invalidVal of invalidJurisdictionValues) {
    const res = calculateOpportunityScore({
      ...highDistressFixture,
      municipalJurisdiction: invalidVal,
    });

    const label = invalidVal === undefined ? 'undefined (omitted)' : invalidVal === null ? 'null' : `"${invalidVal}"`;
    assert.equal(
      res.totalScore,
      0,
      `Property with municipalJurisdiction=${label} MUST receive totalScore=0`
    );
    assert.equal(
      res.dataConfidence,
      'LOW',
      `Property with municipalJurisdiction=${label} MUST receive dataConfidence='LOW'`
    );
    assert.equal(
      res.breakdown.length,
      0,
      `Property with municipalJurisdiction=${label} MUST receive empty breakdown`
    );
    assert.equal(
      res.categoryTotals.financial,
      0,
      `Property with municipalJurisdiction=${label} MUST receive financial=0`
    );
    assert.equal(
      res.categoryTotals.property,
      0,
      `Property with municipalJurisdiction=${label} MUST receive property=0`
    );
  }

  // Also test empty context {}
  const emptyRes = calculateOpportunityScore({});
  assert.equal(emptyRes.totalScore, 0, 'Empty context {} must yield score 0');
  assert.equal(emptyRes.dataConfidence, 'LOW', 'Empty context {} must yield LOW confidence');
  assert.equal(emptyRes.breakdown.length, 0, 'Empty context {} must yield empty breakdown');

  console.log('  ✔ PASS: Direct regression tests verify missing, null, blank, and invalid jurisdictions cannot receive positive score');
}

console.log('\n✔ ALL INVESTOR ELIGIBILITY TESTS PASSED SUCCESSFULLY.\n');
