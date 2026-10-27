import assert from 'node:assert/strict';
import { linkUnmatchedTaxLiens } from '../tax-lien-linker';

console.log('=== CONSERVATIVE TAX LIEN LINKER UNIT TESTS ===\n');

async function runTaxLienLinkerTests() {
  // Test 1: Exact PIN match on single property
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-1', sourcePin: '0123456789', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
    ];

    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async () => liensTable.filter((l) => l.propertyId === null || l.matchStatus === 'UNMATCHED_COUNTY_PIN'),
        update: async ({ where, data }: any) => {
          const l = liensTable.find((x) => x.id === where.id);
          if (l) Object.assign(l, data);
          return l;
        },
      },
      property: {
        findMany: async ({ where }: any) => propertiesTable.filter((p) => where.parcelId.in.includes(p.parcelId)),
      },
    };

    const res = await linkUnmatchedTaxLiens(mockPrisma, { dryRun: false });
    assert.equal(res.totalEvaluated, 1);
    assert.equal(res.linkedCount, 1);
    assert.equal(res.unmatchedCount, 0);
    assert.equal(liensTable[0].propertyId, 'prop-1');
    assert.equal(liensTable[0].matchStatus, 'MATCHED_TO_CANONICAL_PROPERTY');
    console.log('✔ PASS [Test 1]: Exact 10-digit PIN match links to single canonical property');
  }

  // Test 2: Unmatched PIN when property does not exist in inventory
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-2', sourcePin: '9999999999', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
    ];

    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async () => liensTable.filter((l) => l.propertyId === null || l.matchStatus === 'UNMATCHED_COUNTY_PIN'),
        update: async () => {},
      },
      property: {
        findMany: async ({ where }: any) => propertiesTable.filter((p) => where.parcelId.in.includes(p.parcelId)),
      },
    };

    const res = await linkUnmatchedTaxLiens(mockPrisma, { dryRun: false });
    assert.equal(res.totalEvaluated, 1);
    assert.equal(res.linkedCount, 0);
    assert.equal(res.unmatchedCount, 1);
    assert.equal(liensTable[0].propertyId, null);
    console.log('✔ PASS [Test 2]: Non-existent PIN remains safely unmatched');
  }

  // Test 3: Multiple candidate properties matching same PIN -> Fails Closed to QUARANTINED_MALFORMED
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
      { id: 'prop-2', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-3', sourcePin: '0123456789', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
    ];

    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async () => liensTable.filter((l) => l.propertyId === null || l.matchStatus === 'UNMATCHED_COUNTY_PIN'),
        update: async ({ where, data }: any) => {
          const l = liensTable.find((x) => x.id === where.id);
          if (l) Object.assign(l, data);
          return l;
        },
      },
      property: {
        findMany: async ({ where }: any) => propertiesTable.filter((p) => where.parcelId.in.includes(p.parcelId)),
      },
    };

    const res = await linkUnmatchedTaxLiens(mockPrisma, { dryRun: false });
    assert.equal(res.totalEvaluated, 1);
    assert.equal(res.linkedCount, 0);
    assert.equal(res.ambiguousQuarantinedCount, 1);
    assert.equal(liensTable[0].propertyId, null);
    assert.equal(liensTable[0].matchStatus, 'QUARANTINED_MALFORMED');
    console.log('✔ PASS [Test 3]: Duplicate property PIN ambiguity fails closed to QUARANTINED_MALFORMED');
  }

  // Test 4: Idempotent rerun produces 0 new links and 0 mutations
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-1', sourcePin: '0123456789', propertyId: 'prop-1', matchStatus: 'MATCHED_TO_CANONICAL_PROPERTY' },
    ];

    let updateCount = 0;
    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async () => liensTable.filter((l) => l.propertyId === null || l.matchStatus === 'UNMATCHED_COUNTY_PIN'),
        update: async () => { updateCount++; },
      },
      property: {
        findMany: async () => propertiesTable,
      },
    };

    const res = await linkUnmatchedTaxLiens(mockPrisma, { dryRun: false });
    assert.equal(res.totalEvaluated, 0);
    assert.equal(res.linkedCount, 0);
    assert.equal(updateCount, 0);
    console.log('✔ PASS [Test 4]: Idempotent rerun produces zero redundant updates');
  }

  // Test 5: Dry-run simulation mode does not write to database
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-1', sourcePin: '0123456789', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
    ];

    let writeExecuted = false;
    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async () => liensTable.filter((l) => l.propertyId === null || l.matchStatus === 'UNMATCHED_COUNTY_PIN'),
        update: async () => { writeExecuted = true; },
      },
      property: {
        findMany: async ({ where }: any) => propertiesTable.filter((p) => where.parcelId.in.includes(p.parcelId)),
      },
    };

    const res = await linkUnmatchedTaxLiens(mockPrisma, { dryRun: true });
    assert.equal(res.linkedCount, 1);
    assert.equal(writeExecuted, false);
    assert.equal(liensTable[0].propertyId, null);
    console.log('✔ PASS [Test 5]: Dry-run mode evaluates candidates without mutating state');
  }

  // Test 6: Bounded limit and explicit targetIds
  {
    const propertiesTable = [
      { id: 'prop-1', parcelId: '0123456789', municipalJurisdiction: 'INSIDE_OMAHA' },
      { id: 'prop-2', parcelId: '9876543210', municipalJurisdiction: 'INSIDE_OMAHA' },
    ];
    const liensTable = [
      { id: 'lien-1', sourcePin: '0123456789', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
      { id: 'lien-2', sourcePin: '9876543210', propertyId: null, matchStatus: 'UNMATCHED_COUNTY_PIN' },
    ];

    const mockPrisma: any = {
      taxLienRecord: {
        findMany: async ({ where, take }: any) => {
          let list = liensTable;
          if (where?.id?.in) {
            list = list.filter((l) => where.id.in.includes(l.id));
          }
          if (take) {
            list = list.slice(0, take);
          }
          return list;
        },
        update: async ({ where, data }: any) => {
          const l = liensTable.find((x) => x.id === where.id);
          if (l) Object.assign(l, data);
          return l;
        },
      },
      property: {
        findMany: async ({ where }: any) => propertiesTable.filter((p) => where.parcelId.in.includes(p.parcelId)),
      },
    };

    // Test with explicit targetIds
    const res = await linkUnmatchedTaxLiens(mockPrisma, { targetIds: ['lien-1'], dryRun: false });
    assert.equal(res.totalEvaluated, 1);
    assert.equal(res.linkedCount, 1);
    assert.equal(liensTable[0].propertyId, 'prop-1');
    assert.equal(liensTable[1].propertyId, null);
    console.log('✔ PASS [Test 6]: Explicit targetIds bounds evaluation strictly to designated record');
  }

  console.log('\n======================================================');
  console.log('ALL 6/6 TAX LIEN LINKER UNIT TESTS PASSED');
  console.log('======================================================\n');
}

runTaxLienLinkerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
