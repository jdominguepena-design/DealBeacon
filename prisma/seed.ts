import { PrismaClient } from '@prisma/client';
import { buildSyntheticOmahaDataset } from '../src/lib/seeds/omaha-synthetic-dataset';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting DealBeacon Omaha Synthetic Dataset Seed...');

  const { properties, sourceRecords, signals } = buildSyntheticOmahaDataset();

  // Create standard users
  const investor = await prisma.user.upsert({
    where: { email: 'investor@dealbeacon.local' },
    update: {},
    create: {
      id: 'usr-investor-01',
      email: 'investor@dealbeacon.local',
      name: 'Omaha Wholesaler (Demo User)',
      role: 'INVESTOR',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dealbeacon.local' },
    update: {},
    create: {
      id: 'usr-admin-01',
      email: 'admin@dealbeacon.local',
      name: 'System Admin (Data Operations)',
      role: 'ADMIN',
    },
  });

  console.log(`👤 Users seeded: ${investor.name}, ${admin.name}`);

  // Create Ingestion Run
  const run = await prisma.ingestionRun.create({
    data: {
      id: `run-${Date.now()}`,
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR & CODE_ENFORCEMENT',
      status: 'SUCCESS',
      recordsIngested: properties.length,
      signalsCreated: signals.length,
      completedAt: new Date(),
    },
  });

  // Seed Properties & Relations
  for (const prop of properties) {
    const createdProp = await prisma.property.upsert({
      where: { parcelId: prop.parcelId },
      update: {
        opportunityScore: prop.opportunityScore,
        dataConfidence: prop.dataConfidence as any,
        scoreBreakdownJson: prop.scoreBreakdownJson as any,
        lastScoredAt: new Date(),
      },
      create: {
        id: prop.id,
        parcelId: prop.parcelId,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        zip: prop.zip,
        neighborhood: prop.neighborhood,
        propertyType: prop.propertyType,
        yearBuilt: prop.yearBuilt,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        squareFeet: prop.squareFeet,
        lotSizeSqFt: prop.lotSizeSqFt,
        assessedValue: prop.assessedValue,
        estimatedValue: prop.estimatedValue,
        estimatedEquityPct: prop.estimatedEquityPct,
        opportunityScore: prop.opportunityScore,
        dataConfidence: prop.dataConfidence as any,
        scoreBreakdownJson: prop.scoreBreakdownJson as any,
        lastScoredAt: new Date(),
      },
    });

    // Ownership
    if (prop.ownershipRecords && prop.ownershipRecords.length > 0) {
      const own = prop.ownershipRecords[0];
      await prisma.ownershipRecord.create({
        data: {
          id: own.id,
          propertyId: createdProp.id,
          ownerName: own.ownerName,
          mailingAddress: own.mailingAddress,
          mailingCity: own.mailingCity,
          mailingState: own.mailingState,
          mailingZip: own.mailingZip,
          isAbsentee: own.isAbsentee,
          isOutOfState: own.isOutOfState,
          isCorporate: own.isCorporate,
          purchaseDate: own.purchaseDate ? new Date(own.purchaseDate) : null,
          purchasePrice: own.purchasePrice,
          deedType: own.deedType,
          ownershipYears: own.ownershipYears,
          isCurrent: true,
        },
      });
    }

    // Taxes
    if (prop.taxRecords) {
      for (const tax of prop.taxRecords) {
        await prisma.taxRecord.create({
          data: {
            id: tax.id,
            propertyId: createdProp.id,
            taxYear: tax.taxYear,
            totalAssessed: tax.totalAssessed,
            annualTaxDue: tax.annualTaxDue,
            amountDelinquent: tax.amountDelinquent,
            isDelinquent: tax.isDelinquent,
            delinquentYears: tax.delinquentYears,
            taxSaleStatus: tax.taxSaleStatus,
          },
        });
      }
    }

    // Code Violations
    if (prop.codeViolations) {
      for (const code of prop.codeViolations) {
        await prisma.codeViolation.create({
          data: {
            id: code.id,
            propertyId: createdProp.id,
            caseNumber: code.caseNumber,
            violationDate: new Date(code.violationDate),
            violationType: code.violationType,
            severity: code.severity as any,
            status: code.status,
            description: code.description,
            inspectorNotes: code.inspectorNotes,
            complianceDate: code.complianceDate ? new Date(code.complianceDate) : null,
          },
        });
      }
    }
  }

  console.log(`✅ Successfully seeded ${properties.length} synthetic properties into PostgreSQL.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
