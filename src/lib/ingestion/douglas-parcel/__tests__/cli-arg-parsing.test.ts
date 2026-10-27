import assert from 'node:assert/strict';
import { parseParcelCliArgs } from '../cli-parser';

console.log('--- DOUGLAS PARCEL CLI ARGUMENT PARSER TESTS ---');

// Test 1: Valid space-separated flags
{
  const args = ['--limit', '100', '--batch-size', '25', '--page-size', '50', '--start-after-object-id', '165550', '--strategy', 'BULK_EXPERIMENTAL'];
  const parsed = parseParcelCliArgs(args);
  assert.equal(parsed.limit, 100);
  assert.equal(parsed.batchSize, 25);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.startAfterObjectId, 165550);
  assert.equal(parsed.strategy, 'BULK_EXPERIMENTAL');
  assert.equal(parsed.dryRun, true);
  console.log('  ✔ PASS: Space-separated flags parsed correctly');
}

// Test 2: Valid equal-separated flags (--flag=value)
{
  const args = ['--limit=25000', '--batch-size=25', '--page-size=250', '--start-after-oid=165550', '--strategy=BULK_EXPERIMENTAL', '--execute'];
  const parsed = parseParcelCliArgs(args);
  assert.equal(parsed.limit, 25000);
  assert.equal(parsed.batchSize, 25);
  assert.equal(parsed.pageSize, 250);
  assert.equal(parsed.startAfterObjectId, 165550);
  assert.equal(parsed.strategy, 'BULK_EXPERIMENTAL');
  assert.equal(parsed.execute, true);
  assert.equal(parsed.dryRun, false);
  console.log('  ✔ PASS: Equal-separated flags (--flag=value) parsed correctly');
}

// Test 3: Incident reproduction syntax must parse correctly and NOT fall back
{
  const args = ['--execute', '--strategy=BULK_EXPERIMENTAL', '--limit=25000', '--batch-size=25', '--page-size=250', '--start-after-oid=165550'];
  const parsed = parseParcelCliArgs(args);
  assert.equal(parsed.strategy, 'BULK_EXPERIMENTAL');
  assert.equal(parsed.limit, 25000);
  assert.equal(parsed.startAfterObjectId, 165550);
  assert.equal(parsed.execute, true);
  console.log('  ✔ PASS: Exact syntax that caused incident now parses with full fidelity');
}

// Test 4: Unknown flag rejected with hard failure
{
  assert.throws(
    () => parseParcelCliArgs(['--unknown-flag', '123']),
    /Unknown flag: "--unknown-flag"/
  );
  assert.throws(
    () => parseParcelCliArgs(['--foo=bar']),
    /Unknown flag: "--foo"/
  );
  console.log('  ✔ PASS: Unknown flags throw descriptive errors');
}

// Test 5: Missing value for valued flag rejected
{
  assert.throws(
    () => parseParcelCliArgs(['--limit']),
    /Missing value for flag "--limit"/
  );
  assert.throws(
    () => parseParcelCliArgs(['--limit', '--strategy', 'bulk']),
    /Missing value for flag "--limit"/
  );
  assert.throws(
    () => parseParcelCliArgs(['--limit=']),
    /Flag "--limit" was provided with an empty value/
  );
  console.log('  ✔ PASS: Missing or empty values rejected');
}

// Test 6: Invalid non-numeric or out-of-range values rejected
{
  assert.throws(
    () => parseParcelCliArgs(['--limit', 'not-a-number']),
    /Invalid --limit value: "not-a-number"/
  );
  assert.throws(
    () => parseParcelCliArgs(['--batch-size', '500']),
    /Invalid --batch-size value: "500"/
  );
  assert.throws(
    () => parseParcelCliArgs(['--strategy', 'INVALID_STRATEGY']),
    /Invalid --strategy value: "INVALID_STRATEGY"/
  );
  console.log('  ✔ PASS: Malformed numbers and invalid strategy values rejected');
}

// Test 7: Positional arguments rejected
{
  assert.throws(
    () => parseParcelCliArgs(['unexpected-arg']),
    /Unexpected positional argument: "unexpected-arg"/
  );
  console.log('  ✔ PASS: Positional arguments strictly rejected');
}

// Test 8: Live execution safety gate prevents accidental default to 0
{
  assert.throws(
    () => parseParcelCliArgs(['--execute', '--strategy', 'BULK_EXPERIMENTAL', '--limit', '100']),
    /Safety gate: Live execution \(--execute\) requires either an explicit starting cursor/
  );
  console.log('  ✔ PASS: Safety gate blocks live run without explicit cursor or resume');
}
