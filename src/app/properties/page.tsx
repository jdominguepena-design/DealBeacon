import React from 'react';
import Link from 'next/link';
import {
  listEligibleProperties,
  EligiblePropertyFilterParams,
  PaginationMeta,
} from '@/lib/repositories/property-repository';
import { PropertyTable } from '@/components/properties/PropertyTable';
import { PropertyFilters } from '@/components/properties/PropertyFilters';
import { Building2, ChevronLeft, ChevronRight, ShieldCheck, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PropertiesPageProps {
  searchParams: Promise<{
    page?: string;
    query?: string;
    propertyType?: string;
    hasBuilding?: string;
    minYearBuilt?: string;
    maxYearBuilt?: string;
    corporateStatus?: string;
    absenteeStatus?: string;
    hasAuthoritativeAddress?: string;
    hasTaxSaleRecord?: string;
    hasPropertyConditionComplaint?: string;
  }>;
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const params = await searchParams;

  const page = params.page ? parseInt(params.page, 10) : 1;
  const pageSize = 25;

  const repositoryFilters: EligiblePropertyFilterParams = {};

  if (params.query?.trim()) {
    repositoryFilters.query = params.query.trim();
  }

  if (params.propertyType && params.propertyType !== 'ALL') {
    repositoryFilters.propertyType = params.propertyType;
  }

  if (params.hasBuilding === 'true') {
    repositoryFilters.hasBuilding = true;
  } else if (params.hasBuilding === 'false') {
    repositoryFilters.hasBuilding = false;
  }

  if (params.hasAuthoritativeAddress === 'true') {
    repositoryFilters.hasAuthoritativeAddress = true;
  } else if (params.hasAuthoritativeAddress === 'false') {
    repositoryFilters.hasAuthoritativeAddress = false;
  }

  if (params.minYearBuilt) {
    const min = parseInt(params.minYearBuilt, 10);
    if (!isNaN(min)) repositoryFilters.minYearBuilt = min;
  }

  if (params.maxYearBuilt) {
    const max = parseInt(params.maxYearBuilt, 10);
    if (!isNaN(max)) repositoryFilters.maxYearBuilt = max;
  }

  if (params.corporateStatus === 'PROBABLE_CORPORATE_NAME') {
    repositoryFilters.corporateStatus = 'PROBABLE_CORPORATE_NAME';
  }

  if (
    params.absenteeStatus === 'ABSENTEE' ||
    params.absenteeStatus === 'OWNER_OCCUPIED' ||
    params.absenteeStatus === 'UNKNOWN'
  ) {
    repositoryFilters.absenteeStatus = params.absenteeStatus;
  }

  if (params.hasTaxSaleRecord === 'true') {
    repositoryFilters.hasTaxSaleRecord = true;
  } else if (params.hasTaxSaleRecord === 'false') {
    repositoryFilters.hasTaxSaleRecord = false;
  }

  if (params.hasPropertyConditionComplaint === 'true') {
    repositoryFilters.hasPropertyConditionComplaint = true;
  } else if (params.hasPropertyConditionComplaint === 'false') {
    repositoryFilters.hasPropertyConditionComplaint = false;
  }

  let propertiesResult: { properties: any[]; meta: PaginationMeta } | null = null;
  let fetchError: string | null = null;

  try {
    propertiesResult = await listEligibleProperties(repositoryFilters, {
      page: isNaN(page) ? 1 : page,
      pageSize,
    });
  } catch (err: any) {
    console.error('Failed to fetch real properties from Neon DEV repository:', err);
    fetchError = err?.message || 'Database connection error. Unable to load public records.';
  }

  // Helper to build URL with page transitions preserving active filters
  const buildPageUrl = (targetPage: number) => {
    const search = new URLSearchParams();
    if (params.query) search.set('query', params.query);
    if (params.propertyType) search.set('propertyType', params.propertyType);
    if (params.hasBuilding) search.set('hasBuilding', params.hasBuilding);
    if (params.hasAuthoritativeAddress) search.set('hasAuthoritativeAddress', params.hasAuthoritativeAddress);
    if (params.minYearBuilt) search.set('minYearBuilt', params.minYearBuilt);
    if (params.maxYearBuilt) search.set('maxYearBuilt', params.maxYearBuilt);
    if (params.corporateStatus) search.set('corporateStatus', params.corporateStatus);
    if (params.absenteeStatus) search.set('absenteeStatus', params.absenteeStatus);
    if (params.hasTaxSaleRecord) search.set('hasTaxSaleRecord', params.hasTaxSaleRecord);
    if (params.hasPropertyConditionComplaint) search.set('hasPropertyConditionComplaint', params.hasPropertyConditionComplaint);
    search.set('page', targetPage.toString());
    return `/properties?${search.toString()}`;
  };

  const properties = propertiesResult?.properties ?? [];
  const meta = propertiesResult?.meta ?? {
    page: 1,
    pageSize,
    totalRecords: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Real Douglas County Public Records — Omaha Preview
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative parcel records within the City of Omaha municipal jurisdiction sourced from Douglas County GIS and Assessor.
          </p>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Showing <span className="text-amber-400 font-bold">{properties.length}</span> of{' '}
          <span className="text-white font-bold">{meta.totalRecords.toLocaleString()}</span> eligible properties
        </div>
      </div>

      {/* Disclaimers & Provenance Notice */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-slate-300">
            <strong>Public Records Notice:</strong> Property attributes, dimensions, and legal descriptions reflect official Douglas County Assessor data. Ownership entity categories (Probable Individual vs. Probable Business) are conservative algorithmic estimates based on county deed grantee strings.
          </p>
          <p className="text-slate-400">
            Absentee indicators represent mailing address discrepancy from parcel situs. Unmatched mailing addresses are marked as unknown and are not presumed owner-occupied.
          </p>
        </div>
      </div>

      {/* Multi-Signal Filters */}
      <PropertyFilters currentFilters={params} />

      {/* Error State */}
      {fetchError && (
        <div className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-6 text-center space-y-2">
          <h3 className="text-sm font-bold text-rose-300">Database Connection Error</h3>
          <p className="text-xs text-rose-200/80 max-w-md mx-auto">
            {fetchError}
          </p>
          <p className="text-[11px] text-slate-400">
            Real Neon DEV records could not be retrieved. In accordance with data truth invariants, synthetic fallback data is disabled.
          </p>
        </div>
      )}

      {/* Property Table */}
      {!fetchError && <PropertyTable properties={properties} />}

      {/* Pagination Controls */}
      {!fetchError && meta.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-400">
            Page <strong className="text-white">{meta.page}</strong> of <strong className="text-white">{meta.totalPages}</strong> (25 records per page)
          </div>

          <div className="flex items-center gap-2">
            {meta.hasPreviousPage ? (
              <Link
                href={buildPageUrl(meta.page - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-900 text-xs font-semibold text-slate-600 cursor-not-allowed">
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </span>
            )}

            {meta.hasNextPage ? (
              <Link
                href={buildPageUrl(meta.page + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-900 text-xs font-semibold text-slate-600 cursor-not-allowed">
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
