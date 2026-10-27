import assert from 'node:assert/strict';
import { verifyNeonTestBranchEndpoints, PROTECTED_NEON_ENDPOINTS } from '../neon-test-preflight';

console.log('--- TEST: NEON TEST-BRANCH PREFLIGHT GUARD SECURITY ---');

function runPreflightTests() {
  // Test 1: Fail closed if TEST_NEON_ENDPOINT_ID is empty
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: '',
      });
    },
    /TEST_NEON_ENDPOINT_ID is not configured/
  );
  console.log('  ✔ PASS: Fails closed when TEST_NEON_ENDPOINT_ID is missing');

  // Test 2: Reject DEV endpoint
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-restless-bonus-b4xv9ig1',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Strictly rejects DEV endpoint');

  // Test 3: Reject Stage 14 Backup endpoint
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-bitter-shape-b4cb5xop',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Strictly rejects Stage 14 backup endpoint');

  // Test 4: Reject Stage 15 Backup endpoint
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-long-term-b4jl0xxu',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Strictly rejects Stage 15 backup endpoint');

  // Test 5: Reject URLs pointing to DEV even if expectedTestEndpointId is set to a dummy
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-disposable-test-1234',
        testDatabaseUrl: 'postgresql://user:pass@ep-restless-bonus-b4xv9ig1-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
        testDirectUrl: 'postgresql://user:pass@ep-disposable-test-1234.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Detects and rejects URL targeting DEV host');

  // Test 5b: Reject URLs pointing to Stage 14 Backup
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-disposable-test-1234',
        testDatabaseUrl: 'postgresql://user:pass@ep-bitter-shape-b4cb5xop-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
        testDirectUrl: 'postgresql://user:pass@ep-disposable-test-1234.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Detects and rejects URL targeting Stage 14 backup host');

  // Test 5c: Reject URLs pointing to Stage 15 Backup
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-disposable-test-1234',
        testDatabaseUrl: 'postgresql://user:pass@ep-long-term-b4jl0xxu-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
        testDirectUrl: 'postgresql://user:pass@ep-disposable-test-1234.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
      });
    },
    /CRITICAL SAFETY VIOLATION/
  );
  console.log('  ✔ PASS: Detects and rejects URL targeting Stage 15 backup host');

  // Test 6: Non-allowlisted endpoint is rejected
  assert.throws(
    () => {
      verifyNeonTestBranchEndpoints({
        expectedTestEndpointId: 'ep-disposable-test-1234',
        testDatabaseUrl: 'postgresql://user:pass@ep-disposable-test-1234-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
        testDirectUrl: 'postgresql://user:pass@ep-disposable-test-1234.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
      });
    },
    /is NOT the authorized test endpoint/
  );
  console.log('  ✔ PASS: Non-allowlisted disposable endpoint strictly rejected');

  // Test 7: Exact authorized test branch endpoint passes
  const validRes = verifyNeonTestBranchEndpoints({
    expectedTestEndpointId: 'ep-round-night-b4nshsuz',
    testDatabaseUrl: 'postgresql://user:pass@ep-round-night-b4nshsuz-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
    testDirectUrl: 'postgresql://user:pass@ep-round-night-b4nshsuz.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require',
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.expectedEndpointId, 'ep-round-night-b4nshsuz');
  console.log('  ✔ PASS: Exact authorized test branch endpoint accepted');

  console.log('\nALL 9 PREFLIGHT SECURITY TESTS PASSED ✔');
}

runPreflightTests();
