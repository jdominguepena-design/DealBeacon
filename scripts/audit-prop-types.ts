import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../src/lib/neon-preflight';

try {
  process.loadEnvFile('.env');
} catch {}

verifyNeonDevEndpoints();
const prisma = new PrismaClient();

async function main() {
  console.log('=== STAGE 11B.1 AUDIT: PROPERTY TYPE TOTAL RECONCILIATION ===\n');

  const totalEligible = await prisma.property.count({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
  });
  console.log(`• Total INSIDE_OMAHA Properties: ${totalEligible}`);

  const types = await prisma.property.groupBy({
    by: ['propertyType'],
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
    _count: true,
  });

  console.log('\n--- Property Types in DB (INSIDE_OMAHA) ---');
  let sum = 0;
  for (const t of types) {
    console.log(`• ${t.propertyType}: ${t._count}`);
    sum += t._count;
  }
  console.log(`\n• Total Sum of GroupBy propertyType: ${sum}`);
  console.log(`• Difference between sum (${sum}) and totalEligible (${totalEligible}): ${sum - totalEligible}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
