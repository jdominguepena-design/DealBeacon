import { sanitizeConnectionUrl, NeonPreflightError, NeonEndpointVerificationResult } from './neon-preflight';

export const EXACT_AUTHORIZED_TEST_ENDPOINT = 'ep-round-night-b4nshsuz';

export const PROTECTED_NEON_ENDPOINTS = [
  'ep-restless-bonus-b4xv9ig1', // DEV (Current active environment)
  'ep-bitter-shape-b4cb5xop',   // Stage 14 Neon Backup
  'ep-long-term-b4jl0xxu',      // Stage 15 Neon Backup
  'ep-small-boat-b4e3ng68',     // Stage 16 Neon Backup (Pre-countywide)
];

export interface VerifyTestBranchOptions {
  testDatabaseUrl?: string;
  testDirectUrl?: string;
  expectedTestEndpointId?: string;
}

/**
 * DealBeacon — Strict Neon Isolated Test Branch Preflight Guard.
 *
 * Rules:
 * 1. Requires TEST_NEON_ENDPOINT_ID to be explicitly configured.
 * 2. Enforces an EXACT ALLOWLIST: must match EXACT_AUTHORIZED_TEST_ENDPOINT ('ep-round-night-b4nshsuz').
 * 3. Explicitly forbids DEV endpoint (ep-restless-bonus-b4xv9ig1).
 * 4. Explicitly forbids all protected backups.
 * 5. Requires testDatabaseUrl to match `${expectedTestEndpointId}-pooler.`.
 * 6. Requires testDirectUrl to match `${expectedTestEndpointId}.`.
 * 7. Enforces SSL require mode.
 * 8. Never exposes passwords or tokens in error messages.
 */
export function verifyNeonTestBranchEndpoints(
  options: VerifyTestBranchOptions = {}
): NeonEndpointVerificationResult {
  const expectedTestEndpointId = (
    options.expectedTestEndpointId ||
    process.env.TEST_NEON_ENDPOINT_ID ||
    ''
  ).trim();

  if (!expectedTestEndpointId) {
    throw new NeonPreflightError(
      'Test Preflight failed closed: TEST_NEON_ENDPOINT_ID is not configured. Set TEST_NEON_ENDPOINT_ID to the disposable Neon test branch endpoint ID.'
    );
  }

  // Exact allowlist enforcement
  if (expectedTestEndpointId !== EXACT_AUTHORIZED_TEST_ENDPOINT) {
    throw new NeonPreflightError(
      `CRITICAL SAFETY VIOLATION: Endpoint "${expectedTestEndpointId}" is NOT the authorized test endpoint ("${EXACT_AUTHORIZED_TEST_ENDPOINT}"). Aborting!`
    );
  }

  // Reject DEV and any verified backup endpoints
  if (PROTECTED_NEON_ENDPOINTS.includes(expectedTestEndpointId)) {
    throw new NeonPreflightError(
      `CRITICAL SAFETY VIOLATION: TEST_NEON_ENDPOINT_ID points to a protected branch ("${expectedTestEndpointId}"). Test runs are strictly prohibited on DEV and Backup branches!`
    );
  }

  const databaseUrl = options.testDatabaseUrl || process.env.TEST_DATABASE_URL;
  const directUrl = options.testDirectUrl || process.env.TEST_DIRECT_URL;

  if (!databaseUrl) {
    throw new NeonPreflightError('Test Preflight failed: TEST_DATABASE_URL is not set.');
  }
  if (!directUrl) {
    throw new NeonPreflightError('Test Preflight failed: TEST_DIRECT_URL is not set.');
  }

  const pooled = sanitizeConnectionUrl(databaseUrl);
  const direct = sanitizeConnectionUrl(directUrl);

  // Check against protected endpoints in URLs
  for (const protectedId of PROTECTED_NEON_ENDPOINTS) {
    if (pooled.host.includes(protectedId) || direct.host.includes(protectedId)) {
      throw new NeonPreflightError(
        `CRITICAL SAFETY VIOLATION: Target connection host points to protected branch "${protectedId}". Aborting immediately!`
      );
    }
  }

  if (!pooled.host.endsWith('.neon.tech') || !direct.host.endsWith('.neon.tech')) {
    throw new NeonPreflightError('Test Preflight rejected: Both connections must point to *.neon.tech');
  }

  const expectedPooledPrefix = `${expectedTestEndpointId}-pooler.`;
  if (!pooled.host.startsWith(expectedPooledPrefix)) {
    throw new NeonPreflightError(
      `Test Preflight safety violation: TEST_DATABASE_URL host "${pooled.host}" does not match expected prefix "${expectedPooledPrefix}".`
    );
  }

  const expectedDirectPrefix = `${expectedTestEndpointId}.`;
  if (!direct.host.startsWith(expectedDirectPrefix)) {
    throw new NeonPreflightError(
      `Test Preflight safety violation: TEST_DIRECT_URL host "${direct.host}" does not match expected prefix "${expectedDirectPrefix}".`
    );
  }

  if (pooled.sslMode !== 'require' || direct.sslMode !== 'require') {
    throw new NeonPreflightError('Test Preflight security violation: sslmode=require is mandatory.');
  }

  return {
    valid: true,
    expectedEndpointId: expectedTestEndpointId,
    pooledHost: pooled.host,
    directHost: direct.host,
    database: pooled.database,
  };
}
