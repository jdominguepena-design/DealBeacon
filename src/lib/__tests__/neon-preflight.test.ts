import { verifyNeonDevEndpoints, NeonPreflightError, sanitizeConnectionUrl } from '../neon-preflight';

function runNeonPreflightTests() {
  console.log('--- NEON PREFLIGHT VERIFICATION TESTS ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✔ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✘ FAIL: ${name}`);
      if (detail) console.error(`     Detail: ${detail}`);
    }
  }

  const VALID_ENDPOINT = 'ep-restless-bonus-b4xv9ig1';
  const VALID_POOLED = `postgresql://app_user:secret_password_123@${VALID_ENDPOINT}-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require`;
  const VALID_DIRECT = `postgresql://app_user:secret_password_123@${VALID_ENDPOINT}.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require`;

  // Test 1: Sanitizer never exposes credentials
  try {
    const s = sanitizeConnectionUrl(VALID_POOLED);
    assert(s.host === `${VALID_ENDPOINT}-pooler.c-6.us-east-2.aws.neon.tech`, 'Sanitizer extracts correct host');
    assert(s.database === 'dealbeacon', 'Sanitizer extracts correct database');
    assert(!JSON.stringify(s).includes('secret_password_123'), 'Sanitizer never includes credentials');
  } catch (e) {
    assert(false, 'Sanitizer threw unexpected error', String(e));
  }

  // Test 2: Fails closed when expectedEndpointId is missing
  try {
    verifyNeonDevEndpoints({
      expectedEndpointId: '',
      databaseUrl: VALID_POOLED,
      directUrl: VALID_DIRECT,
    });
    assert(false, 'Should fail closed when expectedEndpointId is empty');
  } catch (e) {
    assert(e instanceof NeonPreflightError, 'Throws NeonPreflightError when identity missing');
    assert(String(e).includes('Preflight failed closed'), 'Error message states fail closed');
    assert(!String(e).includes('secret_password_123'), 'Error message does not leak password');
  }

  // Test 3: Successfully validates matching dev endpoints
  try {
    const res = verifyNeonDevEndpoints({
      expectedEndpointId: VALID_ENDPOINT,
      databaseUrl: VALID_POOLED,
      directUrl: VALID_DIRECT,
    });
    assert(res.valid === true, 'Validates matching Neon endpoints successfully');
    assert(res.expectedEndpointId === VALID_ENDPOINT, 'Returns correct endpoint identity');
  } catch (e) {
    assert(false, 'Valid configuration unexpectedly threw', String(e));
  }

  // Test 4: Rejects mismatched endpoint in DATABASE_URL
  try {
    const PROD_POOLED = 'postgresql://app_user:secret_password_123@ep-prod-database-99999-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon?sslmode=require';
    verifyNeonDevEndpoints({
      expectedEndpointId: VALID_ENDPOINT,
      databaseUrl: PROD_POOLED,
      directUrl: VALID_DIRECT,
    });
    assert(false, 'Should reject mismatched DATABASE_URL endpoint');
  } catch (e) {
    assert(e instanceof NeonPreflightError, 'Throws NeonPreflightError on mismatched pooled host');
    assert(String(e).includes('does not match the expected dev branch pooled prefix'), 'Mentions safety violation');
    assert(!String(e).includes('secret_password_123'), 'Never leaks password on rejection');
  }

  // Test 5: Rejects localhost
  try {
    const LOCAL_DB = 'postgresql://postgres:postgres@localhost:5432/dealbeacon?sslmode=require';
    verifyNeonDevEndpoints({
      expectedEndpointId: VALID_ENDPOINT,
      databaseUrl: LOCAL_DB,
      directUrl: VALID_DIRECT,
    });
    assert(false, 'Should reject localhost');
  } catch (e) {
    assert(String(e).includes('does not point to Neon'), 'Explicitly rejects non-Neon localhost host');
  }

  // Test 6: Rejects direct URL with -pooler
  try {
    verifyNeonDevEndpoints({
      expectedEndpointId: VALID_ENDPOINT,
      databaseUrl: VALID_POOLED,
      directUrl: VALID_POOLED, // accidentally pooled
    });
    assert(false, 'Should reject pooled direct URL');
  } catch (e) {
    assert(String(e).includes('contains "-pooler"'), 'Detects misplaced -pooler in direct connection');
  }

  // Test 7: Rejects missing sslmode=require
  try {
    const NO_SSL = `postgresql://app_user:secret_password_123@${VALID_ENDPOINT}-pooler.c-6.us-east-2.aws.neon.tech/dealbeacon`;
    verifyNeonDevEndpoints({
      expectedEndpointId: VALID_ENDPOINT,
      databaseUrl: NO_SSL,
      directUrl: VALID_DIRECT,
    });
    assert(false, 'Should reject missing sslmode');
  } catch (e) {
    assert(String(e).includes('sslmode=require'), 'Enforces sslmode=require check');
  }

  console.log(`\nNEON PREFLIGHT TEST RESULT: ${passed}/${total} passed\n`);
  if (passed !== total) process.exit(1);
}

runNeonPreflightTests();
