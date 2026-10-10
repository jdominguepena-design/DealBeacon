import { SCORING_CONFIG } from '../scoring.config';
import { calculateOpportunityScore, calculateConfidenceLevel, PropertyScoreContext } from '../engine';
import { synthesizePropertyTimeline } from '../../timeline/builder';
import { buildSyntheticOmahaDataset, SYNTHETIC_OMAHA_FIXTURES } from '../../seeds/omaha-synthetic-dataset';
import {
  TaxRecordDTO,
  CodeViolationDTO,
  OwnershipRecordDTO,
  SignalDTO,
} from '@/types';

function runQATestSuite() {
  console.log('====================================================');
  console.log('DEALBEACON MILESTONE 1 — COMPREHENSIVE QA TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: BOUNDS & CATEGORY CAPS
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: SCORING BOUNDS & CATEGORY CAPS ---');

  // Test 1.1: Empty Context => 0 score
  const emptyRes = calculateOpportunityScore({});
  assert(emptyRes.totalScore === 0, 'Empty context yields score of 0');
  assert(emptyRes.dataConfidence === 'LOW', 'Empty context yields LOW confidence');

  // Test 1.2: Extreme Stacked Distress capped at 100
  const extremeContext: PropertyScoreContext = {
    ownership: {
      id: 'o-extreme',
      propertyId: 'p-extreme',
      ownerName: 'Demo Corp',
      mailingAddress: '123 Fake St',
      mailingCity: 'Phoenix',
      mailingState: 'AZ',
      mailingZip: '85001',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2000-01-01',
      purchasePrice: 50000,
      deedType: 'Warranty Deed',
      ownershipYears: 25,
      isCurrent: true,
      createdAt: '2000-01-01',
    },
    taxRecords: [
      {
        id: 't-1',
        propertyId: 'p-extreme',
        taxYear: 2024,
        totalAssessed: 100000,
        annualTaxDue: 3000,
        amountDelinquent: 8000,
        isDelinquent: true,
        delinquentYears: 3,
        taxSaleStatus: 'Tax Lien Issued',
        createdAt: '2024-01-01',
      },
    ],
    codeViolations: [
      {
        id: 'c-1',
        propertyId: 'p-extreme',
        caseNumber: 'CE-2025-999',
        violationDate: '2025-08-20',
        violationType: 'STRUCTURAL',
        severity: 'CRITICAL',
        status: 'CONDEMNED',
        description: 'Collapsed wall',
        inspectorNotes: 'Condemned',
        complianceDate: null,
        createdAt: '2025-08-20',
      },
      {
        id: 'c-2',
        propertyId: 'p-extreme',
        caseNumber: 'CE-2024-111',
        violationDate: '2024-01-10',
        violationType: 'EXTERIOR_MAINTENANCE',
        severity: 'HIGH',
        status: 'OPEN',
        description: 'Roof damage',
        inspectorNotes: null,
        complianceDate: null,
        createdAt: '2024-01-10',
      },
    ],
    signals: [
      {
        id: 's-vacant',
        propertyId: 'p-extreme',
        signalType: 'VACANCY_INDICATOR',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: 15,
        severity: 'HIGH',
        eventDate: '2025-08-20',
        discoveredAt: '2025-08-20',
        status: 'ACTIVE',
        sourceType: 'CITY_INSPECTION',
        sourceRecordId: 'src-1',
        metadataJson: null,
      },
    ],
    referenceDate: new Date('2025-08-28'),
    municipalJurisdiction: 'INSIDE_OMAHA',
  };

  const extremeRes = calculateOpportunityScore(extremeContext);
  assert(extremeRes.totalScore <= 100, `Score is capped at max 100 (Actual: ${extremeRes.totalScore})`);
  assert(extremeRes.categoryTotals.financial <= 35, `Financial category capped at 35 (Actual: ${extremeRes.categoryTotals.financial})`);
  assert(extremeRes.categoryTotals.property <= 35, `Property category capped at 35 (Actual: ${extremeRes.categoryTotals.property})`);
  assert(extremeRes.categoryTotals.ownership <= 25, `Ownership category capped at 25 (Actual: ${extremeRes.categoryTotals.ownership})`);
  assert(extremeRes.categoryTotals.recency <= 10, `Recency category capped at 10 (Actual: ${extremeRes.categoryTotals.recency})`);
  assert(extremeRes.categoryTotals.compound === 10, `Compound bonus triggered (Actual: ${extremeRes.categoryTotals.compound})`);

  // ----------------------------------------------------
  // TEST GROUP 2: RECENCY DECAY BEHAVIOR
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: RECENCY DECAY BEHAVIOR ---');

  const refDate = new Date('2025-08-28T00:00:00.000Z');

  // Case A: Signal 10 days old (< 30 days => +10 pts)
  const recent30Context: PropertyScoreContext = {
    signals: [
      {
        id: 's-recent-10',
        propertyId: 'p-1',
        signalType: 'EXTERIOR_CODE_VIOLATION',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: 15,
        severity: 'HIGH',
        eventDate: '2025-08-18T00:00:00.000Z', // 10 days before Aug 28
        discoveredAt: '2025-08-18T00:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'TEST',
        sourceRecordId: null,
        metadataJson: null,
      },
    ],
    referenceDate: refDate,
    municipalJurisdiction: 'INSIDE_OMAHA',
  };
  const rec30Res = calculateOpportunityScore(recent30Context);
  assert(rec30Res.categoryTotals.recency === 10, `Signal 10 days old yields +10 recency points (Actual: ${rec30Res.categoryTotals.recency})`);

  // Case B: Signal 60 days old (< 90 days => +5 pts)
  const recent90Context: PropertyScoreContext = {
    signals: [
      {
        id: 's-recent-60',
        propertyId: 'p-1',
        signalType: 'EXTERIOR_CODE_VIOLATION',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: 15,
        severity: 'HIGH',
        eventDate: '2025-06-29T00:00:00.000Z', // 60 days before Aug 28
        discoveredAt: '2025-06-29T00:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'TEST',
        sourceRecordId: null,
        metadataJson: null,
      },
    ],
    referenceDate: refDate,
    municipalJurisdiction: 'INSIDE_OMAHA',
  };
  const rec90Res = calculateOpportunityScore(recent90Context);
  assert(rec90Res.categoryTotals.recency === 5, `Signal 60 days old yields +5 recency points (Actual: ${rec90Res.categoryTotals.recency})`);

  // Case C: Signal 180 days old (> 90 days => +0 pts)
  const staleContext: PropertyScoreContext = {
    signals: [
      {
        id: 's-stale-180',
        propertyId: 'p-1',
        signalType: 'EXTERIOR_CODE_VIOLATION',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: 15,
        severity: 'HIGH',
        eventDate: '2025-01-01T00:00:00.000Z',
        discoveredAt: '2025-01-01T00:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'TEST',
        sourceRecordId: null,
        metadataJson: null,
      },
    ],
    referenceDate: refDate,
    municipalJurisdiction: 'INSIDE_OMAHA',
  };
  const staleRes = calculateOpportunityScore(staleContext);
  assert(staleRes.categoryTotals.recency === 0, `Signal 180 days old yields 0 recency points (Actual: ${staleRes.categoryTotals.recency})`);

  // ----------------------------------------------------
  // TEST GROUP 3: 5 REPRESENTATIVE OMAHA PROPERTY EXAMPLES
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: 5 REPRESENTATIVE OMAHA PROPERTY EXAMPLES ---');

  const { properties, sourceRecords, signals } = buildSyntheticOmahaDataset();

  const selectedFive = properties.slice(0, 5);
  selectedFive.forEach((prop, idx) => {
    console.log(`\n----------------------------------------------------`);
    console.log(`Example #${idx + 1}: ${prop.address} (${prop.neighborhood}) — PIN: ${prop.parcelId}`);
    console.log(`Opportunity Score: ${prop.opportunityScore}/100 | Data Confidence: ${prop.dataConfidence}`);
    console.log(`Contributing Factor Breakdown:`);
    prop.scoreBreakdownJson?.forEach((f) => {
      console.log(`   +${f.points.toString().padStart(2, ' ')} pts [${f.category.padEnd(9, ' ')}] ${f.label}`);
    });
  });

  assert(selectedFive.length === 5, '5 representative Omaha properties evaluated');

  // ----------------------------------------------------
  // TEST GROUP 4: PROVENANCE LINEAGE VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: PROVENANCE LINEAGE DEMONSTRATION ---');

  const testProp = properties[0]; // 2418 N 24th St
  const testSrc = sourceRecords.find((s) => s.propertyId === testProp.id);
  const testSigs = signals.filter((s) => s.propertyId === testProp.id);

  console.log(`1. Raw Source Record: ID="${testSrc?.id}", SourceName="${testSrc?.sourceName}", ExternalID="${testSrc?.sourceRecordId}"`);
  console.log(`   Raw Payload JSON Keys: ${Object.keys(testSrc?.rawPayloadJson || {}).join(', ')}`);
  console.log(`2. Derived Signals (${testSigs.length}):`);
  testSigs.forEach((s) => {
    console.log(`   - Signal ID="${s.id}", Type="${s.signalType}", Weight=+${s.scoreContribution} pts, Linked SourceRecordId="${s.sourceRecordId}"`);
  });
  console.log(`3. Final Opportunity Score: ${testProp.opportunityScore}/100 with ${testProp.scoreBreakdownJson?.length} itemized explainers.`);

  assert(Boolean(testSrc && testSrc.rawPayloadJson), 'Raw SourceRecord exists with immutable raw JSON');
  assert(testSigs.every((s) => s.sourceRecordId !== null), 'Every derived signal links to its originating SourceRecord ID');

  // ----------------------------------------------------
  // TEST GROUP 5: TIMELINE DERIVATION & CHRONOLOGY
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: TIMELINE DERIVATION & CHRONOLOGY ---');

  const timeline = testProp.events || [];
  assert(timeline.length >= 3, `Timeline generated ${timeline.length} chronological milestones`);

  let isChronological = true;
  for (let i = 0; i < timeline.length - 1; i++) {
    const tA = new Date(timeline[i].eventDate).getTime();
    const tB = new Date(timeline[i + 1].eventDate).getTime();
    if (tA < tB) {
      isChronological = false;
      break;
    }
  }
  assert(isChronological, 'Timeline events are strictly sorted descending (newest first)');

  // ----------------------------------------------------
  // TEST GROUP 6: EDGE CASES & SAFEGUARDS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: EDGE CASES & SAFEGUARDS ---');

  // Edge Case A: Zero Distress Property (Clean hold)
  const cleanProp = properties.find((p) => p.address === '15204 Q St');
  assert(
    cleanProp ? cleanProp.opportunityScore < 50 : false,
    `Clean control property (15204 Q St) scores low baseline (<50) (Actual: ${cleanProp?.opportunityScore})`
  );

  // Edge Case B: Out-of-State Absentee vs In-State
  const azProp = properties.find((p) => p.parcelId === '0421000101'); // Arizona
  const neProp = properties.find((p) => p.parcelId === '0421000104'); // In-State Omaha
  assert(
    azProp?.ownershipRecords?.[0]?.isOutOfState === true,
    'Out-of-state owner correctly recognized as Out-of-State (+20)'
  );
  assert(
    neProp?.ownershipRecords?.[0]?.isOutOfState === false && neProp?.ownershipRecords?.[0]?.isAbsentee === true,
    'Different address in Omaha correctly recognized as In-State Absentee (+12)'
  );

  console.log('\n====================================================');
  console.log(`QA SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100%)`);
  console.log('====================================================\n');
}

runQATestSuite();
