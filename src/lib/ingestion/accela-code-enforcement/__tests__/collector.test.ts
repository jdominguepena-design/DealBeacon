import assert from 'node:assert';
import { classifyEnforcementStage, parseAccelaDate } from '../normalize';

async function runTests() {
  console.log('========================================================================');
  console.log('  ACCELA CODE ENFORCEMENT COLLECTOR UNIT TESTS                         ');
  console.log('========================================================================\n');

  let passed = 0;

  // 1. Stage Classification Tests
  assert.strictEqual(
    classifyEnforcementStage('Active Violation', 'In Violation'),
    'ACTIVE_CONFIRMED_VIOLATION',
    'Should map Active Violation to ACTIVE_CONFIRMED_VIOLATION'
  );
  passed++;
  console.log('✔ PASS: Active violation correctly classified');

  assert.strictEqual(
    classifyEnforcementStage('Citation Issued', 'Citation Issued'),
    'ACTIVE_LEGAL_CITATION',
    'Should map Citation Issued to ACTIVE_LEGAL_CITATION'
  );
  passed++;
  console.log('✔ PASS: Legal citation correctly classified');

  assert.strictEqual(
    classifyEnforcementStage('Inspection Scheduled', 'Inspection Scheduled'),
    'INSPECTION_PENDING',
    'Should map Inspection Scheduled to INSPECTION_PENDING'
  );
  passed++;
  console.log('✔ PASS: Inspection scheduled correctly classified');

  assert.strictEqual(
    classifyEnforcementStage('Closed', 'Complied'),
    'CLOSED_COMPLIED',
    'Should map Complied to CLOSED_COMPLIED'
  );
  passed++;
  console.log('✔ PASS: Complied case correctly classified');

  assert.strictEqual(
    classifyEnforcementStage('Closed', 'No Violation Found'),
    'CLOSED_UNFOUNDED',
    'Should map No Violation Found to CLOSED_UNFOUNDED'
  );
  passed++;
  console.log('✔ PASS: No violation found correctly classified as unfounded');

  assert.strictEqual(
    classifyEnforcementStage('Closed', 'Case Closed'),
    'CLOSED_HISTORICAL',
    'Should map general closed case to CLOSED_HISTORICAL'
  );
  passed++;
  console.log('✔ PASS: Generic closed case correctly classified as historical');

  // 2. Date Parsing Tests
  const epoch = 1705363200000; // Jan 16, 2024 UTC
  const parsedEpoch = parseAccelaDate(epoch);
  assert(parsedEpoch instanceof Date, 'Should parse numeric epoch');
  assert.strictEqual(parsedEpoch?.getTime(), epoch, 'Parsed epoch timestamp should match');
  passed++;
  console.log('✔ PASS: Numeric epoch millisecond date parsing');

  const stringEpoch = '1705363200000';
  const parsedStringEpoch = parseAccelaDate(stringEpoch);
  assert(parsedStringEpoch instanceof Date, 'Should parse stringified epoch');
  assert.strictEqual(parsedStringEpoch?.getTime(), epoch, 'Parsed string epoch timestamp should match');
  passed++;
  console.log('✔ PASS: Stringified epoch millisecond date parsing');

  const isoString = '2024-01-16T00:00:00.000Z';
  const parsedIso = parseAccelaDate(isoString);
  assert(parsedIso instanceof Date, 'Should parse ISO date string');
  assert.strictEqual(parsedIso?.toISOString(), isoString, 'Parsed ISO string should match');
  passed++;
  console.log('✔ PASS: ISO date string parsing');

  assert.strictEqual(parseAccelaDate(null), null, 'Null should return null');
  assert.strictEqual(parseAccelaDate(''), null, 'Empty string should return null');
  assert.strictEqual(parseAccelaDate(0), null, 'Zero should return null');
  passed++;
  console.log('✔ PASS: Falsy / empty date handling');

  console.log(`\nALL ${passed} UNIT TESTS PASSED SUCCESSFULLY!`);
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
