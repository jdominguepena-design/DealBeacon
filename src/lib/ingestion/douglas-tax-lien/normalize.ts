import { createHash } from 'crypto';
import {
  ArcGISPolygonGeometry,
  DouglasTaxLienFeature,
  NormalizedTaxLienRecord,
} from './types';

/**
 * Normalizes a raw Douglas County Parcel ID (PIN) strictly as a 10-character string.
 * Retains leading zeros.
 * Returns null if the PIN cannot be cleanly normalized to 10 characters.
 */
export function normalizeCountyPin(rawPin: any): string | null {
  if (rawPin === null || rawPin === undefined) return null;
  const pinStr = String(rawPin).trim();
  if (!pinStr) return null;

  // Disallow non-numeric characters in Douglas County PINs
  if (!/^\d+$/.test(pinStr)) {
    return null;
  }

  // If already 10 digits
  if (pinStr.length === 10) {
    return pinStr;
  }

  // If fewer than 10 digits, pad with leading zeros (up to 10 digits)
  if (pinStr.length < 10) {
    return pinStr.padStart(10, '0');
  }

  // If longer than 10 digits, it's invalid for standard Douglas County PIN
  return null;
}

/**
 * Safely parses an integer or decimal amount into exact integer cents and a formatted string.
 * Never uses floating-point multiplication (avoids IEEE 754 precision issues).
 */
export function parseExactMonetaryAmount(rawAmt: any): {
  amountCents: number;
  amountString: string;
} | null {
  if (rawAmt === null || rawAmt === undefined) return null;
  const str = String(rawAmt).trim();
  if (!str) return null;

  // Matches integer or decimal numbers: e.g. "133", "133.00", "2196.50", "0.08"
  const match = str.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    return null;
  }

  const dollarsStr = match[1];
  const centsPart = (match[2] || '').padEnd(2, '0');

  const dollars = parseInt(dollarsStr, 10);
  const cents = parseInt(centsPart, 10);
  const totalCents = dollars * 100 + cents;

  const amountString = `${dollars}.${centsPart.padStart(2, '0')}`;

  return {
    amountCents: totalCents,
    amountString,
  };
}

/**
 * Parses an ArcGIS millisecond epoch timestamp into a Date object or null.
 */
export function parseArcGISTimestamp(timestamp: number | null | undefined): Date | null {
  if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp);
}

/**
 * Converts ESRI ArcGIS rings format to standard GeoJSON Polygon or MultiPolygon.
 */
export function parseArcGISPolygonGeometry(
  geometry?: ArcGISPolygonGeometry
): { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } | null {
  if (!geometry?.rings || !Array.isArray(geometry.rings) || geometry.rings.length === 0) {
    return null;
  }

  // ESRI rings can be Polygon (exterior + optional holes)
  return {
    type: 'Polygon',
    coordinates: geometry.rings,
  };
}

/**
 * Computes a deterministic full SHA-256 hex digest of the raw source record payload.
 */
export function computeRawRecordSha256(payload: Record<string, any>): string {
  // Deterministic JSON stringification
  const keys = Object.keys(payload).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of keys) {
    sortedObj[k] = payload[k];
  }
  return createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

/**
 * Normalizes a raw Douglas County tax-lien feature into a validated NormalizedTaxLienRecord.
 * Returns null if the record fails structural requirements (missing OID or unparsable PIN).
 */
export function normalizeTaxLienFeature(
  feature: DouglasTaxLienFeature
): NormalizedTaxLienRecord | null {
  const { attributes, geometry } = feature;
  if (!attributes || typeof attributes.objectid !== 'number') {
    return null;
  }

  const normalizedPin = normalizeCountyPin(attributes.pin);
  if (!normalizedPin) {
    return null;
  }

  const parsedAmount = parseExactMonetaryAmount(attributes.amt) || {
    amountCents: 0,
    amountString: '0.00',
  };

  const rawAddress = (attributes.address ?? '').trim();
  const situsAddress = rawAddress.length > 0 ? rawAddress : null;

  const countyClass = (attributes.class ?? '').trim() || null;
  const addition = (attributes.addition ?? '').trim() || null;
  const year = (attributes.year ?? '').trim() || null;

  const sourceCreatedAt = parseArcGISTimestamp(attributes.created_date);
  const sourceEditedAt = parseArcGISTimestamp(attributes.last_edited_date);

  const rawPayload = {
    ...attributes,
    ...(geometry ? { geometry } : {}),
  };

  const contentSha256 = computeRawRecordSha256(rawPayload);
  const geometryGeoJson = parseArcGISPolygonGeometry(geometry);

  return {
    sourceObjectId: attributes.objectid,
    pin: normalizedPin,
    year,
    amountString: parsedAmount.amountString,
    amountCents: parsedAmount.amountCents,
    situsAddress,
    countyClass,
    addition,
    sourceCreatedAt,
    sourceEditedAt,
    rawPayload,
    contentSha256,
    geometryGeoJson,
  };
}
