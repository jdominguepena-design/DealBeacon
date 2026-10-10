if (typeof window !== 'undefined') {
  throw new Error('This module can only be executed on the server.');
}
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { INVESTOR_ELIGIBLE_WHERE } from '../geo/eligibility';

/**
 * Filter parameters for querying eligible Omaha properties.
 */
export interface EligiblePropertyFilterParams {
  query?: string;           // Case-insensitive search across PIN, Address, or Owner Name
  propertyType?: string;    // e.g. RESIDENTIAL, COMMERCIAL, MULTI_FAMILY, INDUSTRIAL
  countyClass?: string;     // Raw Douglas County CLASS ('R', 'C', 'M', 'I', etc.)
  hasBuilding?: boolean;    // true: squareFeet > 0 OR yearBuilt > 0; false: squareFeet IS NULL AND yearBuilt IS NULL
  minYearBuilt?: number;
  maxYearBuilt?: number;
  isAbsentee?: boolean;     // Filter by ownershipRecords.some(isAbsentee === true)
  isCorporate?: boolean;    // Filter by ownershipRecords.some(isCorporate === true)
  corporateStatus?: 'PROBABLE_CORPORATE_NAME' | 'INDIVIDUAL';
  absenteeStatus?: 'ABSENTEE' | 'OWNER_OCCUPIED' | 'UNKNOWN';
  hasAuthoritativeAddress?: boolean; // Filter by whether parcel has assigned street situs
}

/**
 * Bounded pagination parameters.
 */
export interface PaginationParams {
  page?: number;     // 1-based page index, defaults to 1
  pageSize?: number; // Records per page, defaults to 25, clamped to [1, 100]
}

/**
 * Pagination metadata returned with list queries.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export type DisplayOwnerClassification =
  | 'PROBABLE_INDIVIDUAL'
  | 'PROBABLE_BUSINESS'
  | 'GOVERNMENT_OR_PUBLIC'
  | 'UNKNOWN';

/**
 * Strong tokens indicating government or public jurisdiction entities.
 */
const GOVERNMENT_ENTITY_REGEX =
  /\b(UNITED STATES|USA|CITY OF|COUNTY OF|STATE OF|OMAHA HOUSING AUTHORITY|HOUSING AUTHORITY|HOUSING AUTHOR|SCHOOL DISTRICT|SCH DIST|BOARD OF REGENTS|UNIVERSITY OF|DEPARTMENT OF|PUBLIC POWER|DISTRICT \d+|METROPOLITAN UTILITIES|AIRPORT AUTHORITY|SANITARY & IMPROVEMENT|NAT RES|NATURAL RESOURCES|CORPS OF ENGINEERS|POSTAL SERVICE|INTERNAL REVENUE|FEDERAL|COMMUNITY COLLEGE)\b/i;

/**
 * Strong tokens indicating business, institutional, or legal entities.
 */
const BUSINESS_ENTITY_REGEX =
  /\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LP|L\.P\.|LLP|L\.L\.P\.|LTD|COMPANY|CO|BANK|FEDERAL CREDIT UNION|N\.A\.|NATIONAL ASSOCIATION|CHURCH|PARISH|MINISTRY|TEMPLE|SYNAGOGUE|MOSQUE|CONGREGATION|BAPTIST|LUTHERAN|METHODIST|PRESBYTERIAN|CATHOLIC|EPISCOPAL|DIOCESE|SOCIETY|ASSOCIATION|ASSN|FOUNDATION|TRUST|ESTATE|HOLDINGS|PROPERTIES|ENTERPRISES|INVESTMENTS|PARTNERS|ACADEMY|HOSPITAL|COMMUNITY PLAYHOUSE)\b/i;

/**
 * Derives a conservative, read-only display classification for owner records.
 * Distinguishes:
 *  - PROBABLE_INDIVIDUAL
 *  - PROBABLE_BUSINESS
 *  - GOVERNMENT_OR_PUBLIC
 *  - UNKNOWN
 *
 * This never alters the underlying database corporateStatus enum or county owner names.
 */
export function deriveDisplayOwnerClassification(
  ownerName: string | null | undefined,
  dcaAccountType?: string | null,
  storedCorporateStatus?: string | null
): DisplayOwnerClassification {
  if (!ownerName || typeof ownerName !== 'string') {
    return 'UNKNOWN';
  }

  const clean = ownerName.trim().toUpperCase();
  if (!clean || clean === 'CONFIDENTIAL' || clean === 'UNKNOWN') {
    return 'UNKNOWN';
  }

  // 1. Government / Public entity checks
  if (dcaAccountType === 'Ex Government' || GOVERNMENT_ENTITY_REGEX.test(clean)) {
    return 'GOVERNMENT_OR_PUBLIC';
  }

  // 2. Business / Entity checks
  if (storedCorporateStatus === 'PROBABLE_CORPORATE_NAME' || BUSINESS_ENTITY_REGEX.test(clean)) {
    return 'PROBABLE_BUSINESS';
  }

  // 3. Fallback: Probable natural person / individual
  return 'PROBABLE_INDIVIDUAL';
}

/**
 * Clean, safe DTO for real property summary in lists.
 * Strictly excludes unverified synthetic fields (scores, fake debt, fake violations).
 */
export interface RealPropertySummaryDTO {
  id: string;
  parcelId: string; // Preserves leading zeros (e.g. "0235720000")
  address: string;
  hasAuthoritativeAddress: boolean;
  city: string;
  state: string;
  zip: string | null;
  propertyType: string;
  countyClass: string | null;
  yearBuilt: number | null;
  squareFeet: number | null;
  lotSizeSqFt: number | null;
  condition: string | null;
  quality: string | null;
  latitude: number | null;
  longitude: number | null;
  municipalJurisdiction: 'INSIDE_OMAHA';
  assessorUrl: string | null;
  treasurerUrl: string | null;
  owner: {
    ownerName: string | null;
    ownerClassification: DisplayOwnerClassification;
    isAbsentee: boolean | null; // null when absenteeStatus is UNKNOWN or unverified
    isCorporate: boolean;
    absenteeStatus: string | null;
    corporateStatus: string | null;
    outOfStateStatus: string | null;
    hasSeparateMailingAddress: boolean;
  } | null;
  provenance: {
    sourceName: string;
    sourceRecordId: string;
    ingestedAt: string;
  } | null;
}

/**
 * Clean, safe DTO for real property detail view.
 */
export interface RealPropertyDetailDTO extends RealPropertySummaryDTO {
  legalDescription: string | null;
  dcaAccountType: string | null;
  geometryGeoJson: any | null;
  ownerDetail: {
    ownerName: string | null;
    ownerClassification: DisplayOwnerClassification;
    mailingAddress: string | null; // Raw mailing address or null if unassigned/blank
    mailingCity: string | null;
    mailingState: string | null;
    mailingZip: string | null;
    isAbsentee: boolean | null; // null when absenteeStatus is UNKNOWN or unverified
    isOutOfState: boolean | null; // null when outOfStateStatus is UNKNOWN
    isCorporate: boolean;
    absenteeStatus: string | null;
    outOfStateStatus: string | null;
    corporateStatus: string | null;
    rawStoredCorporateStatus: string | null;
    rawStoredAbsenteeStatus: string | null;
  } | null;
  provenanceDetail: {
    sourceName: string;
    sourceRecordId: string;
    ingestionRunId: string | null;
    matchedStatus: string;
    ingestedAt: string;
  } | null;
}

/**
 * Clamps pagination options to safe bounds.
 */
export function sanitizePagination(pagination?: PaginationParams): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Math.floor(pagination?.page ?? 1));
  const rawSize = Math.floor(pagination?.pageSize ?? 25);
  const pageSize = Math.max(1, Math.min(rawSize, 100)); // Enforce max 100
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/**
 * Builds the strict Prisma WHERE clause enforcing INVESTOR_ELIGIBLE_WHERE.
 */
function buildPrismaWhere(filters?: EligiblePropertyFilterParams): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = {
    ...INVESTOR_ELIGIBLE_WHERE, // Absolute fail-closed predicate: municipalJurisdiction: 'INSIDE_OMAHA'
  };

  if (!filters) return where;

  // Search filter across PIN, Address, or Owner Name
  if (filters.query) {
    const q = filters.query.trim();
    if (q) {
      where.OR = [
        { parcelId: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        {
          ownershipRecords: {
            some: {
              ownerName: { contains: q, mode: 'insensitive' },
            },
          },
        },
      ];
    }
  }

  if (filters.propertyType && filters.propertyType !== 'ALL') {
    where.propertyType = filters.propertyType;
  }

  if (filters.countyClass && filters.countyClass !== 'ALL') {
    where.countyClass = filters.countyClass;
  }

  if (filters.hasAuthoritativeAddress !== undefined) {
    where.hasAuthoritativeAddress = filters.hasAuthoritativeAddress;
  }

  if (filters.hasBuilding === true) {
    where.OR = [
      ...(where.OR ?? []),
      { squareFeet: { gt: 0 } },
      { yearBuilt: { gt: 0 } },
    ];
  } else if (filters.hasBuilding === false) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { squareFeet: null },
      { yearBuilt: null },
    ];
  }

  if (filters.minYearBuilt !== undefined || filters.maxYearBuilt !== undefined) {
    where.yearBuilt = {
      ...(where.yearBuilt as Prisma.IntNullableFilter ?? {}),
      ...(filters.minYearBuilt !== undefined ? { gte: filters.minYearBuilt } : {}),
      ...(filters.maxYearBuilt !== undefined ? { lte: filters.maxYearBuilt } : {}),
    };
  }

  // Ownership filters
  const ownershipConditions: Prisma.OwnershipRecordWhereInput = {};
  let hasOwnershipFilter = false;

  if (filters.isAbsentee !== undefined) {
    ownershipConditions.isAbsentee = filters.isAbsentee;
    hasOwnershipFilter = true;
  }

  if (filters.isCorporate !== undefined) {
    ownershipConditions.isCorporate = filters.isCorporate;
    hasOwnershipFilter = true;
  }

  if (filters.corporateStatus) {
    ownershipConditions.corporateStatus = filters.corporateStatus;
    hasOwnershipFilter = true;
  }

  if (filters.absenteeStatus) {
    ownershipConditions.absenteeStatus = filters.absenteeStatus;
    hasOwnershipFilter = true;
  }

  if (hasOwnershipFilter) {
    where.ownershipRecords = {
      some: ownershipConditions,
    };
  }

  return where;
}

/**
 * Maps a raw Prisma Property record to RealPropertySummaryDTO.
 */
function mapToSummaryDTO(record: any): RealPropertySummaryDTO {
  const primaryOwner = record.ownershipRecords?.[0] ?? null;
  const primarySource = record.sourceRecords?.[0] ?? null;

  const hasSeparateMailing = Boolean(
    primaryOwner?.mailingAddress &&
    primaryOwner.mailingAddress.trim() !== '' &&
    primaryOwner.mailingAddress !== record.address
  );

  let isAbsentee: boolean | null = null;
  if (primaryOwner?.absenteeStatus === 'ABSENTEE') {
    isAbsentee = true;
  } else if (primaryOwner?.absenteeStatus === 'OWNER_OCCUPIED') {
    isAbsentee = false;
  }

  const ownerClassification = deriveDisplayOwnerClassification(
    primaryOwner?.ownerName,
    record.dcaAccountType,
    primaryOwner?.corporateStatus
  );

  return {
    id: record.id,
    parcelId: record.parcelId, // Strict preservation of leading zeros
    address: record.address,
    hasAuthoritativeAddress: record.hasAuthoritativeAddress,
    city: record.city,
    state: record.state,
    zip: record.zip || null,
    propertyType: record.propertyType,
    countyClass: record.countyClass ?? null,
    yearBuilt: record.yearBuilt ?? null,
    squareFeet: record.squareFeet ?? null,
    lotSizeSqFt: record.lotSizeSqFt ?? null,
    condition: record.condition ?? null,
    quality: record.quality ?? null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    municipalJurisdiction: 'INSIDE_OMAHA',
    assessorUrl: record.assessorUrl ?? null,
    treasurerUrl: record.treasurerUrl ?? null,
    owner: primaryOwner
      ? {
          ownerName: primaryOwner.ownerName ?? null,
          ownerClassification,
          isAbsentee,
          isCorporate: primaryOwner.isCorporate ?? false,
          absenteeStatus: primaryOwner.absenteeStatus ?? null,
          corporateStatus: primaryOwner.corporateStatus ?? null,
          outOfStateStatus: primaryOwner.outOfStateStatus ?? null,
          hasSeparateMailingAddress: hasSeparateMailing,
        }
      : null,
    provenance: primarySource
      ? {
          sourceName: primarySource.sourceName,
          sourceRecordId: primarySource.sourceRecordId,
          ingestedAt: primarySource.ingestedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Counts eligible Omaha properties matching criteria.
 */
export async function countEligibleProperties(
  filters?: EligiblePropertyFilterParams,
  db: PrismaClient = defaultPrisma
): Promise<number> {
  const where = buildPrismaWhere(filters);
  return db.property.count({ where });
}

/**
 * Lists eligible Omaha properties with bounded pagination, deterministic ordering, and relational links.
 */
export async function listEligibleProperties(
  filters?: EligiblePropertyFilterParams,
  pagination?: PaginationParams,
  db: PrismaClient = defaultPrisma
): Promise<{ properties: RealPropertySummaryDTO[]; meta: PaginationMeta }> {
  const { page, pageSize, skip } = sanitizePagination(pagination);
  const where = buildPrismaWhere(filters);

  // Parallel query for count and paginated items
  const [totalRecords, records] = await Promise.all([
    db.property.count({ where }),
    db.property.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [
        { parcelId: 'asc' }, // Primary deterministic order preserving PIN sequence
        { id: 'asc' },       // Tie-breaker
      ],
      select: {
        id: true,
        parcelId: true,
        address: true,
        hasAuthoritativeAddress: true,
        city: true,
        state: true,
        zip: true,
        propertyType: true,
        countyClass: true,
        dcaAccountType: true,
        yearBuilt: true,
        squareFeet: true,
        lotSizeSqFt: true,
        condition: true,
        quality: true,
        latitude: true,
        longitude: true,
        municipalJurisdiction: true,
        assessorUrl: true,
        treasurerUrl: true,
        ownershipRecords: {
          take: 1,
          select: {
            ownerName: true,
            mailingAddress: true,
            isAbsentee: true,
            isCorporate: true,
            absenteeStatus: true,
            corporateStatus: true,
            outOfStateStatus: true,
          },
        },
        sourceRecords: {
          take: 1,
          select: {
            sourceName: true,
            sourceRecordId: true,
            ingestedAt: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(totalRecords / pageSize);

  const meta: PaginationMeta = {
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };

  return {
    properties: records.map(mapToSummaryDTO),
    meta,
  };
}

/**
 * Retrieves a single eligible property by its internal ID.
 * Returns null if the property does not exist or is not INSIDE_OMAHA.
 */
export async function getEligiblePropertyById(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<RealPropertyDetailDTO | null> {
  const record = await db.property.findFirst({
    where: {
      id,
      ...INVESTOR_ELIGIBLE_WHERE, // Strict fail-closed eligibility check
    },
    select: {
      id: true,
      parcelId: true,
      address: true,
      hasAuthoritativeAddress: true,
      city: true,
      state: true,
      zip: true,
      propertyType: true,
      countyClass: true,
      yearBuilt: true,
      squareFeet: true,
      lotSizeSqFt: true,
      condition: true,
      quality: true,
      legalDescription: true,
      dcaAccountType: true,
      latitude: true,
      longitude: true,
      geometryGeoJson: true,
      municipalJurisdiction: true,
      assessorUrl: true,
      treasurerUrl: true,
      ownershipRecords: {
        take: 1,
        select: {
          ownerName: true,
          mailingAddress: true,
          mailingCity: true,
          mailingState: true,
          mailingZip: true,
          isAbsentee: true,
          isOutOfState: true,
          isCorporate: true,
          absenteeStatus: true,
          outOfStateStatus: true,
          corporateStatus: true,
        },
      },
      sourceRecords: {
        take: 1,
        select: {
          sourceName: true,
          sourceRecordId: true,
          ingestionRunId: true,
          matchedStatus: true,
          ingestedAt: true,
        },
      },
    },
  });

  if (!record) return null;

  const summary = mapToSummaryDTO(record);
  const primaryOwner = record.ownershipRecords?.[0] ?? null;
  const primarySource = record.sourceRecords?.[0] ?? null;

  let detailIsAbsentee: boolean | null = null;
  if (primaryOwner?.absenteeStatus === 'ABSENTEE') {
    detailIsAbsentee = true;
  } else if (primaryOwner?.absenteeStatus === 'OWNER_OCCUPIED') {
    detailIsAbsentee = false;
  }

  let detailIsOutOfState: boolean | null = null;
  if (primaryOwner?.outOfStateStatus === 'OUT_OF_STATE') {
    detailIsOutOfState = true;
  } else if (primaryOwner?.outOfStateStatus === 'IN_STATE') {
    detailIsOutOfState = false;
  }

  const rawMailing = primaryOwner?.mailingAddress?.trim();
  const cleanMailingAddress = rawMailing ? rawMailing : null;

  return {
    ...summary,
    legalDescription: record.legalDescription ?? null,
    dcaAccountType: record.dcaAccountType ?? null,
    geometryGeoJson: record.geometryGeoJson ?? null,
    ownerDetail: primaryOwner
      ? {
          ownerName: primaryOwner.ownerName ?? null,
          ownerClassification: summary.owner?.ownerClassification ?? 'UNKNOWN',
          mailingAddress: cleanMailingAddress,
          mailingCity: primaryOwner.mailingCity || null,
          mailingState: primaryOwner.mailingState || null,
          mailingZip: primaryOwner.mailingZip || null,
          isAbsentee: detailIsAbsentee,
          isOutOfState: detailIsOutOfState,
          isCorporate: primaryOwner.isCorporate ?? false,
          absenteeStatus: primaryOwner.absenteeStatus ?? null,
          outOfStateStatus: primaryOwner.outOfStateStatus ?? null,
          corporateStatus: primaryOwner.corporateStatus ?? null,
          rawStoredCorporateStatus: primaryOwner.corporateStatus ?? null,
          rawStoredAbsenteeStatus: primaryOwner.absenteeStatus ?? null,
        }
      : null,
    provenanceDetail: primarySource
      ? {
          sourceName: primarySource.sourceName,
          sourceRecordId: primarySource.sourceRecordId,
          ingestionRunId: primarySource.ingestionRunId ?? null,
          matchedStatus: primarySource.matchedStatus,
          ingestedAt: primarySource.ingestedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Retrieves a single eligible property by its Douglas County PIN.
 * Returns null if the property does not exist or is not INSIDE_OMAHA.
 */
export async function getEligiblePropertyByPin(
  pin: string,
  db: PrismaClient = defaultPrisma
): Promise<RealPropertyDetailDTO | null> {
  const cleanPin = pin.trim();
  if (!cleanPin) return null;

  const record = await db.property.findFirst({
    where: {
      parcelId: cleanPin,
      ...INVESTOR_ELIGIBLE_WHERE, // Strict fail-closed eligibility check
    },
    select: {
      id: true,
      parcelId: true,
      address: true,
      hasAuthoritativeAddress: true,
      city: true,
      state: true,
      zip: true,
      propertyType: true,
      countyClass: true,
      yearBuilt: true,
      squareFeet: true,
      lotSizeSqFt: true,
      condition: true,
      quality: true,
      legalDescription: true,
      dcaAccountType: true,
      latitude: true,
      longitude: true,
      geometryGeoJson: true,
      municipalJurisdiction: true,
      assessorUrl: true,
      treasurerUrl: true,
      ownershipRecords: {
        take: 1,
        select: {
          ownerName: true,
          mailingAddress: true,
          mailingCity: true,
          mailingState: true,
          mailingZip: true,
          isAbsentee: true,
          isOutOfState: true,
          isCorporate: true,
          absenteeStatus: true,
          outOfStateStatus: true,
          corporateStatus: true,
        },
      },
      sourceRecords: {
        take: 1,
        select: {
          sourceName: true,
          sourceRecordId: true,
          ingestionRunId: true,
          matchedStatus: true,
          ingestedAt: true,
        },
      },
    },
  });

  if (!record) return null;

  const summary = mapToSummaryDTO(record);
  const primaryOwner = record.ownershipRecords?.[0] ?? null;
  const primarySource = record.sourceRecords?.[0] ?? null;

  let detailIsAbsentee: boolean | null = null;
  if (primaryOwner?.absenteeStatus === 'ABSENTEE') {
    detailIsAbsentee = true;
  } else if (primaryOwner?.absenteeStatus === 'OWNER_OCCUPIED') {
    detailIsAbsentee = false;
  }

  let detailIsOutOfState: boolean | null = null;
  if (primaryOwner?.outOfStateStatus === 'OUT_OF_STATE') {
    detailIsOutOfState = true;
  } else if (primaryOwner?.outOfStateStatus === 'IN_STATE') {
    detailIsOutOfState = false;
  }

  const rawMailing = primaryOwner?.mailingAddress?.trim();
  const cleanMailingAddress = rawMailing ? rawMailing : null;

  return {
    ...summary,
    legalDescription: record.legalDescription ?? null,
    dcaAccountType: record.dcaAccountType ?? null,
    geometryGeoJson: record.geometryGeoJson ?? null,
    ownerDetail: primaryOwner
      ? {
          ownerName: primaryOwner.ownerName ?? null,
          ownerClassification: summary.owner?.ownerClassification ?? 'UNKNOWN',
          mailingAddress: cleanMailingAddress,
          mailingCity: primaryOwner.mailingCity || null,
          mailingState: primaryOwner.mailingState || null,
          mailingZip: primaryOwner.mailingZip || null,
          isAbsentee: detailIsAbsentee,
          isOutOfState: detailIsOutOfState,
          isCorporate: primaryOwner.isCorporate ?? false,
          absenteeStatus: primaryOwner.absenteeStatus ?? null,
          outOfStateStatus: primaryOwner.outOfStateStatus ?? null,
          corporateStatus: primaryOwner.corporateStatus ?? null,
          rawStoredCorporateStatus: primaryOwner.corporateStatus ?? null,
          rawStoredAbsenteeStatus: primaryOwner.absenteeStatus ?? null,
        }
      : null,
    provenanceDetail: primarySource
      ? {
          sourceName: primarySource.sourceName,
          sourceRecordId: primarySource.sourceRecordId,
          ingestionRunId: primarySource.ingestionRunId ?? null,
          matchedStatus: primarySource.matchedStatus,
          ingestedAt: primarySource.ingestedAt.toISOString(),
        }
      : null,
  };
}

export interface RealDashboardMetricsDTO {
  totalEligible: number;
  withBuilding: number;
  noBuilding: number;
  probableBusiness: number;
  likelyAbsentee: number;
  unassignedAddress: number;
  propertyTypeDistribution: Array<{
    type: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  recentPreviewProperties: RealPropertySummaryDTO[];
}

/**
 * Returns aggregated statistics and sample property records for the DealBeacon dashboard.
 * All metrics are strictly filtered by INVESTOR_ELIGIBLE_WHERE (inside Omaha municipal limits).
 */
export async function getDashboardMetrics(
  db: PrismaClient = defaultPrisma
): Promise<RealDashboardMetricsDTO> {
  const where = INVESTOR_ELIGIBLE_WHERE;

  const [
    totalEligible,
    withBuilding,
    noBuilding,
    probableBusiness,
    likelyAbsentee,
    unassignedAddress,
    propertyTypeGroups,
    recentPreviewRecords,
  ] = await Promise.all([
    // Total inside Omaha
    db.property.count({ where }),

    // Physical structure on record
    db.property.count({
      where: {
        ...where,
        OR: [{ squareFeet: { gt: 0 } }, { yearBuilt: { gt: 0 } }],
      },
    }),

    // No building recorded
    db.property.count({
      where: {
        ...where,
        squareFeet: null,
        yearBuilt: null,
      },
    }),

    // Probable business / corporate grantee
    db.property.count({
      where: {
        ...where,
        ownershipRecords: {
          some: {
            corporateStatus: 'PROBABLE_CORPORATE_NAME',
          },
        },
      },
    }),

    // Likely absentee
    db.property.count({
      where: {
        ...where,
        ownershipRecords: {
          some: {
            absenteeStatus: 'ABSENTEE',
          },
        },
      },
    }),

    // Unassigned situs address
    db.property.count({
      where: {
        ...where,
        hasAuthoritativeAddress: false,
      },
    }),

    // Property type distribution group by
    db.property.groupBy({
      by: ['propertyType'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // 5 sample properties with complete relational data
    db.property.findMany({
      where,
      take: 5,
      orderBy: [
        { parcelId: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        parcelId: true,
        address: true,
        hasAuthoritativeAddress: true,
        city: true,
        state: true,
        zip: true,
        propertyType: true,
        countyClass: true,
        dcaAccountType: true,
        yearBuilt: true,
        squareFeet: true,
        lotSizeSqFt: true,
        condition: true,
        quality: true,
        latitude: true,
        longitude: true,
        municipalJurisdiction: true,
        assessorUrl: true,
        treasurerUrl: true,
        ownershipRecords: {
          take: 1,
          select: {
            ownerName: true,
            mailingAddress: true,
            isAbsentee: true,
            isCorporate: true,
            absenteeStatus: true,
            corporateStatus: true,
            outOfStateStatus: true,
          },
        },
        sourceRecords: {
          take: 1,
          select: {
            sourceName: true,
            sourceRecordId: true,
            ingestedAt: true,
          },
        },
      },
    }),
  ]);

  const typeLabels: Record<string, string> = {
    RESIDENTIAL: 'Residential',
    COMMERCIAL: 'Commercial',
    TAX_EXEMPT: 'Tax-Exempt',
    UTILITY: 'Utility',
    INDUSTRIAL: 'Industrial',
    MULTI_FAMILY: 'Multi-Family',
    AGRICULTURAL: 'Agricultural',
    CONDOMINIUM: 'Condominium',
  };

  const propertyTypeDistribution = propertyTypeGroups.map((group) => {
    const count = group._count.id;
    const percentage = totalEligible > 0 ? (count / totalEligible) * 100 : 0;
    return {
      type: group.propertyType,
      label: typeLabels[group.propertyType] || group.propertyType.replace('_', ' '),
      count,
      percentage: Math.round(percentage * 10) / 10,
    };
  });

  return {
    totalEligible,
    withBuilding,
    noBuilding,
    probableBusiness,
    likelyAbsentee,
    unassignedAddress,
    propertyTypeDistribution,
    recentPreviewProperties: recentPreviewRecords.map(mapToSummaryDTO),
  };
}

