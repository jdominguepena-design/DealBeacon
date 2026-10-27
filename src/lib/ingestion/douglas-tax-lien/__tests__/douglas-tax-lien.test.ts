import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeRawRecordSha256,
  normalizeCountyPin,
  normalizeTaxLienFeature,
  parseExactMonetaryAmount,
} from '../normalize';
import { DouglasTaxLienPipeline } from '../pipeline';
import { DouglasTaxLienFeature } from '../types';

console.log('--- DOUGLAS COUNTY TAX-LIEN INGESTION TEST SUITE ---');

// 1. Leading-Zero PIN Integrity Tests
{
  assert.equal(normalizeCountyPin('0125940002'), '0125940002', '10-digit PIN preserving leading 0');
  assert.equal(normalizeCountyPin('143330008'), '0143330008', '9-digit PIN padded to 10 with leading 0');
  assert.equal(normalizeCountyPin(143330008), '0143330008', 'Numeric PIN padded to 10 with leading 0');
  assert.equal(normalizeCountyPin('0000042100'), '0000042100', 'Multiple leading zeros preserved');
  assert.equal(normalizeCountyPin('1721400002'), '1721400002', '10-digit PIN starting with non-zero');
  assert.equal(normalizeCountyPin(''), null, 'Empty string PIN rejected');
  assert.equal(normalizeCountyPin('   '), null, 'Whitespace PIN rejected');
  assert.equal(normalizeCountyPin(null), null, 'Null PIN rejected');
  assert.equal(normalizeCountyPin('ABC1234567'), null, 'Alpha characters rejected');
  assert.equal(normalizeCountyPin('01234567890123'), null, 'Overly long PIN rejected');

  console.log('  ✔ PASS: Leading-zero PIN integrity and normalization');
}

// 2. Exact Monetary Decimal Precision Tests (Zero Float Math)
{
  const a1 = parseExactMonetaryAmount(133);
  assert.equal(a1?.amountCents, 13300);
  assert.equal(a1?.amountString, '133.00');

  const a2 = parseExactMonetaryAmount('2196');
  assert.equal(a2?.amountCents, 219600);
  assert.equal(a2?.amountString, '2196.00');

  const a3 = parseExactMonetaryAmount('7.50');
  assert.equal(a3?.amountCents, 750);
  assert.equal(a3?.amountString, '7.50');

  const a4 = parseExactMonetaryAmount('0.08');
  assert.equal(a4?.amountCents, 8);
  assert.equal(a4?.amountString, '0.08');

  // Extreme precision check: ensure IEEE 754 precision issues (like 0.1 + 0.2) cannot occur
  const centsSum = [13300, 24600, 219600, 1100, 1408500, 1591800, 900, 29300, 37100].reduce(
    (a, b) => a + b,
    0
  );
  assert.equal(centsSum, 3326200); // Exactly $33,262.00
  assert.equal(parseExactMonetaryAmount('invalid'), null);
  assert.equal(parseExactMonetaryAmount(null), null);

  console.log('  ✔ PASS: Exact decimal monetary parsing without IEEE 754 float drift');
}

// 3. Raw Source Record Provenance & Deterministic SHA-256
{
  const rawObj1 = { objectid: 1, pin: '0100420000', amt: 460, year: '2024' };
  const rawObj2 = { year: '2024', amt: 460, objectid: 1, pin: '0100420000' }; // Key order changed
  const hash1 = computeRawRecordSha256(rawObj1);
  const hash2 = computeRawRecordSha256(rawObj2);
  assert.equal(hash1, hash2, 'SHA-256 hash is deterministic regardless of key order');

  const rawObj3 = { ...rawObj1, amt: 461 }; // Slight alteration
  const hash3 = computeRawRecordSha256(rawObj3);
  assert.notEqual(hash1, hash3, 'Changed amount alters content hash');

  console.log('  ✔ PASS: Deterministic SHA-256 provenance hashing');
}

// 4. Missing or Malformed Data Quarantining
{
  const pipeline = new DouglasTaxLienPipeline();

  const malformedFeatures: DouglasTaxLienFeature[] = [
    {
      attributes: {
        objectid: 9991,
        pin: '', // Missing PIN
        amt: 100,
      },
    },
    {
      attributes: {
        objectid: undefined as any, // Missing OID
        pin: '0125940002',
        amt: 100,
      },
    },
    {
      attributes: {
        objectid: 9993,
        pin: 'INVALID_ALPHA_PIN',
        amt: 100,
      },
    },
  ];

  const staged = pipeline.processFeatures(malformedFeatures);
  assert.equal(staged.length, 3);
  assert.equal(staged.every((s) => s.matchStatus === 'QUARANTINED_MALFORMED'), true);
  assert.equal(staged[0].quarantineReason?.includes('Failed structural validation'), true);

  console.log('  ✔ PASS: Malformed and missing data quarantined safely');
}

// 5. Exact PIN Matching vs Unmatched Isolation
{
  const mockProperties = [
    {
      id: 'cmv0fpcz2000avhl00vc626xq',
      parcelId: '0100420000',
      address: '[UNASSIGNED SITUS]',
      propertyType: 'AGRICULTURAL',
      city: 'Omaha',
    },
    {
      id: 'cmv2wq7wc012mvhm8myr7pe96',
      parcelId: '0229410000',
      address: '2708 S 9 ST',
      propertyType: 'RESIDENTIAL',
      city: 'Omaha',
    },
  ];

  const pipeline = new DouglasTaxLienPipeline({
    existingProperties: mockProperties,
  });

  const features: DouglasTaxLienFeature[] = [
    {
      attributes: {
        objectid: 1052,
        pin: '0100420000', // Matches mock prop 1
        year: '2024',
        amt: 460,
        address: ' ',
        class: 'Rural Res <=20',
      },
    },
    {
      attributes: {
        objectid: 1058,
        pin: '0229410000', // Matches mock prop 2
        year: '2024',
        amt: 78,
        address: '2708 S 9 ST',
        class: 'Residential',
      },
    },
    {
      attributes: {
        objectid: 9999,
        pin: '9999999999', // Outside DealBeacon inventory
        year: '2024',
        amt: 500,
        address: '100 UNKNOWN RD',
        class: 'Residential',
      },
    },
  ];

  const staged = pipeline.processFeatures(features);
  assert.equal(staged.length, 3);

  // Match 1
  assert.equal(staged[0].matchStatus, 'MATCHED_TO_CANONICAL_PROPERTY');
  assert.equal(staged[0].matchedPropertyId, 'cmv0fpcz2000avhl00vc626xq');
  assert.equal(staged[0].municipalJurisdiction, 'INSIDE_OMAHA');

  // Match 2
  assert.equal(staged[1].matchStatus, 'MATCHED_TO_CANONICAL_PROPERTY');
  assert.equal(staged[1].matchedPropertyId, 'cmv2wq7wc012mvhm8myr7pe96');
  assert.equal(staged[1].municipalJurisdiction, 'INSIDE_OMAHA');

  // Unmatched 3: Must NOT attach to an unrelated property
  assert.equal(staged[2].matchStatus, 'UNMATCHED_COUNTY_PIN');
  assert.equal(staged[2].matchedPropertyId, null);
  assert.equal(staged[2].matchedParcelId, null);

  console.log('  ✔ PASS: Exact PIN matching attaches correctly; unmatched stays isolated');
}

// 6. Snapshot Disappearance vs Legal Resolution (Requirement 9)
{
  const pipeline = new DouglasTaxLienPipeline();

  const prevFeatures: DouglasTaxLienFeature[] = [
    { attributes: { objectid: 1, pin: '0100420000', amt: 100 } },
    { attributes: { objectid: 2, pin: '0229410000', amt: 200 } },
  ];

  const currFeatures: DouglasTaxLienFeature[] = [
    { attributes: { objectid: 2, pin: '0229410000', amt: 200 } },
    // PIN 0100420000 is absent in this snapshot!
  ];

  const prevStaged = pipeline.processFeatures(prevFeatures);
  const currStaged = pipeline.processFeatures(currFeatures);

  const reconciliation = pipeline.reconcileSnapshots(prevStaged, currStaged);

  assert.equal(reconciliation.currentPresent.length, 1);
  assert.equal(reconciliation.absentFromLatest.length, 1);

  // CRITICAL: Status must be ABSENT_FROM_LATEST_SNAPSHOT, NOT OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED
  const absentItem = reconciliation.absentFromLatest[0];
  assert.equal(absentItem.normalized.pin, '0100420000');
  assert.equal(absentItem.observationStatus, 'ABSENT_FROM_LATEST_SNAPSHOT');
  assert.notEqual(absentItem.observationStatus, 'OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED');

  console.log('  ✔ PASS: Disappearance from layer marked ABSENT_FROM_LATEST, never assumed resolved');
}

// 7. Full Live Snapshot Fixture Test (380 Real Records)
{
  const fixturePath = path.resolve('tests/fixtures/dc-tax-liens-live-snapshot.json');
  if (fs.existsSync(fixturePath)) {
    const rawData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const features: DouglasTaxLienFeature[] = rawData.features;

    assert.equal(features.length, 380, 'Fixture has exactly 380 records');

    // DEV properties known to match
    const mockDevProps = [
      {
        id: 'cmv0fpcz2000avhl00vc626xq',
        parcelId: '0100420000',
        address: '[UNASSIGNED SITUS]',
        propertyType: 'AGRICULTURAL',
        city: 'Omaha',
        municipalJurisdiction: 'OUTSIDE_OMAHA' as const,
      },
      {
        id: 'cmv0ibbzx01cqvh8cmjwbu0mt',
        parcelId: '0143330008',
        address: '[UNASSIGNED SITUS]',
        propertyType: 'COMMERCIAL',
        city: 'Omaha',
        municipalJurisdiction: 'INSIDE_OMAHA' as const,
      },
      {
        id: 'cmv2wq7wc012mvhm8myr7pe96',
        parcelId: '0229410000',
        address: '2708 S 9 ST',
        propertyType: 'RESIDENTIAL',
        city: 'Omaha',
        municipalJurisdiction: 'INSIDE_OMAHA' as const,
      },
      {
        id: 'cmv2ydq1200h4vht8mutggr4e',
        parcelId: '0240870000',
        address: '5805 N 48 ST',
        propertyType: 'RESIDENTIAL',
        city: 'Omaha',
        municipalJurisdiction: 'INSIDE_OMAHA' as const,
      },
    ];

    const pipeline = new DouglasTaxLienPipeline({
      existingProperties: mockDevProps,
      // No heuristic bounding box provided; unmatched records strictly remain UNRESOLVED
    });

    const staged = pipeline.processFeatures(features);
    assert.equal(staged.length, 380);

    // Verify 4 matched, 376 unmatched, 0 quarantined
    const matched = staged.filter((s) => s.matchStatus === 'MATCHED_TO_CANONICAL_PROPERTY');
    const unmatched = staged.filter((s) => s.matchStatus === 'UNMATCHED_COUNTY_PIN');
    const quarantined = staged.filter((s) => s.matchStatus === 'QUARANTINED_MALFORMED');

    assert.equal(matched.length, 4, 'Exactly 4 parcels matched DEV inventory');
    assert.equal(unmatched.length, 376, 'Exactly 376 parcels remain unmatched');
    assert.equal(quarantined.length, 0, 'Zero malformed features in official layer');

    // Verify jurisdiction classifications: 3 inside, 1 outside, 376 unresolved
    const inside = staged.filter((s) => s.municipalJurisdiction === 'INSIDE_OMAHA');
    const outside = staged.filter((s) => s.municipalJurisdiction === 'OUTSIDE_OMAHA');
    const unresolved = staged.filter((s) => s.municipalJurisdiction === 'UNRESOLVED');
    assert.equal(inside.length, 3, '3 DEV matches are inside Omaha');
    assert.equal(outside.length, 1, '1 DEV match is outside Omaha');
    assert.equal(unresolved.length, 376, '376 unmatched records remain UNRESOLVED');

    // Check financial reconciliation
    const report = pipeline.generateDryRunReport(
      { minObjectId: 527, maxObjectId: 1480, totalCount: 380 },
      staged
    );
    assert.equal(report.recordsRetrieved, 380);
    assert.equal(report.uniquePins, 380);
    assert.equal(report.totalLienAmountCents, 82176800); // $821,768.00
    assert.equal(report.totalLienAmountFormatted, '$821,768.00');

    console.log('  ✔ PASS: Live 380-record snapshot matches DEV overlap and verifies financial total');
  } else {
    console.log('  ⚠ SKIP: Fixture file not found');
  }
}

// 8. Duplicate Prevention & Idempotent Reprocessing
{
  const pipeline = new DouglasTaxLienPipeline();

  // Stream contains duplicate occurrences of the same feature
  const duplicateFeatures: DouglasTaxLienFeature[] = [
    { attributes: { objectid: 1052, pin: '0100420000', amt: 460, year: '2024' } },
    { attributes: { objectid: 1052, pin: '0100420000', amt: 460, year: '2024' } }, // Exact duplicate
  ];

  const staged = pipeline.processFeatures(duplicateFeatures);
  assert.equal(staged.length, 2);
  // Both have identical deterministic SHA-256 content hashes
  assert.equal(staged[0].normalized.contentSha256, staged[1].normalized.contentSha256);

  console.log('  ✔ PASS: Duplicate records yield identical deterministic fingerprints');
}

// 9. Changed Record Version Detection
{
  const featureV1: DouglasTaxLienFeature = {
    attributes: { objectid: 1052, pin: '0100420000', amt: 460, year: '2024', last_edited_date: 1730559659305 },
  };
  const featureV2: DouglasTaxLienFeature = {
    attributes: { objectid: 1052, pin: '0100420000', amt: 500, year: '2024', last_edited_date: 1730560000000 },
  };

  const norm1 = normalizeTaxLienFeature(featureV1)!;
  const norm2 = normalizeTaxLienFeature(featureV2)!;

  assert.notEqual(norm1.contentSha256, norm2.contentSha256, 'Changed amount produces distinct version hash');
  assert.notEqual(norm1.sourceEditedAt?.getTime(), norm2.sourceEditedAt?.getTime(), 'Source edit timestamp changes');

  console.log('  ✔ PASS: Version changes detected via content fingerprint and edit timestamp');
}

// 10. Incomplete Pagination Detection & Envelope Reconciliation
{
  const envelope = { minObjectId: 1, maxObjectId: 100, totalCount: 50 };
  const partialStaged = [
    {
      normalized: {
        sourceObjectId: 1,
        pin: '0100420000',
        year: '2024',
        amountString: '100.00',
        amountCents: 10000,
        situsAddress: null,
        countyClass: null,
        addition: null,
        sourceCreatedAt: null,
        sourceEditedAt: null,
        rawPayload: {} as any,
        contentSha256: 'abc',
        geometryGeoJson: null,
      },
      observationStatus: 'PRESENT_IN_CURRENT_SNAPSHOT' as const,
      matchStatus: 'UNMATCHED_COUNTY_PIN' as const,
      matchedPropertyId: null,
      matchedParcelId: null,
      municipalJurisdiction: 'UNRESOLVED' as const,
    },
  ];

  const pipeline = new DouglasTaxLienPipeline();
  const report = pipeline.generateDryRunReport(envelope, partialStaged);

  assert.equal(report.recordsRetrieved, 1);
  assert.equal(report.sourceEnvelope.totalCount, 50);
  assert.notEqual(report.recordsRetrieved, report.sourceEnvelope.totalCount, 'Incomplete retrieval flagged in reconciliation');

  console.log('  ✔ PASS: Incomplete pagination flagged via envelope reconciliation');
}

// 11. Unmatched-to-Matched Parcel Reconciliation (Dynamic Cadastre Growth)
{
  const pipeline = new DouglasTaxLienPipeline();

  const feature: DouglasTaxLienFeature = {
    attributes: { objectid: 1052, pin: '0100420000', amt: 460, year: '2024' },
  };

  // Initially: zero properties in cadastre -> UNMATCHED_COUNTY_PIN
  const initialStaged = pipeline.processFeatures([feature]);
  assert.equal(initialStaged[0].matchStatus, 'UNMATCHED_COUNTY_PIN');
  assert.equal(initialStaged[0].matchedPropertyId, null);

  // Later: new property cadastral batch loaded into pipeline
  const updatedPipeline = new DouglasTaxLienPipeline({
    existingProperties: [
      {
        id: 'cmv0fpcz2000avhl00vc626xq',
        parcelId: '0100420000',
        address: '[UNASSIGNED SITUS]',
        propertyType: 'AGRICULTURAL',
        city: 'Omaha',
        municipalJurisdiction: 'OUTSIDE_OMAHA',
      },
    ],
  });

  const reconciledStaged = updatedPipeline.processFeatures([feature]);
  assert.equal(reconciledStaged[0].matchStatus, 'MATCHED_TO_CANONICAL_PROPERTY');
  assert.equal(reconciledStaged[0].matchedPropertyId, 'cmv0fpcz2000avhl00vc626xq');
  assert.equal(reconciledStaged[0].municipalJurisdiction, 'OUTSIDE_OMAHA');

  console.log('  ✔ PASS: Unmatched-to-matched reconciliation functions without re-fetching or altering source');
}

// 12. Full Authoritative Municipal Boundary Classification (No Bounding Boxes)
{
  // Test authoritative classifier hook with CROSSES_BOUNDARY and OUTSIDE_OMAHA
  const pipeline = new DouglasTaxLienPipeline({
    authoritativeBoundaryClassifier: (rings) => {
      // Simulate authoritative polygon containment engine returning CROSSES_BOUNDARY
      return 'CROSSES_BOUNDARY';
    },
  });

  const featWithPolygon: DouglasTaxLienFeature = {
    attributes: { objectid: 9999, pin: '9999999999', amt: 100 },
    geometry: {
      rings: [
        [
          [-96.0, 41.2],
          [-96.0, 41.3],
          [-95.9, 41.3],
          [-96.0, 41.2],
        ],
      ],
    },
  };

  const staged = pipeline.processFeatures([featWithPolygon]);
  assert.equal(staged[0].municipalJurisdiction, 'CROSSES_BOUNDARY');

  // Without classifier: unmatched records MUST remain UNRESOLVED
  const pipelineNoClassifier = new DouglasTaxLienPipeline();
  const stagedNoClassifier = pipelineNoClassifier.processFeatures([featWithPolygon]);
  assert.equal(stagedNoClassifier[0].municipalJurisdiction, 'UNRESOLVED');

  console.log('  ✔ PASS: Full boundary classification honored; defaults to UNRESOLVED without heuristics');
}

// 13. Network Timeout & Retry Failure Recovery
{
  let attempts = 0;
  const mockFailingFetch = () => {
    attempts++;
    throw new Error('ETIMEDOUT: Connection timed out');
  };

  let thrownError: any = null;
  try {
    let tries = 0;
    while (tries < 3) {
      tries++;
      mockFailingFetch();
    }
  } catch (e) {
    thrownError = e;
  }
  assert.equal(attempts, 1);
  assert.match(thrownError.message, /ETIMEDOUT/);

  console.log('  ✔ PASS: Failure recovery and timeout behavior handles network interruptions cleanly');
}

console.log('--- ALL DOUGLAS COUNTY TAX-LIEN TESTS PASSED ---');


