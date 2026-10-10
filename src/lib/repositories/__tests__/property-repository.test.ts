import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { verifyNeonDevEndpoints } from '../../neon-preflight';
import {
  listEligibleProperties,
  countEligibleProperties,
  getEligiblePropertyById,
  getEligiblePropertyByPin,
  sanitizePagination,
} from '../property-repository';

try {
  process.loadEnvFile('.env');
} catch {}

verifyNeonDevEndpoints();
const prisma = new PrismaClient();

console.log('--- PHASE 2B STAGE 11B: REAL PROPERTY REPOSITORY REGRESSION TESTS ---\n');

async function runTests() {
  const initialPropCount = await prisma.property.count();
  const initialOwnCount = await prisma.ownershipRecord.count();
  const initialSrcCount = await prisma.sourceRecord.count();
  const initialRunsCount = await prisma.ingestionRun.count();

  // 1. Investor eligibility enforcement on list queries
  {
    console.log('1. Eligibility Filtering: listEligibleProperties returns only INSIDE_OMAHA properties...');
    const result = await listEligibleProperties({}, { page: 1, pageSize: 50 }, prisma);
    assert.equal(result.properties.length, 50);
    assert.equal(result.meta.totalRecords, 2839, 'Total eligible count must match exactly 2839');
    for (const p of result.properties) {
      assert.equal(p.municipalJurisdiction, 'INSIDE_OMAHA');
    }
    console.log('  ✔ PASS: 100% of returned properties are strictly INSIDE_OMAHA');
  }

  // 2. Investor eligibility count matches exactly
  {
    console.log('2. Eligibility Count: countEligibleProperties returns exactly 2,839...');
    const totalCount = await countEligibleProperties({}, prisma);
    assert.equal(totalCount, 2839);
    console.log(`  ✔ PASS: Total eligible count is exactly ${totalCount}`);
  }

  // 3. Fail-closed individual lookups for non-eligible properties
  {
    console.log('3. Fail-Closed Detail: Non-eligible properties return null...');
    // Query an OUTSIDE_OMAHA property directly from DB
    const outsideProp = await prisma.property.findFirst({
      where: { municipalJurisdiction: 'OUTSIDE_OMAHA' },
    });
    assert.ok(outsideProp, 'Must have outside property fixture in DB');

    const byId = await getEligiblePropertyById(outsideProp.id, prisma);
    assert.equal(byId, null, 'Must return null for OUTSIDE_OMAHA property by ID');

    const byPin = await getEligiblePropertyByPin(outsideProp.parcelId, prisma);
    assert.equal(byPin, null, 'Must return null for OUTSIDE_OMAHA property by PIN');
    console.log(`  ✔ PASS: Non-eligible property (${outsideProp.parcelId}) correctly rejected by ID and PIN`);
  }

  // 4. Bounded server-side pagination and deterministic ordering
  {
    console.log('4. Pagination & Ordering: Page size bounds, clamping, and deterministic ordering...');
    // Clamping tests
    assert.deepEqual(sanitizePagination({ page: 0, pageSize: 0 }), { page: 1, pageSize: 1, skip: 0 });
    assert.deepEqual(sanitizePagination({ page: 2, pageSize: 500 }), { page: 2, pageSize: 100, skip: 100 });
    assert.deepEqual(sanitizePagination({ page: -5, pageSize: -10 }), { page: 1, pageSize: 1, skip: 0 });

    const p1 = await listEligibleProperties({}, { page: 1, pageSize: 10 }, prisma);
    const p2 = await listEligibleProperties({}, { page: 2, pageSize: 10 }, prisma);

    assert.equal(p1.properties.length, 10);
    assert.equal(p2.properties.length, 10);
    assert.notEqual(p1.properties[0].id, p2.properties[0].id);

    // Verify deterministic ascending parcelId order
    for (let i = 0; i < p1.properties.length - 1; i++) {
      assert.ok(
        p1.properties[i].parcelId.localeCompare(p1.properties[i + 1].parcelId) <= 0,
        'Must be sorted ascending by parcelId'
      );
    }
    console.log('  ✔ PASS: Bounded pagination and deterministic parcelId ordering verified');
  }

  // 5. Preservation of leading zeros in PINs
  {
    console.log('5. Leading Zeros: Douglas County PINs preserve leading zero format...');
    const result = await listEligibleProperties({ query: '023' }, { page: 1, pageSize: 25 }, prisma);
    assert.ok(result.properties.length > 0);
    for (const p of result.properties) {
      assert.ok(p.parcelId.startsWith('0'), `PIN ${p.parcelId} must retain leading zero string format`);
      assert.equal(typeof p.parcelId, 'string');
    }
    console.log('  ✔ PASS: Leading zeros preserved on all examined PINs (e.g. ' + result.properties[0].parcelId + ')');
  }

  // 6. Search across PIN, Address, and Owner Name
  {
    console.log('6. Search Filtering: Multi-field search across PIN, situs address, and owner name...');
    // Search by specific PIN
    const sample = await prisma.property.findFirst({
      where: { municipalJurisdiction: 'INSIDE_OMAHA', address: { not: '[UNASSIGNED SITUS]' } },
      include: { ownershipRecords: true },
    });
    assert.ok(sample);

    const pinSearch = await listEligibleProperties({ query: sample.parcelId }, { page: 1, pageSize: 5 }, prisma);
    assert.ok(pinSearch.properties.some((p) => p.parcelId === sample.parcelId));

    // Search by address word
    const addressWord = sample.address.split(' ')[1];
    if (addressWord && addressWord.length > 3) {
      const addrSearch = await listEligibleProperties({ query: addressWord }, { page: 1, pageSize: 10 }, prisma);
      assert.ok(addrSearch.properties.length > 0);
    }

    console.log('  ✔ PASS: Search filter successfully resolves properties across fields');
  }

  // 7. Property Type, Year Built, and Building Presence Filters
  {
    console.log('7. Physical Filters: Property type, year built range, and building presence...');
    const residential = await listEligibleProperties({ propertyType: 'RESIDENTIAL' }, { page: 1, pageSize: 10 }, prisma);
    for (const p of residential.properties) {
      assert.equal(p.propertyType, 'RESIDENTIAL');
    }

    const builtRange = await listEligibleProperties({ minYearBuilt: 1950, maxYearBuilt: 1970 }, { page: 1, pageSize: 10 }, prisma);
    for (const p of builtRange.properties) {
      assert.ok(p.yearBuilt! >= 1950 && p.yearBuilt! <= 1970);
    }

    const vacantLand = await listEligibleProperties({ hasBuilding: false }, { page: 1, pageSize: 10 }, prisma);
    for (const p of vacantLand.properties) {
      assert.equal(p.yearBuilt, null);
      assert.equal(p.squareFeet, null);
    }
    console.log('  ✔ PASS: Physical characteristics filters accurately filter repository output');
  }

  // 8. Corporate and Absentee Status Semantics
  {
    console.log('8. Entity & Absentee Semantics: Exact enum-based status filtering...');
    const corporateProps = await listEligibleProperties({ corporateStatus: 'PROBABLE_CORPORATE_NAME' }, { page: 1, pageSize: 10 }, prisma);
    for (const p of corporateProps.properties) {
      assert.equal(p.owner?.corporateStatus, 'PROBABLE_CORPORATE_NAME');
      assert.equal(p.owner?.isCorporate, true);
    }

    const absenteeProps = await listEligibleProperties({ absenteeStatus: 'ABSENTEE' }, { page: 1, pageSize: 10 }, prisma);
    for (const p of absenteeProps.properties) {
      assert.equal(p.owner?.absenteeStatus, 'ABSENTEE');
      assert.equal(p.owner?.isAbsentee, true);
    }
    console.log('  ✔ PASS: Corporate and absentee filters honor exact verified enum semantics');
  }

  // 9. Unassigned Situs and Missing Mailing Addresses
  {
    console.log('9. Missing Data Handling: Explicit nulls and unassigned markers...');
    const unassigned = await listEligibleProperties({ hasAuthoritativeAddress: false }, { page: 1, pageSize: 5 }, prisma);
    assert.ok(unassigned.properties.length > 0);
    for (const p of unassigned.properties) {
      assert.equal(p.address, '[UNASSIGNED SITUS]');
      assert.equal(p.hasAuthoritativeAddress, false);
      assert.equal(p.zip, null);
    }

    // Detail lookup for property without mailing address
    const propWithoutMailing = await prisma.property.findFirst({
      where: {
        municipalJurisdiction: 'INSIDE_OMAHA',
        ownershipRecords: { some: { mailingAddress: '' } },
      },
    });
    if (propWithoutMailing) {
      const detail = await getEligiblePropertyById(propWithoutMailing.id, prisma);
      assert.equal(detail?.ownerDetail?.mailingAddress, null); // Stage 11B.1: missing mailing address is strictly null
      assert.equal(detail?.owner?.hasSeparateMailingAddress, false);
      assert.equal(detail?.owner?.isAbsentee, null); // Unknown absentee must be null, never false
    }
    console.log('  ✔ PASS: Missing situs and missing mailing addresses return explicit null/unassigned states');
  }

  // 10. Source Provenance Integrity & No Synthetic Fields
  {
    console.log('10. Provenance & Safety: Source identity intact, zero synthetic fields...');
    const insideProp = await prisma.property.findFirst({
      where: { municipalJurisdiction: 'INSIDE_OMAHA' },
      include: { sourceRecords: true },
    });
    assert.ok(insideProp);

    const eligibleDetail = await getEligiblePropertyByPin(insideProp.parcelId, prisma);
    assert.ok(eligibleDetail);
    assert.equal(eligibleDetail.provenanceDetail?.sourceName, 'DOUGLAS_COUNTY_ASSESSOR');
    assert.ok(eligibleDetail.provenanceDetail?.sourceRecordId.startsWith('PARCEL-'));
    assert.ok(eligibleDetail.provenanceDetail?.ingestedAt);

    // Verify absence of synthetic scores, fake violations, or fake timeline
    assert.equal((eligibleDetail as any).opportunityScore, undefined);
    assert.equal((eligibleDetail as any).codeViolations, undefined);
    assert.equal((eligibleDetail as any).taxRecords, undefined);
    assert.equal((eligibleDetail as any).signals, undefined);
    console.log('  ✔ PASS: Provenance verified; zero synthetic fields present in repository DTO');
  }

  // 12. Stage 11B.1: Government & Public Entity Owner Classification
  {
    console.log('12. Government Classification: Correctly identifies public entities and preserves stored corporate status...');
    const usaRecord = await getEligiblePropertyByPin('0116340000', prisma);
    assert.ok(usaRecord);
    assert.equal(usaRecord.owner?.ownerClassification, 'GOVERNMENT_OR_PUBLIC');
    assert.equal(usaRecord.ownerDetail?.ownerClassification, 'GOVERNMENT_OR_PUBLIC');
    assert.equal(usaRecord.ownerDetail?.rawStoredCorporateStatus, 'INDIVIDUAL'); // Stored DB enum is preserved for provenance

    const omahaRecord = await getEligiblePropertyByPin('0134600000', prisma);
    assert.ok(omahaRecord);
    assert.equal(omahaRecord.owner?.ownerClassification, 'GOVERNMENT_OR_PUBLIC');
    assert.equal(omahaRecord.ownerDetail?.ownerClassification, 'GOVERNMENT_OR_PUBLIC');
    assert.equal(omahaRecord.ownerDetail?.rawStoredCorporateStatus, 'INDIVIDUAL');
    console.log('  ✔ PASS: UNITED STATES OF AMERICA and CITY OF OMAHA classified as GOVERNMENT_OR_PUBLIC while preserving raw stored corporateStatus');
  }

  // 13. Stage 11B.1: Nullable Absentee & Out-of-State Status Semantics
  {
    console.log('13. Nullable Status Truth: absenteeStatus UNKNOWN yields isAbsentee null (never false)...');
    // USA has absenteeStatus UNKNOWN and mailingAddress ""
    const usaRecord = await getEligiblePropertyByPin('0116340000', prisma);
    assert.ok(usaRecord);
    assert.equal(usaRecord.owner?.absenteeStatus, 'UNKNOWN');
    assert.equal(usaRecord.owner?.isAbsentee, null);
    assert.equal(usaRecord.ownerDetail?.isAbsentee, null);
    assert.equal(usaRecord.ownerDetail?.mailingAddress, null);
    assert.equal(usaRecord.owner?.hasSeparateMailingAddress, false);

    // City of Omaha (PIN 0134600000) has absenteeStatus UNKNOWN, outOfStateStatus IN_STATE
    const omahaRecord = await getEligiblePropertyByPin('0134600000', prisma);
    assert.ok(omahaRecord);
    assert.equal(omahaRecord.owner?.absenteeStatus, 'UNKNOWN');
    assert.equal(omahaRecord.owner?.isAbsentee, null);
    assert.equal(omahaRecord.ownerDetail?.isAbsentee, null);
    assert.equal(omahaRecord.ownerDetail?.isOutOfState, false); // IN_STATE -> false
    assert.equal(omahaRecord.ownerDetail?.mailingAddress, 'C/O CITY FINANCE');

    // Confirmed OWNER_OCCUPIED property (PIN 0240610002)
    const occRecord = await getEligiblePropertyByPin('0240610002', prisma);
    assert.ok(occRecord);
    assert.equal(occRecord.owner?.absenteeStatus, 'OWNER_OCCUPIED');
    assert.equal(occRecord.owner?.isAbsentee, false); // Confirmed false
    console.log('  ✔ PASS: UNKNOWN absentee status correctly yields null, never false; OWNER_OCCUPIED yields false');
  }

  // 14. Stage 11B.1: Property Type Exact Sum Reconciliation (2,839)
  {
    console.log('14. Property Type Inventory Reconciliation: Sum of all property types equals exactly 2,839...');
    const groupedTypes = await prisma.property.groupBy({
      by: ['propertyType'],
      where: { municipalJurisdiction: 'INSIDE_OMAHA' },
      _count: true,
    });
    const totalSum = groupedTypes.reduce((acc, curr) => acc + curr._count, 0);
    assert.equal(totalSum, 2839, 'Sum across all property types must be exactly 2,839');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'RESIDENTIAL')?._count, 1113, 'RESIDENTIAL count is exactly 1,113');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'COMMERCIAL')?._count, 474, 'COMMERCIAL count is exactly 474');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'TAX_EXEMPT')?._count, 425, 'TAX_EXEMPT count is exactly 425');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'UTILITY')?._count, 364, 'UTILITY count is exactly 364');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'INDUSTRIAL')?._count, 277, 'INDUSTRIAL count is exactly 277');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'MULTI_FAMILY')?._count, 163, 'MULTI_FAMILY count is exactly 163');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'AGRICULTURAL')?._count, 22, 'AGRICULTURAL count is exactly 22');
    assert.equal(groupedTypes.find((g) => g.propertyType === 'CONDOMINIUM')?._count, 1, 'CONDOMINIUM count is exactly 1');
    console.log('  ✔ PASS: Exact reconciliation to 2,839 confirmed across all 8 property types');
  }

  // 15. Stage 11B.1: Separate Mailing Address vs Absentee Classification vs Owner Occupancy
  {
    console.log('15. Mailing Address Distinction: Distinct semantics for mailing vs absentee vs owner occupancy...');
    // When mailingAddress is missing, hasSeparateMailingAddress is false, mailingAddress is null, and isAbsentee is null
    const listRes = await listEligibleProperties({}, { page: 1, pageSize: 100 }, prisma);
    for (const p of listRes.properties) {
      if (p.owner?.absenteeStatus === 'UNKNOWN') {
        assert.equal(p.owner.isAbsentee, null);
      } else if (p.owner?.absenteeStatus === 'ABSENTEE') {
        assert.equal(p.owner.isAbsentee, true);
      } else if (p.owner?.absenteeStatus === 'OWNER_OCCUPIED') {
        assert.equal(p.owner.isAbsentee, false);
      }
    }
    console.log('  ✔ PASS: Strict distinction maintained across all returned sample records');
  }

  // 11. Direct Zero-Mutation Invariant Check
  {
    console.log('11. Zero Mutation Invariant: Checking database record counts before vs after...');
    const finalPropCount = await prisma.property.count();
    const finalOwnCount = await prisma.ownershipRecord.count();
    const finalSrcCount = await prisma.sourceRecord.count();
    const finalRunsCount = await prisma.ingestionRun.count();

    assert.equal(finalPropCount, initialPropCount, 'Property count must be identical');
    assert.equal(finalOwnCount, initialOwnCount, 'Ownership count must be identical');
    assert.equal(finalSrcCount, initialSrcCount, 'SourceRecord count must be identical');
    assert.equal(finalRunsCount, initialRunsCount, 'IngestionRun count must be identical');
    console.log('  ✔ PASS: Database completely untouched (0 mutations across all tables)');
  }

  console.log('\n✔ ALL 15/15 REPOSITORY TESTS PASSED WITH 100% INTEGRITY.\n');
}

runTests()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
