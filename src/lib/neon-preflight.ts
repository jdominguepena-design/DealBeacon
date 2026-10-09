/**
 * DealBeacon — Strict Neon Dev Branch Preflight Verification.
 *
 * Enforces that runtime and migration connection strings strictly target
 * the designated Neon development branch. Fails closed if expected identity
 * is missing or if connection hosts diverge. Never exposes database credentials.
 */

export interface NeonEndpointVerificationResult {
  valid: boolean;
  expectedEndpointId: string;
  pooledHost: string;
  directHost: string;
  database: string;
}

export class NeonPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NeonPreflightError';
  }
}

/**
 * Strips credentials from a connection string, returning only safe diagnostics.
 */
export function sanitizeConnectionUrl(rawUrl: string | undefined): {
  host: string;
  database: string;
  protocol: string;
  sslMode: string | null;
} {
  if (!rawUrl) {
    throw new NeonPreflightError('Connection URL is undefined or empty.');
  }

  try {
    const parsed = new URL(rawUrl);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      throw new NeonPreflightError(`Invalid database protocol: ${parsed.protocol}`);
    }
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, '') || '(none)',
      protocol: parsed.protocol,
      sslMode: parsed.searchParams.get('sslmode'),
    };
  } catch (err) {
    if (err instanceof NeonPreflightError) throw err;
    throw new NeonPreflightError('Malformed database connection string.');
  }
}

export interface VerifyNeonOptions {
  databaseUrl?: string;
  directUrl?: string;
  expectedEndpointId?: string;
}

/**
 * Validates that DATABASE_URL (pooled) and DIRECT_URL (direct) match the expected
 * Neon development branch identity.
 *
 * Rules:
 * 1. Fails closed if expectedEndpointId is undefined, empty, or whitespace.
 * 2. DATABASE_URL must be a Neon host starting with `${expectedEndpointId}-pooler.`.
 * 3. DIRECT_URL must be a Neon host starting with `${expectedEndpointId}.` (no -pooler).
 * 4. Both must end with `.neon.tech`.
 * 5. Both must require SSL (`sslmode=require`).
 * 6. Under no circumstances are passwords or usernames echoed in thrown errors.
 */
export function verifyNeonDevEndpoints(options: VerifyNeonOptions = {}): NeonEndpointVerificationResult {
  const expectedEndpointId = (options.expectedEndpointId || process.env.NEON_DEV_ENDPOINT_ID || '').trim();

  // Fail closed if expected identity is absent
  if (!expectedEndpointId) {
    throw new NeonPreflightError(
      'Preflight failed closed: NEON_DEV_ENDPOINT_ID is not configured. Set NEON_DEV_ENDPOINT_ID in your environment to the target Neon dev branch endpoint (e.g. "ep-restless-bonus-b4xv9ig1").'
    );
  }

  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  const directUrl = options.directUrl || process.env.DIRECT_URL;

  if (!databaseUrl) {
    throw new NeonPreflightError('Preflight failed: DATABASE_URL is not set.');
  }
  if (!directUrl) {
    throw new NeonPreflightError('Preflight failed: DIRECT_URL is not set.');
  }

  const pooled = sanitizeConnectionUrl(databaseUrl);
  const direct = sanitizeConnectionUrl(directUrl);

  // Validate Pooled URL
  if (!pooled.host.endsWith('.neon.tech')) {
    throw new NeonPreflightError(
      `Preflight rejected DATABASE_URL: Host "${pooled.host}" does not point to Neon (*.neon.tech). Localhost and external databases are prohibited.`
    );
  }

  const expectedPooledPrefix = `${expectedEndpointId}-pooler.`;
  if (!pooled.host.startsWith(expectedPooledPrefix)) {
    throw new NeonPreflightError(
      `Preflight safety violation: DATABASE_URL host "${pooled.host}" does not match the expected dev branch pooled prefix "${expectedPooledPrefix}". Aborting to protect other environments.`
    );
  }

  if (pooled.sslMode !== 'require') {
    throw new NeonPreflightError(
      `Preflight security violation: DATABASE_URL host "${pooled.host}" is missing required parameter "sslmode=require".`
    );
  }

  // Validate Direct URL
  if (!direct.host.endsWith('.neon.tech')) {
    throw new NeonPreflightError(
      `Preflight rejected DIRECT_URL: Host "${direct.host}" does not point to Neon (*.neon.tech).`
    );
  }

  const expectedDirectPrefix = `${expectedEndpointId}.`;
  if (direct.host.startsWith(`${expectedEndpointId}-pooler.`)) {
    throw new NeonPreflightError(
      `Preflight configuration error: DIRECT_URL host "${direct.host}" contains "-pooler". Direct connections for migrations must not be pooled.`
    );
  }

  if (!direct.host.startsWith(expectedDirectPrefix)) {
    throw new NeonPreflightError(
      `Preflight safety violation: DIRECT_URL host "${direct.host}" does not match the expected dev branch direct prefix "${expectedDirectPrefix}". Aborting to protect other environments.`
    );
  }

  if (direct.sslMode !== 'require') {
    throw new NeonPreflightError(
      `Preflight security violation: DIRECT_URL host "${direct.host}" is missing required parameter "sslmode=require".`
    );
  }

  return {
    valid: true,
    expectedEndpointId,
    pooledHost: pooled.host,
    directHost: direct.host,
    database: pooled.database,
  };
}
