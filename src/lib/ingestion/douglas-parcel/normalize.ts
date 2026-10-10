import { createHash } from 'crypto';
import { DOUGLAS_PARCEL_CONFIG } from './config';
import {
  AbsenteeStatus,
  CorporateStatus,
  DouglasParcelFeature,
  NormalizedParcelRecord,
  OutOfStateStatus,
} from './types';

/**
 * Standardize an address string for comparison (USPS Pub 28 guidelines).
 */
export function normalizeAddressForComparison(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toUpperCase()
    .replace(/[#.,;:'"\-]/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/\bHIGHWAY\b/g, 'HWY')
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .replace(/\bNORTHEAST\b/g, 'NE')
    .replace(/\bNORTHWEST\b/g, 'NW')
    .replace(/\bSOUTHEAST\b/g, 'SE')
    .replace(/\bSOUTHWEST\b/g, 'SW')
    .replace(/\bSUITE\b/g, 'STE')
    .replace(/\bAPARTMENT\b/g, 'APT')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps county parcel classification code and building description conservatively.
 * Avoids assuming all residential ('R') parcels are SINGLE_FAMILY.
 */
export function mapPropertyTypeConservatively(
  countyClass: string | null | undefined,
  buildingDesc: string | null | undefined
): string {
  const desc = (buildingDesc ?? '').toUpperCase();
  const cls = (countyClass ?? '').toUpperCase().trim();

  // 1. Precise structure description if present
  if (desc.includes('CONDO')) return 'CONDOMINIUM';
  if (desc.includes('TOWNHOUSE') || desc.includes('TOWNHOME')) return 'TOWNHOUSE';
  if (desc.includes('DUPLEX')) return 'DUPLEX';
  if (desc.includes('TRIPLEX') || desc.includes('FOURPLEX')) return 'MULTI_FAMILY';
  if (desc.includes('SINGLE FAMILY') || desc.includes('SINGLE-FAMILY')) return 'SINGLE_FAMILY';

  // 2. County classification mapping without over-assuming
  switch (cls) {
    case 'R':
      // Conservative: Preserves as general RESIDENTIAL when specific single-family confirmation is absent
      return 'RESIDENTIAL';
    case 'C':
      return 'COMMERCIAL';
    case 'M':
      return 'MULTI_FAMILY';
    case 'I':
      return 'INDUSTRIAL';
    case 'F':
      return 'AGRICULTURAL';
    case 'E':
      return 'TAX_EXEMPT';
    case 'U':
      return 'UTILITY';
    default:
      return 'OTHER';
  }
}

/**
 * Evaluates absentee ownership status conservatively.
 * Incomplete or missing addresses yield UNKNOWN.
 */
export function evaluateAbsenteeStatus(
  situsAddress: string | null | undefined,
  situsZip: string | null | undefined,
  mailingAddress: string | null | undefined,
  mailingZip: string | null | undefined
): { status: AbsenteeStatus; isAbsentee: boolean; note?: string } {
  const normSitus = normalizeAddressForComparison(situsAddress);
  const normMailing = normalizeAddressForComparison(mailingAddress);
  const cleanSitusZip = (situsZip ?? '').trim().slice(0, 5);
  const cleanMailingZip = (mailingZip ?? '').trim().slice(0, 5);

  if (!normMailing || normMailing === 'UNKNOWN' || normMailing === 'CONFIDENTIAL') {
    return { status: 'UNKNOWN', isAbsentee: false, note: 'Missing or confidential mailing address' };
  }

  if (!normSitus) {
    return { status: 'UNKNOWN', isAbsentee: false, note: 'Missing situs property address' };
  }

  // If mailing address is a PO BOX, verify zip code
  if (normMailing.startsWith('PO BOX') || normMailing.includes('P O BOX')) {
    if (cleanMailingZip && cleanSitusZip && cleanMailingZip !== cleanSitusZip) {
      return { status: 'ABSENTEE', isAbsentee: true, note: 'PO Box in different zip code' };
    }
    return { status: 'UNKNOWN', isAbsentee: false, note: 'PO Box in local or unspecified zip code' };
  }

  // Direct address comparison
  if (normSitus === normMailing) {
    return { status: 'OWNER_OCCUPIED', isAbsentee: false, note: 'Mailing address matches situs address' };
  }

  // If street addresses differ
  return { status: 'ABSENTEE', isAbsentee: true, note: 'Mailing street differs from situs address' };
}

/**
 * Evaluates out-of-state status conservatively.
 */
export function evaluateOutOfStateStatus(
  ownerState: string | null | undefined
): { status: OutOfStateStatus; isOutOfState: boolean } {
  if (!ownerState || typeof ownerState !== 'string') {
    return { status: 'UNKNOWN', isOutOfState: false };
  }

  const clean = ownerState.trim().toUpperCase();
  if (!clean || clean.length !== 2) {
    return { status: 'UNKNOWN', isOutOfState: false };
  }

  if (clean === 'NE') {
    return { status: 'IN_STATE', isOutOfState: false };
  }

  return { status: 'OUT_OF_STATE', isOutOfState: true };
}

/**
 * Evaluates corporate ownership status conservatively.
 * Avoids asserting corporate status solely from weak or ambiguous name patterns.
 */
export function evaluateCorporateStatus(
  ownerName: string | null | undefined
): { status: CorporateStatus; isCorporate: boolean } {
  if (!ownerName || typeof ownerName !== 'string') {
    return { status: 'UNKNOWN', isCorporate: false };
  }

  const clean = ownerName.trim().toUpperCase();
  if (!clean || clean === 'CONFIDENTIAL') {
    return { status: 'UNKNOWN', isCorporate: false };
  }

  // Strong, explicit legal corporate and financial entity identifiers
  const strongCorporateRegex =
    /\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LP|L\.P\.|LLP|L\.L\.P\.|LTD|COMPANY|CO|BANK|FEDERAL CREDIT UNION|N\.A\.|NATIONAL ASSOCIATION)\b/i;

  if (strongCorporateRegex.test(clean)) {
    return { status: 'PROBABLE_CORPORATE_NAME', isCorporate: true };
  }

  return { status: 'INDIVIDUAL', isCorporate: false };
}

/**
 * Computes planar polygon area and centroid using Green's Theorem.
 */
export function computeRingAreaAndCentroid(
  ring: number[][]
): { area: number; cx: number; cy: number } | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0];
    const y0 = ring[i][1];
    const x1 = ring[i + 1][0];
    const y1 = ring[i + 1][1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return null;
  cx /= 6 * area;
  cy /= 6 * area;
  return { area, cx, cy };
}

/**
 * Computes area-weighted polygon centroid and GeoJSON coordinates supporting
 * multipart polygons and interior holes without vertex-density bias.
 */
export function parsePolygonGeometry(rings?: number[][][]): {
  centroid: { lat: number; lon: number } | null;
  geoJson: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } | null;
} {
  if (!rings || !Array.isArray(rings) || rings.length === 0) {
    return { centroid: null, geoJson: null };
  }

  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (const ring of rings) {
    const computed = computeRingAreaAndCentroid(ring);
    if (computed) {
      const absArea = Math.abs(computed.area);
      totalArea += absArea;
      weightedX += computed.cx * absArea;
      weightedY += computed.cy * absArea;
    }
  }

  const centroid =
    totalArea > 0
      ? {
          lon: Number((weightedX / totalArea).toFixed(6)),
          lat: Number((weightedY / totalArea).toFixed(6)),
        }
      : null;

  return {
    centroid,
    geoJson: {
      type: 'Polygon',
      coordinates: rings,
    },
  };
}

/**
 * Computes deterministic content fingerprint for parcel change detection.
 */
export function computeParcelContentFingerprint(attrs: Record<string, any>): string {
  const keyVals = [
    `pin:${attrs.PIN ?? ''}`,
    `addr:${attrs.PROPERTY_A ?? ''}`,
    `owner:${attrs.OWNER_NAME ?? ''}`,
    `mail:${attrs.ADDRESS1 ?? ''}`,
    `mzip:${attrs.OWNER_ZIP ?? ''}`,
    `cls:${attrs.CLASS ?? ''}`,
    `bldg:${attrs.BLDG_SF ?? ''}`,
    `yr:${attrs.BLDG_YRBLT ?? ''}`,
  ].join('|');

  return createHash('sha256').update(keyVals).digest('hex').substring(0, 16);
}

/**
 * Normalizes a raw Douglas County ArcGIS parcel feature into DealBeacon DTO.
 */
export function normalizeDouglasParcel(feature: DouglasParcelFeature): NormalizedParcelRecord | null {
  const { attributes, geometry } = feature;
  if (!attributes || !attributes.OBJECTID || !attributes.PIN) {
    return null;
  }

  const pin = attributes.PIN.trim();
  if (!pin) return null;

  const rawPropCity = attributes.PROP_CITY ? attributes.PROP_CITY.trim() : null;
  const city = rawPropCity || 'Omaha';

  // Address integrity: strictly distinguish authoritative situs from unassigned parcels
  const rawAddress = (attributes.PROPERTY_A ?? '').trim();
  const hasAuthoritativeAddress = Boolean(rawAddress && rawAddress !== 'UNKNOWN');
  const address = hasAuthoritativeAddress ? rawAddress : '[UNASSIGNED SITUS]';

  // Do NOT fabricate default 68102 zip code when source zip is missing
  const rawZip = (attributes.PROP_ZIP ?? '').trim();
  const zip = rawZip ? rawZip.slice(0, 5) : '';

  const { centroid, geoJson } = parsePolygonGeometry(geometry?.rings);

  const absentee = hasAuthoritativeAddress
    ? evaluateAbsenteeStatus(
        address,
        zip,
        attributes.ADDRESS1,
        attributes.OWNER_ZIP
      )
    : { status: 'UNKNOWN' as const, isAbsentee: false, note: 'Situs address unassigned' };

  const outOfState = evaluateOutOfStateStatus(attributes.OWNER_STAT);
  const corporate = evaluateCorporateStatus(attributes.OWNER_NAME);

  const evaluationNotes: string[] = [];
  if (!hasAuthoritativeAddress) evaluationNotes.push('Notice: Unassigned source situs address');
  if (absentee.note) evaluationNotes.push(absentee.note);
  evaluationNotes.push(`Absentee: ${absentee.status}`);
  evaluationNotes.push(`Out of State: ${outOfState.status}`);
  evaluationNotes.push(`Corporate: ${corporate.status}`);

  const contentHash = computeParcelContentFingerprint(attributes);

  // Legal description synthesis
  const legalParts = [
    attributes.ADDITION_N,
    attributes.BLOCK ? `BLK ${attributes.BLOCK}` : null,
    attributes.LOT ? `LOT ${attributes.LOT}` : null,
    attributes.LEGAL1,
  ].filter(Boolean);
  const legalDescription = legalParts.length > 0 ? legalParts.join(' ').trim() : null;

  const propertyType = mapPropertyTypeConservatively(attributes.CLASS, attributes.BLDG_DESC);

  return {
    parcelId: pin,
    sourceObjectId: attributes.OBJECTID,
    address,
    hasAuthoritativeAddress,
    city,
    rawPropCity,
    state: 'NE',
    zip,
    propertyType,
    countyClass: attributes.CLASS ? attributes.CLASS.trim() : null,
    buildingDesc: attributes.BLDG_DESC ? attributes.BLDG_DESC.trim() : null,
    yearBuilt: typeof attributes.BLDG_YRBLT === 'number' && attributes.BLDG_YRBLT > 1800 ? attributes.BLDG_YRBLT : null,
    squareFeet: typeof attributes.BLDG_SF === 'number' && attributes.BLDG_SF > 0 ? Math.round(attributes.BLDG_SF) : null,
    lotSizeSqFt: typeof attributes.SQ_FEET === 'number' && attributes.SQ_FEET > 0 ? Math.round(attributes.SQ_FEET) : null,
    condition: attributes.CONDITION ? attributes.CONDITION.trim() : null,
    quality: attributes.QUALITY ? attributes.QUALITY.trim() : null,
    dcaAccountType: attributes.DCAACCTYPE ? attributes.DCAACCTYPE.trim() : null,
    legalDescription,
    assessorUrl: attributes.ASSESSOR ? attributes.ASSESSOR.trim() : null,
    treasurerUrl: attributes.TREASURER ? attributes.TREASURER.trim() : null,
    latitude: centroid?.lat ?? null,
    longitude: centroid?.lon ?? null,
    geometryGeoJson: geoJson,

    ownerName: (attributes.OWNER_NAME ?? 'UNKNOWN').trim(),
    mailingAddress: (attributes.ADDRESS1 ?? '').trim(),
    mailingCity: (attributes.OWNER_CITY ?? '').trim(),
    mailingState: (attributes.OWNER_STAT ?? '').trim().toUpperCase(),
    mailingZip: (attributes.OWNER_ZIP ?? '').trim().slice(0, 5),
    absenteeStatus: absentee.status,
    isAbsentee: absentee.isAbsentee,
    outOfStateStatus: outOfState.status,
    isOutOfState: outOfState.isOutOfState,
    corporateStatus: corporate.status,
    isCorporate: corporate.isCorporate,
    ownershipEvaluationNotes: evaluationNotes,

    contentHash,
    sanitizedPayload: {
      ...attributes,
      centroid,
    },
  };
}
