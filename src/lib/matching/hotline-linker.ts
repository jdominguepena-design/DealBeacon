import { PrismaClient, Prisma } from '@prisma/client';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  evaluateHotlineCandidate,
  normalizeStreetAddress,
  ParcelSpatialCandidate,
  HotlineCandidateInput,
  MatchEvaluationResult,
} from './hotline-matcher';

export interface HotlineMatchBatchOptions {
  batchSize?: number;
  dryRun?: boolean;
  limit?: number;
}

export interface HotlineMatchBatchResult {
  totalEvaluated: number;
  linkedConfirmedCount: number;
  ambiguousConflictCount: number;
  ambiguousMultiParcelCount: number;
  excludedInfrastructureCount: number;
  excludedRightOfWayCount: number;
  spatialOnlyUnlinkedCount: number;
  unmatchedCount: number;
  alreadyMatchedCount: number;
  errors: string[];
}

/**
 * DealBeacon — Conservative Omaha Hotline Property Matching Pipeline.
 *
 * Rules:
 * 1. Prioritizes exact normalized address match with city/ZIP validation.
 * 2. Excludes public infrastructure (potholes, traffic signals, road signs).
 * 3. Spatial polygon containment requires independent street name corroboration;
 *    unverified spatial containment is never treated as confirmed private property match.
 * 4. Strictly distinguishes citizen complaints/requests ('UNVERIFIED_COMPLAINT') from confirmed violations.
 * 5. Fails closed on address or parcel ambiguity without linking.
 * 6. Preserves original complaint attributes, event dates, and source provenance.
 * 7. Fully idempotent across reruns.
 */
export async function matchOmahaHotlineReports(
  prisma: PrismaClient | Prisma.TransactionClient,
  options: HotlineMatchBatchOptions = {}
): Promise<HotlineMatchBatchResult> {
  const { dryRun = false, limit } = options;

  const result: HotlineMatchBatchResult = {
    totalEvaluated: 0,
    linkedConfirmedCount: 0,
    ambiguousConflictCount: 0,
    ambiguousMultiParcelCount: 0,
    excludedInfrastructureCount: 0,
    excludedRightOfWayCount: 0,
    spatialOnlyUnlinkedCount: 0,
    unmatchedCount: 0,
    alreadyMatchedCount: 0,
    errors: [],
  };

  // 1. Fetch eligible properties with geometry and authoritative address
  const properties = await prisma.property.findMany({
    where: {
      hasAuthoritativeAddress: true,
      geometryGeoJson: { not: Prisma.JsonNull },
    },
    select: {
      id: true,
      parcelId: true,
      address: true,
      city: true,
      zip: true,
      geometryGeoJson: true,
    },
  });

  const parcelSpatialList: ParcelSpatialCandidate[] = [];
  const addressIndex = new Map<string, ParcelSpatialCandidate[]>();

  for (const p of properties) {
    let polyFeature: Feature<Polygon | MultiPolygon> | null = null;
    if (p.geometryGeoJson) {
      try {
        const feat = turf.feature(p.geometryGeoJson as any);
        if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
          polyFeature = feat as Feature<Polygon | MultiPolygon>;
        }
      } catch {
        // ignore malformed geometry
      }
    }

    if (polyFeature) {
      const candidate: ParcelSpatialCandidate = {
        id: p.id,
        parcelId: p.parcelId,
        address: p.address,
        normalizedAddress: normalizeStreetAddress(p.address),
        polygon: polyFeature,
      };

      parcelSpatialList.push(candidate);

      if (candidate.normalizedAddress) {
        if (!addressIndex.has(candidate.normalizedAddress)) {
          addressIndex.set(candidate.normalizedAddress, []);
        }
        addressIndex.get(candidate.normalizedAddress)!.push(candidate);
      }
    }
  }

  // 2. Fetch Hotline candidate reports
  const reports = await prisma.hotlineReport.findMany({
    where: {
      OR: [
        { matchStatus: 'UNMATCHED' },
        { propertyId: null },
      ],
    },
    select: {
      id: true,
      requestId: true,
      reportCategory: true,
      problemType: true,
      locationText: true,
      latitude: true,
      longitude: true,
      matchStatus: true,
      propertyId: true,
    },
    orderBy: { sourceObjectId: 'asc' },
    take: limit,
  });

  result.totalEvaluated = reports.length;

  for (const r of reports) {
    const input: HotlineCandidateInput = {
      requestId: r.requestId,
      reportCategory: r.reportCategory,
      problemType: r.problemType,
      locationText: r.locationText,
      latitude: r.latitude,
      longitude: r.longitude,
    };

    const evaluation = evaluateHotlineCandidate(input, parcelSpatialList, addressIndex);

    let matchStatus = 'UNMATCHED';
    let matchMethod: string | null = null;
    let matchConfidence: string | null = null;
    let propertyIdToLink: string | null = null;

    switch (evaluation.classification) {
      case 'DUAL_EVIDENCE_CANDIDATE':
        matchStatus = 'CONFIRMED';
        matchMethod = 'EXACT_ADDR_AND_POLYGON';
        matchConfidence = 'HIGH';
        propertyIdToLink = evaluation.candidateParcelId;
        result.linkedConfirmedCount++;
        break;

      case 'ADDRESS_ONLY_CANDIDATE':
        // Address matches single parcel; offset coordinate in street corridor
        if (evaluation.distanceToPolygonMeters !== null && evaluation.distanceToPolygonMeters <= 20) {
          matchStatus = 'CONFIRMED';
          matchMethod = 'EXACT_ADDRESS_CURBSIDE_OFFSET';
          matchConfidence = 'HIGH';
          propertyIdToLink = evaluation.candidateParcelId;
          result.linkedConfirmedCount++;
        } else {
          // Distant offset: leave unlinked and route to review
          matchStatus = 'PROBABLE_UNRESOLVED';
          matchMethod = 'DISTANT_ADDRESS_OFFSET';
          matchConfidence = 'MEDIUM';
          propertyIdToLink = null;
          result.unmatchedCount++;
        }
        break;

      case 'SPATIAL_ONLY_CANDIDATE':
        // Point is in polygon but address text differs or is absent
        // Conservative rule: Do NOT link automatically without address verification
        matchStatus = 'PROBABLE_UNRESOLVED';
        matchMethod = 'POLYGON_ONLY_UNVERIFIED_ADDR';
        matchConfidence = 'LOW';
        propertyIdToLink = null;
        result.spatialOnlyUnlinkedCount++;
        break;

      case 'AMBIGUOUS_MULTI_PARCEL':
        matchStatus = 'AMBIGUOUS_MULTI_PARCEL';
        matchMethod = 'AMBIGUOUS_MULTI_MATCH';
        matchConfidence = 'UNRESOLVED';
        propertyIdToLink = null;
        result.ambiguousMultiParcelCount++;
        break;

      case 'AMBIGUOUS_CONFLICT':
        matchStatus = 'AMBIGUOUS_CONFLICT';
        matchMethod = 'ADDRESS_COORDINATE_CONFLICT';
        matchConfidence = 'UNRESOLVED';
        propertyIdToLink = null;
        result.ambiguousConflictCount++;
        break;

      case 'EXCLUDED_PUBLIC_INFRASTRUCTURE':
        matchStatus = 'EXCLUDED_INFRASTRUCTURE';
        matchMethod = 'CATEGORY_INFRASTRUCTURE_FILTER';
        matchConfidence = 'EXCLUDED_INFRASTRUCTURE';
        propertyIdToLink = null;
        result.excludedInfrastructureCount++;
        break;

      case 'EXCLUDED_RIGHT_OF_WAY':
        matchStatus = 'EXCLUDED_INFRASTRUCTURE';
        matchMethod = 'RIGHT_OF_WAY_CORRIDOR_FILTER';
        matchConfidence = 'EXCLUDED_INFRASTRUCTURE';
        propertyIdToLink = null;
        result.excludedRightOfWayCount++;
        break;

      case 'UNMATCHED':
      default:
        matchStatus = 'UNMATCHED';
        matchMethod = 'UNRESOLVED';
        matchConfidence = 'UNRESOLVED';
        propertyIdToLink = null;
        result.unmatchedCount++;
        break;
    }

    if (!dryRun) {
      await prisma.hotlineReport.update({
        where: { id: r.id },
        data: {
          propertyId: propertyIdToLink,
          matchStatus,
          matchMethod,
          matchConfidence,
          matchAuditJson: {
            classification: evaluation.classification,
            candidatePin: evaluation.candidatePin,
            candidateAddress: evaluation.candidateAddress,
            spatialContainment: evaluation.spatialContainment,
            distanceToPolygonMeters: evaluation.distanceToPolygonMeters,
            addressMatch: evaluation.addressMatch,
            notes: evaluation.locationConsistencyNotes,
            evaluatedAt: new Date().toISOString(),
          } as any,
          matchedAt: propertyIdToLink ? new Date() : null,
        },
      });
    }
  }

  return result;
}
