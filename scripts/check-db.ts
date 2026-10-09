/**
 * DealBeacon — database connectivity check (read-only).
 *
 * Verifies DATABASE_URL (pooled) and DIRECT_URL (direct) without ever printing
 * credentials. Performs NO writes, NO migrations, NO resets.
 *
 * Usage: npm run db:check
 */
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile('.env');
} catch {
  // .env missing — fall through; variables may come from the shell.
}

interface UrlSummary {
  ok: boolean;
  host?: string;
  database?: string;
  pooled?: boolean;
  sslRequired?: boolean;
  problem?: string;
}

function describeUrl(raw: string | undefined): UrlSummary {
  if (!raw) return { ok: false, problem: 'not set' };
  try {
    const u = new URL(raw);
    if (!['postgresql:', 'postgres:'].includes(u.protocol)) {
      return { ok: false, problem: `unexpected protocol ${u.protocol}` };
    }
    return {
      ok: true,
      host: u.hostname, // hostname only — never user/password
      database: u.pathname.replace(/^\//, '') || '(none)',
      pooled: u.hostname.includes('-pooler'),
      sslRequired: u.searchParams.get('sslmode') === 'require',
    };
  } catch {
    return { ok: false, problem: 'not a valid URL' };
  }
}

async function probe(label: string, url: string) {
  const client = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    const [info] = await client.$queryRaw<
      { version: string; db: string; usr_is_set: boolean; ssl: boolean | null }[]
    >`SELECT version() AS version,
             current_database() AS db,
             current_user IS NOT NULL AS usr_is_set,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`;
    const tables = await client.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`;
    console.log(`  ✔ ${label}: connected`);
    console.log(`    server   : ${info.version.split(' on ')[0]}`);
    console.log(`    database : ${info.db}`);
    console.log(
      `    pg_stat_ssl: ${info.ssl === null ? 'unknown' : info.ssl} (backend hop only; on Neon the client's TLS ends at the proxy, enforced by sslmode=require)`
    );
    console.log(
      `    tables   : ${tables.length === 0 ? '(empty — no tables yet)' : tables.map((t) => t.table_name).join(', ')}`
    );
    return { ok: true, tables: tables.map((t) => t.table_name) };
  } catch (err) {
    // Prisma error messages can echo the host but never the password; still trim to first line.
    const msg = err instanceof Error ? err.message.split('\n').filter(Boolean).slice(-1)[0] : String(err);
    console.log(`  ✘ ${label}: connection failed — ${msg}`);
    return { ok: false, tables: [] as string[] };
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  console.log('DealBeacon database check (read-only)\n');

  const pooled = describeUrl(process.env.DATABASE_URL);
  const direct = describeUrl(process.env.DIRECT_URL);

  for (const [name, s, wantPooled] of [
    ['DATABASE_URL', pooled, true],
    ['DIRECT_URL', direct, false],
  ] as const) {
    if (!s.ok) {
      console.log(`  ✘ ${name}: ${s.problem}`);
      continue;
    }
    const warn: string[] = [];
    if (s.pooled !== wantPooled) warn.push(wantPooled ? 'expected a "-pooler" host' : 'should NOT be a "-pooler" host');
    if (!s.sslRequired) warn.push('missing sslmode=require');
    if (s.host === 'localhost' || s.host === '127.0.0.1') warn.push('still points at localhost');
    console.log(`  • ${name}: host=${s.host} db=${s.database}${warn.length ? '  ⚠ ' + warn.join('; ') : ''}`);
  }
  console.log('');

  if (!pooled.ok || !direct.ok) {
    console.log('Fix the variables above in .env, then re-run.');
    process.exit(1);
  }

  const a = await probe('DATABASE_URL (pooled)', process.env.DATABASE_URL!);
  const b = await probe('DIRECT_URL (direct)', process.env.DIRECT_URL!);

  console.log('');
  if (a.ok && b.ok) {
    const hasMigrations = b.tables.includes('_prisma_migrations');
    const appTables = b.tables.filter((t) => t !== '_prisma_migrations');
    if (appTables.length === 0) {
      console.log('RESULT: connection verified. Database is empty — safe to create the baseline migration.');
    } else if (hasMigrations) {
      console.log('RESULT: connection verified. Database already has Prisma migration history — will inspect before migrating.');
    } else {
      console.log('RESULT: connection verified. Database has tables but NO migration history — will baseline, not reset.');
    }
    process.exit(0);
  }
  process.exit(1);
}

main();
