import { PrismaClient } from '@prisma/client';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  evaluateHotlineCandidate,
  normalizeStreetAddress,
  ParcelSpatialCandidate,
  HotlineCandidateInput,
  CandidateMatchClassification,
  MatchEvaluationResult,
} from './hotline-matcher';

const prisma = new PrismaClient();

export interface HotlineReviewItemDTO {
  reportId: string;
  requestId: string | null;
  reportCategory: string | null;
  problemType: string | null;
  originalLocationText: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  reportedAt: Date | null;
  evaluation: MatchEvaluationResult;
  isValidationSample: boolean;
}

export interface HotlineReviewDatasetDTO {
  totalReports: number;
  totalParcelsIndexed: number;
  classificationCounts: Record<CandidateMatchClassification, number>;
  validationSampleCount: number;
  items: HotlineReviewItemDTO[];
}

// In-memory cache for the evaluation results to keep UI lightning-fast and 100% read-only
let cachedReviewDataset: HotlineReviewDatasetDTO | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache for stable read-only review session

export async function getHotlineReviewDataset(): Promise<HotlineReviewDatasetDTO> {
  const now = Date.now();
  if (cachedReviewDataset && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedReviewDataset;
  }

  // 1. Load all 2,839 eligible Omaha parcels (zero write)
  const parcels = await prisma.property.findMany({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
    select: {
      id: true,
      parcelId: true,
      address: true,
      hasAuthoritativeAddress: true,
      geometryGeoJson: true,
    },
  });

  const parcelSpatialList: ParcelSpatialCandidate[] = [];
  const addressIndex = new Map<string, ParcelSpatialCandidate[]>();

  for (const p of parcels) {
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

      if (p.hasAuthoritativeAddress && candidate.normalizedAddress) {
        if (!addressIndex.has(candidate.normalizedAddress)) {
          addressIndex.set(candidate.normalizedAddress, []);
        }
        addressIndex.get(candidate.normalizedAddress)!.push(candidate);
      }
    }
  }

  // 2. Load all 2,459 Hotline reports
  const reports = await prisma.hotlineReport.findMany({
    select: {
      id: true,
      requestId: true,
      reportCategory: true,
      problemType: true,
      locationText: true,
      latitude: true,
      longitude: true,
      status: true,
      reportedAt: true,
    },
    orderBy: { sourceObjectId: 'asc' },
  });

  const classificationCounts: Record<CandidateMatchClassification, number> = {
    DUAL_EVIDENCE_CANDIDATE: 0,
    SPATIAL_ONLY_CANDIDATE: 0,
    ADDRESS_ONLY_CANDIDATE: 0,
    AMBIGUOUS_MULTI_PARCEL: 0,
    AMBIGUOUS_CONFLICT: 0,
    EXCLUDED_PUBLIC_INFRASTRUCTURE: 0,
    EXCLUDED_RIGHT_OF_WAY: 0,
    UNMATCHED: 0,
  };

  // Quotas for deterministic 50-record validation sample
  const sampleQuotas: Record<CandidateMatchClassification, number> = {
    DUAL_EVIDENCE_CANDIDATE: 15,
    SPATIAL_ONLY_CANDIDATE: 10,
    ADDRESS_ONLY_CANDIDATE: 5,
    EXCLUDED_PUBLIC_INFRASTRUCTURE: 10,
    EXCLUDED_RIGHT_OF_WAY: 5,
    UNMATCHED: 5,
    AMBIGUOUS_MULTI_PARCEL: 0,
    AMBIGUOUS_CONFLICT: 0,
  };

  const sampleCounts: Record<CandidateMatchClassification, number> = {
    DUAL_EVIDENCE_CANDIDATE: 0,
    SPATIAL_ONLY_CANDIDATE: 0,
    ADDRESS_ONLY_CANDIDATE: 0,
    EXCLUDED_PUBLIC_INFRASTRUCTURE: 0,
    EXCLUDED_RIGHT_OF_WAY: 0,
    UNMATCHED: 0,
    AMBIGUOUS_MULTI_PARCEL: 0,
    AMBIGUOUS_CONFLICT: 0,
  };

  const items: HotlineReviewItemDTO[] = [];
  let totalValidationSamples = 0;

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
    classificationCounts[evaluation.classification]++;

    let isSample = false;
    if (sampleCounts[evaluation.classification] < sampleQuotas[evaluation.classification]) {
      sampleCounts[evaluation.classification]++;
      isSample = true;
      totalValidationSamples++;
    }

    items.push({
      reportId: r.id,
      requestId: r.requestId,
      reportCategory: r.reportCategory,
      problemType: r.problemType,
      originalLocationText: r.locationText,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status,
      reportedAt: r.reportedAt,
      evaluation,
      isValidationSample: isSample,
    });
  }

  cachedReviewDataset = {
    totalReports: reports.length,
    totalParcelsIndexed: parcelSpatialList.length,
    classificationCounts,
    validationSampleCount: totalValidationSamples,
    items,
  };
  cacheTimestamp = now;

  return cachedReviewDataset;
}
