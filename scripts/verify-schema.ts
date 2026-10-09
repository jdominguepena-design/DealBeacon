/**
 * DealBeacon — read-only schema verification against the live database.
 *
 * Checks tables, indexes, foreign keys, enums, migration history, and that
 * Prisma Client (pooled DATABASE_URL) can query every model. No writes.
 *
 * Usage: npm run db:verify-schema
 */
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile('.env');
} catch {
  /* variables may come from the shell */
}

const EXPECTED_TABLES = [
  'code_violations', 'ingestion_runs', 'ownership_records', 'properties', 'property_events',
  'property_notes', 'saved_properties', 'score_history', 'signals', 'source_records',
  'tax_records', 'users',
];

const EXPECTED_UNIQUE = [
  'users_email_key',
  'properties_parcelId_key',
  'source_records_sourceName_sourceRecordId_key',
  'saved_properties_userId_propertyId_key',
];

const EXPECTED_ENUMS = ['ConfidenceLevel', 'IngestionStatus', 'LeadStatus', 'PriorityLevel', 'SignalSeverity', 'UserRole'];

const prisma = new PrismaClient({ log: [] });
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? '✔' : '✘'} ${label}`);
  if (!ok) failures++;
};

async function main() {
  console.log('DealBeacon schema verification (read-only)\n');

  // ── Tables ────────────────────────────────────────────────
  const tables = (
    await prisma.$queryRaw<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`
  ).map((r) => r.t);
  console.log('Tables:');
  for (const t of EXPECTED_TABLES) check(tables.includes(t), t);
  const extra = tables.filter((t) => !EXPECTED_TABLES.includes(t) && t !== '_prisma_migrations');
  check(extra.length === 0, `no unexpected tables${extra.length ? ' (found: ' + extra.join(', ') + ')' : ''}`);

  // ── Enums ─────────────────────────────────────────────────
  const enums = (
    await prisma.$queryRaw<{ e: string }[]>`
      SELECT t.typname AS e FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typtype='e' ORDER BY 1`
  ).map((r) => r.e);
  console.log('\nEnums:');
  for (const e of EXPECTED_ENUMS) check(enums.includes(e), e);

  // ── Indexes ───────────────────────────────────────────────
  const idx = await prisma.$queryRaw<{ indexname: string; tablename: string; isunique: boolean }[]>`
    SELECT i.indexname, i.tablename, ix.indisunique AS isunique
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index ix ON ix.indexrelid = c.oid
    WHERE i.schemaname='public' AND i.tablename <> '_prisma_migrations'
    ORDER BY i.tablename, i.indexname`;
  const pk = idx.filter((i) => i.indexname.endsWith('_pkey'));
  const uniq = idx.filter((i) => i.isunique && !i.indexname.endsWith('_pkey'));
  const plain = idx.filter((i) => !i.isunique);
  console.log(`\nIndexes: ${idx.length} total (${pk.length} primary keys, ${uniq.length} unique, ${plain.length} secondary)`);
  check(pk.length === EXPECTED_TABLES.length, `every table has a primary key (${pk.length}/${EXPECTED_TABLES.length})`);
  for (const u of EXPECTED_UNIQUE) check(uniq.some((i) => i.indexname === u), `unique: ${u}`);
  check(plain.length === 15, `15 secondary indexes present (found ${plain.length})`);

  // ── Foreign keys ──────────────────────────────────────────
  const fks = await prisma.$queryRaw<{ name: string; tbl: string; ref: string; del: string }[]>`
    SELECT con.conname AS name, rel.relname AS tbl, ref.relname AS ref,
           CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' ELSE con.confdeltype::text END AS del
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE con.contype='f' AND n.nspname='public' ORDER BY 2,1`;
  console.log(`\nForeign keys: ${fks.length}`);
  for (const f of fks) console.log(`    ${f.tbl} → ${f.ref}  (ON DELETE ${f.del})`);
  check(fks.length === 14, `14 foreign keys present`);
  const provenanceSetNull = fks.filter((f) => f.ref === 'source_records' || f.tbl === 'source_records');
  check(
    provenanceSetNull.every((f) => f.del === 'SET NULL'),
    'provenance links (signals/events → source_records, source_records → properties/runs) use SET NULL, never CASCADE'
  );

  // ── Migration history ─────────────────────────────────────
  const migs = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null; applied_steps_count: number }[]
  >`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at`;
  console.log('\nMigration history:');
  for (const m of migs)
    console.log(`    ${m.migration_name}  finished=${m.finished_at?.toISOString() ?? 'NO'}  rolled_back=${m.rolled_back_at ? 'YES' : 'no'}`);
  check(migs.length === 1 && migs[0].migration_name === '0_init', 'exactly one migration recorded: 0_init');
  check(migs.every((m) => m.finished_at && !m.rolled_back_at), 'all migrations finished, none rolled back');

  // ── Prisma Client queries (pooled connection) ─────────────
  console.log('\nPrisma Client model queries (pooled DATABASE_URL):');
  const counts = {
    User: await prisma.user.count(),
    Property: await prisma.property.count(),
    OwnershipRecord: await prisma.ownershipRecord.count(),
    TaxRecord: await prisma.taxRecord.count(),
    CodeViolation: await prisma.codeViolation.count(),
    Signal: await prisma.signal.count(),
    PropertyEvent: await prisma.propertyEvent.count(),
    SourceRecord: await prisma.sourceRecord.count(),
    IngestionRun: await prisma.ingestionRun.count(),
    ScoreHistory: await prisma.scoreHistory.count(),
    SavedProperty: await prisma.savedProperty.count(),
    PropertyNote: await prisma.propertyNote.count(),
  };
  for (const [m, n] of Object.entries(counts)) console.log(`    ${m.padEnd(16)} ${n} rows`);
  check(Object.keys(counts).length === 12, 'all 12 models queryable');
  check(Object.values(counts).every((n) => n === 0), 'all tables empty (no seed / no import has run)');

  console.log(`\n${failures === 0 ? 'RESULT: PASS' : `RESULT: ${failures} check(s) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('Verification error:', e instanceof Error ? e.message.split('\n').slice(-1)[0] : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
