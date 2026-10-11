import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Point } from 'geojson';

export type CandidateMatchClassification =
  | 'DUAL_EVIDENCE_CANDIDATE'      // Address matches single parcel AND point is inside parcel polygon
  | 'SPATIAL_ONLY_CANDIDATE'       // Point is strictly inside parcel polygon, but report location text differs from parcel situs
  | 'ADDRESS_ONLY_CANDIDATE'       // Normalized address matches single parcel, but point is outside parcel polygon
  | 'AMBIGUOUS_MULTI_PARCEL'       // Point or address matches more than 1 parcel
  | 'AMBIGUOUS_CONFLICT'           // Address matches parcel A, but coordinate is inside parcel B
  | 'EXCLUDED_PUBLIC_INFRASTRUCTURE' // Potholes, road signs, traffic signals, street pavement
  | 'EXCLUDED_RIGHT_OF_WAY'        // Location text indicates intersection, highway ramp, or cross-street
  | 'UNMATCHED';                   // No spatial or address overlap with current inventory

export interface ParcelSpatialCandidate {
  id: string;
  parcelId: string;
  address: string;
  normalizedAddress: string;
  polygon: Feature<Polygon | MultiPolygon>;
}

export interface HotlineCandidateInput {
  requestId: string | null;
  reportCategory: string | null;
  problemType: string | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MatchEvaluationResult {
  classification: CandidateMatchClassification;
  candidateParcelId: string | null;
  candidatePin: string | null;
  candidateAddress: string | null;
  originalLocationText: string | null;
  normalizedReportAddress: string;
  spatialContainment: boolean;
  distanceToPolygonMeters: number | null; // Exact distance to parcel polygon edge (0 if inside, >0 if outside)
  addressMatch: boolean;
  locationConsistencyNotes: string;
  isRightOfWayProblemType: boolean;       // Flagged if problemType is inherently public ROW (curbs, street parking, sidewalks)
  hasRightOfWayProblemTypeWarning: boolean; // Flagged true when a candidate parcel is found but problemType is ROW-related
  isResponsibilityEstablished: false;     // Explicit invariant: location matching NEVER establishes legal/financial responsibility
  isOfficiallyVerifiedViolation: false;   // Explicit invariant: citizen report is NEVER an official code citation
}

/**
 * Strong regex indicating public highway, ramp, corridor, or cross-street intersection.
 */
export const INTERSECTION_AND_ROW_REGEX =
  /(?:&|\/|\b(?:AND|INTERSECTION|BETWEEN|CORNER OF|APPROX|NEAR|BLOCK OF|ROW|RAMP|HWY|HIGHWAY|INTERSTATE|I-\d+|US-\d+)\b)/i;

/**
 * Problem types that inherently concern public right-of-way, streets, curbs, sidewalks, or on-street vehicles.
 * Even if coordinates fall within or near a private parcel, these issues typically belong to the public domain.
 */
export const RIGHT_OF_WAY_PROBLEM_TYPES = new Set([
  'abandoned vehic(str)',
  'abandoned vehicle',
  'parking issue',
  'vehicle & licensing',
  'curb issue',
  'sidewalk/driveway',
  'sidewalk not cleared',
  'traffic hazard',
  'traffic signal',
  'pavement issue',
  'sign/barricade issue',
  'streetlight - oppd',
  'street light-repair',
]);

/**
 * Categories strictly pertaining to public infrastructure and streets, excluded from private parcel candidate matching.
 */
export const PUBLIC_INFRASTRUCTURE_CATEGORIES = new Set([
  'pothole',
  'road_signs_signals',
  'traffic',
]);

/**
 * Normalizes an address string for consistent comparison while preserving unit identifiers.
 * Handles:
 *  - Street ordinals: 1ST -> 1, 2ND -> 2, 3RD -> 3, 20TH -> 20
 *  - Standard suffixes: STREET -> ST, AVENUE -> AVE, HIGHWAY -> HWY, etc.
 *  - Cardinal directions: NORTH -> N, SOUTH -> S, EAST -> E, WEST -> W
 *  - Preserves unit / suite / apt tokens in normalized form (e.g. APT 3B, STE 100)
 *  - Punctuation and whitespace normalization
 */
export function normalizeStreetAddress(addr: string | null | undefined): string {
  if (!addr) return '';
  return addr
    .toUpperCase()
    // Strip punctuation except hyphens in unit numbers
    .replace(/[.,#]/g, ' ')
    // Normalize ordinals: e.g. 1st -> 1, 2nd -> 2, 3rd -> 3, 4th-99th -> 4-99
    .replace(/\b(\d+)(?:ST|ND|RD|TH)\b/g, '$1')
    // Normalize unit designations while keeping unit number/letter
    .replace(/\bSUITE\b/g, 'STE')
    .replace(/\bBUILDING\b/g, 'BLDG')
    .replace(/\bROOM\b/g, 'RM')
    .replace(/\bFLOOR\b/g, 'FL')
    .replace(/\bSPACE\b/g, 'SPC')
    // Normalize street suffixes
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/\bTERRACE\b/g, 'TER')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bHIGHWAY\b/g, 'HWY')
    .replace(/\bTRAIL\b/g, 'TRL')
    .replace(/\bWAY\b/g, 'WAY')
    // Normalize cardinal directions
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    // Normalize internal whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the base street address without unit/suite identifiers.
 * Used to check whether multiple parcels or condo units share a common base address.
 */
export function extractBaseStreetAddress(addr: string | null | undefined): string {
  const normalized = normalizeStreetAddress(addr);
  if (!normalized) return '';
  return normalized
    .replace(/\b(?:APT|STE|UNIT|BLDG|RM|LOT|SPC|FL|DEPT)\b.*$/i, '')
    .trim();
}

/**
 * Extracts the primary street address component before municipal/state suffixes.
 * e.g. "1701 Farnam St, Omaha, NE, 68102" -> "1701 FARNAM ST"
 */
export function extractCleanAddress(locationText: string | null | undefined): string {
  if (!locationText) return '';
  const firstSegment = locationText.split(',')[0].trim();
  return normalizeStreetAddress(firstSegment);
}

/**
 * Evaluates a single Hotline complaint against a collection of indexed parcels.
 * Pure deterministic function without database calls or state mutations.
 */
export function evaluateHotlineCandidate(
  report: HotlineCandidateInput,
  parcels: ParcelSpatialCandidate[],
  addressIndex: Map<string, ParcelSpatialCandidate[]>
): MatchEvaluationResult {
  const rawLocation = report.locationText?.trim() || '';
  const cleanAddr = extractCleanAddress(rawLocation);
  const problemLower = (report.problemType || '').toLowerCase();
  const isRowProblem = RIGHT_OF_WAY_PROBLEM_TYPES.has(problemLower);

  const baseResult: Omit<MatchEvaluationResult, 'classification' | 'locationConsistencyNotes'> = {
    candidateParcelId: null,
    candidatePin: null,
    candidateAddress: null,
    originalLocationText: report.locationText,
    normalizedReportAddress: cleanAddr,
    spatialContainment: false,
    distanceToPolygonMeters: null,
    addressMatch: false,
    isRightOfWayProblemType: isRowProblem,
    hasRightOfWayProblemTypeWarning: false,
    isResponsibilityEstablished: false,
    isOfficiallyVerifiedViolation: false,
  };

  const categoryLower = (report.reportCategory || '').toLowerCase();

  // 1. Exclude public infrastructure reports (Potholes, Road Signs, Signals, etc.)
  if (PUBLIC_INFRASTRUCTURE_CATEGORIES.has(categoryLower)) {
    return {
      ...baseResult,
      classification: 'EXCLUDED_PUBLIC_INFRASTRUCTURE',
      locationConsistencyNotes: `Excluded: category '${report.reportCategory}' describes public right-of-way infrastructure.`,
    };
  }

  // 2. Exclude intersections, highway ramps, and right-of-way corridor descriptions
  if (!rawLocation || INTERSECTION_AND_ROW_REGEX.test(rawLocation)) {
    return {
      ...baseResult,
      classification: 'EXCLUDED_RIGHT_OF_WAY',
      locationConsistencyNotes: `Excluded: location description '${rawLocation}' describes an intersection, highway ramp, or non-parcel corridor.`,
    };
  }

  // 3. Evaluate Coordinates & Spatial Polygon Containment
  const hasCoords = report.latitude !== null && report.longitude !== null;
  let pointFeature: Feature<Point> | null = null;
  if (hasCoords) {
    pointFeature = turf.point([report.longitude!, report.latitude!]) as Feature<Point>;
  }

  const containingParcels: ParcelSpatialCandidate[] = [];
  if (pointFeature) {
    for (const p of parcels) {
      if (turf.booleanPointInPolygon(pointFeature, p.polygon)) {
        containingParcels.push(p);
      }
    }
  }

  // 4. Evaluate Address Match
  // First, check exact normalized address match (which includes unit if specified)
  let matchingAddressParcels = cleanAddr ? addressIndex.get(cleanAddr) || [] : [];

  // If no exact match and the address contains a unit identifier, check if the base address matches parcels
  // If multiple parcels exist under the base address or unit identity is unresolved, classify as ambiguous
  const baseAddr = extractBaseStreetAddress(cleanAddr);
  if (matchingAddressParcels.length === 0 && baseAddr && baseAddr !== cleanAddr) {
    const baseMatches = addressIndex.get(baseAddr) || [];
    if (baseMatches.length > 1) {
      return {
        ...baseResult,
        classification: 'AMBIGUOUS_MULTI_PARCEL',
        spatialContainment: containingParcels.length > 0,
        addressMatch: true,
        locationConsistencyNotes: `Ambiguous: report specifies unit in '${rawLocation}' but ${baseMatches.length} parcels share base address '${baseAddr}'. Specific unit parcel unresolved.`,
      };
    } else if (baseMatches.length === 1) {
      // Single base parcel, but unit was specified in report and unverified on parcel record
      matchingAddressParcels = baseMatches;
    }
  }

  // 5. Ambiguity Check: Multiple parcels for either spatial or address
  if (containingParcels.length > 1 || matchingAddressParcels.length > 1) {
    return {
      ...baseResult,
      classification: 'AMBIGUOUS_MULTI_PARCEL',
      spatialContainment: containingParcels.length > 0,
      addressMatch: matchingAddressParcels.length > 0,
      locationConsistencyNotes: `Ambiguous: matched multiple parcels (spatial: ${containingParcels.length}, address: ${matchingAddressParcels.length}). Requires manual review.`,
    };
  }

  const spatialMatch = containingParcels[0] || null;
  const addressMatch = matchingAddressParcels[0] || null;

  // 6. Conflict Check: Address matches parcel A, but coordinate is inside parcel B
  if (spatialMatch && addressMatch && spatialMatch.id !== addressMatch.id) {
    return {
      ...baseResult,
      classification: 'AMBIGUOUS_CONFLICT',
      candidateParcelId: null,
      spatialContainment: true,
      addressMatch: true,
      locationConsistencyNotes: `Conflicting evidence: address matches parcel ${addressMatch.parcelId} (${addressMatch.address}), but coordinate falls inside parcel ${spatialMatch.parcelId} (${spatialMatch.address}).`,
    };
  }

  // 7. Case A: Dual Evidence Candidate (Address matches AND point is inside polygon)
  if (spatialMatch && addressMatch && spatialMatch.id === addressMatch.id) {
    const rowWarning = isRowProblem ? ' [WARNING: Problem type relates to public right-of-way/curb/vehicle; may not be a private property issue]' : '';
    return {
      ...baseResult,
      classification: 'DUAL_EVIDENCE_CANDIDATE',
      candidateParcelId: spatialMatch.id,
      candidatePin: spatialMatch.parcelId,
      candidateAddress: spatialMatch.address,
      spatialContainment: true,
      distanceToPolygonMeters: 0,
      addressMatch: true,
      hasRightOfWayProblemTypeWarning: isRowProblem,
      locationConsistencyNotes: `Dual-evidence candidate: report address and coordinates are consistent with parcel polygon.${rowWarning}`,
    };
  }

  // 8. Case B: Spatial Only Candidate (Point is inside parcel polygon, but address text is absent or differs)
  if (spatialMatch && !addressMatch) {
    const rowWarning = isRowProblem ? ' [WARNING: Problem type relates to public right-of-way/curb/vehicle; may not be a private property issue]' : '';
    return {
      ...baseResult,
      classification: 'SPATIAL_ONLY_CANDIDATE',
      candidateParcelId: spatialMatch.id,
      candidatePin: spatialMatch.parcelId,
      candidateAddress: spatialMatch.address,
      spatialContainment: true,
      distanceToPolygonMeters: 0,
      addressMatch: false,
      hasRightOfWayProblemTypeWarning: isRowProblem,
      locationConsistencyNotes: `Spatial-only candidate: point falls inside polygon of PIN ${spatialMatch.parcelId}, but report address '${rawLocation}' differs from situs '${spatialMatch.address}'.${rowWarning}`,
    };
  }

  // 9. Case C: Address Only Candidate (Address matches parcel, point is outside polygon)
  if (!spatialMatch && addressMatch) {
    let distanceToPolyMeters: number | null = null;
    if (pointFeature) {
      // Calculate exact distance from point to polygon boundary in meters (preserve true numeric distance)
      const distanceKm = turf.pointToLineDistance(pointFeature, turf.polygonToLine(addressMatch.polygon) as any, { units: 'kilometers' });
      distanceToPolyMeters = distanceKm * 1000;
    }

    const isDistant = distanceToPolyMeters !== null && distanceToPolyMeters > 20;
    const reviewFlag = isDistant ? ' [FLAGGED FOR MANDATORY HUMAN REVIEW: Distant offset in public corridor]' : '';
    const rowWarning = isRowProblem ? ' [WARNING: Problem type relates to public right-of-way/curb/vehicle; may not be a private property issue]' : '';

    const formattedDistanceDesc = distanceToPolyMeters !== null
      ? (distanceToPolyMeters < 0.1 ? '<0.1m' : `${(Math.round(distanceToPolyMeters * 10) / 10).toFixed(1)}m`)
      : 'unknown';

    return {
      ...baseResult,
      classification: 'ADDRESS_ONLY_CANDIDATE',
      candidateParcelId: addressMatch.id,
      candidatePin: addressMatch.parcelId,
      candidateAddress: addressMatch.address,
      spatialContainment: false,
      distanceToPolygonMeters: distanceToPolyMeters,
      addressMatch: true,
      hasRightOfWayProblemTypeWarning: isRowProblem,
      locationConsistencyNotes: `Address-only candidate: address matches parcel PIN ${addressMatch.parcelId}, but point is outside polygon boundary (distance: ${formattedDistanceDesc}).${reviewFlag}${rowWarning}`,
    };
  }

  // 10. Case D: Unmatched
  return {
    ...baseResult,
    classification: 'UNMATCHED',
    spatialContainment: false,
    addressMatch: false,
    locationConsistencyNotes: `Unmatched: no spatial containment or address correspondence within current eligible parcel inventory.`,
  };
}
