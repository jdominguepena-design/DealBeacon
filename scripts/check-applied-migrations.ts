import { prisma } from '../src/lib/db';

async function main() {
  const applied: any = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at 
    FROM _prisma_migrations 
    ORDER BY started_at ASC;
  `;
  console.log('Applied Migrations in DEV:');
  console.table(applied);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
