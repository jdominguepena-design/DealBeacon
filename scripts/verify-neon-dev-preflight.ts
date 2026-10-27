import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';
import { prisma } from '../src/lib/db';

export const AUTHORIZED_NEON_DEV_ENDPOINT = 'ep-restless-bonus-b4xv9ig1';

/**
 * Preflight script for GitHub Actions and local execution.
 * Fails closed if the database connection does not point strictly to the authorized Neon DEV branch.
 */
export async function runNeonDevPreflight(): Promise<void> {
  console.log('========================================================================');
  console.log('  NEON DEV ENDPOINT PREFLIGHT VERIFICATION');
  console.log('========================================================================\n');

  const configuredEndpoint = (process.env.NEON_DEV_ENDPOINT_ID || AUTHORIZED_NEON_DEV_ENDPOINT).trim();

  // Fail closed if configured endpoint diverges from authorized DEV endpoint
  if (configuredEndpoint !== AUTHORIZED_NEON_DEV_ENDPOINT) {
    console.error(
      `❌ FAIL CLOSED: NEON_DEV_ENDPOINT_ID "${configuredEndpoint}" does not match authorized DEV endpoint "${AUTHORIZED_NEON_DEV_ENDPOINT}".`
    );
    process.exit(1);
  }

  try {
    const verified = verifyNeonDevEndpoints({
      expectedEndpointId: AUTHORIZED_NEON_DEV_ENDPOINT,
    });

    console.log(`✔ Endpoint identity validated: ${verified.expectedEndpointId}`);
    console.log(`✔ Pooled host:                 ${verified.pooledHost}`);
    console.log(`✔ Direct host:                 ${verified.directHost}`);
    console.log(`✔ Target database:             ${verified.database}`);
    console.log(`✔ SSL Mode enforced:           require`);

    // Verify live DB connectivity (with brief cold-start retry for serverless wake up)
    console.log('\nTesting live database connectivity...');
    let connected = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!connected && attempts < maxAttempts) {
      try {
        attempts++;
        const result = await prisma.$queryRaw<Array<{ current_database: string; connected_now: Date }>>`
          SELECT current_database(), now() AS connected_now;
        `;
        console.log(`✔ Database connection active:  connected to "${result[0]?.current_database}"`);
        connected = true;
      } catch (connErr: any) {
        if (attempts >= maxAttempts) throw connErr;
        console.warn(`[Cold Start] Attempt ${attempts}/${maxAttempts} failed (${connErr.message.split('\n')[0]}). Retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✔ PREFLIGHT PASSED: Connection verified to authorized Neon DEV endpoint.\n');
  } catch (err: any) {
    console.error('\n❌ PREFLIGHT FAILED CLOSED:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  runNeonDevPreflight();
}
