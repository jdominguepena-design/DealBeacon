'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, RotateCcw, Search, Building2, UserCheck, Landmark, FileQuestion } from 'lucide-react';

interface PropertyFiltersProps {
  currentFilters: {
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
  };
}

export function PropertyFilters({ currentFilters }: PropertyFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page'); // Reset to page 1 on filter modification
    if (value === null || value === '' || value === 'ALL') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/properties?${params.toString()}`);
  };

  const handleReset = () => {
    router.push('/properties');
  };

  const propertyTypes = [
    'ALL',
    'RESIDENTIAL',
    'COMMERCIAL',
    'TAX_EXEMPT',
    'UTILITY',
    'INDUSTRIAL',
    'MULTI_FAMILY',
    'AGRICULTURAL',
    'CONDOMINIUM',
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search address, Douglas County PIN, or owner name..."
            value={currentFilters.query ?? ''}
            onChange={(e) => updateParam('query', e.target.value.trim() ? e.target.value : null)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Property Type */}
          <select
            value={currentFilters.propertyType || 'ALL'}
            onChange={(e) => updateParam('propertyType', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Property Types</option>
            {propertyTypes.filter((t) => t !== 'ALL').map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>

          {/* Building Presence */}
          <select
            value={currentFilters.hasBuilding || 'ALL'}
            onChange={(e) => updateParam('hasBuilding', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Land & Improvements</option>
            <option value="true">With Improvement / Building</option>
            <option value="false">No building recorded</option>
          </select>

          {/* Absentee Selector */}
          <select
            value={currentFilters.absenteeStatus || 'ALL'}
            onChange={(e) => updateParam('absenteeStatus', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Absentee Classifications</option>
            <option value="ABSENTEE">Likely absentee — based on mailing records (419)</option>
            <option value="OWNER_OCCUPIED">Mailing address matches property (1)</option>
            <option value="UNKNOWN">Unconfirmed / Unknown (2,419)</option>
          </select>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            title="Reset Filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Secondary Toggles and Year Range */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Ownership Filter:</span>
          </span>

          <button
            onClick={() =>
              updateParam(
                'corporateStatus',
                currentFilters.corporateStatus === 'PROBABLE_CORPORATE_NAME' ? null : 'PROBABLE_CORPORATE_NAME'
              )
            }
            className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
              currentFilters.corporateStatus === 'PROBABLE_CORPORATE_NAME'
                ? 'bg-amber-950 text-amber-300 border-amber-600'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            {currentFilters.corporateStatus === 'PROBABLE_CORPORATE_NAME'
              ? '✓ Probable Corporate / Entity'
              : '+ Probable Corporate / Entity'}
          </button>
        </div>

        {/* Year Built Filter */}
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[11px] font-medium">Year Built:</span>
          <input
            type="number"
            placeholder="Min"
            value={currentFilters.minYearBuilt ?? ''}
            onChange={(e) => updateParam('minYearBuilt', e.target.value.trim() ? e.target.value : null)}
            className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
          />
          <span>–</span>
          <input
            type="number"
            placeholder="Max"
            value={currentFilters.maxYearBuilt ?? ''}
            onChange={(e) => updateParam('maxYearBuilt', e.target.value.trim() ? e.target.value : null)}
            className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Public Record Signal Filters (Tax Sale & 311 Condition Complaints) */}
      <div className="pt-3 border-t border-slate-800/80 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Public-Record Signals:</span>
            </span>

            {/* Filter A: Tax-Sale Snapshot */}
            <button
              onClick={() =>
                updateParam(
                  'hasTaxSaleRecord',
                  currentFilters.hasTaxSaleRecord === 'true' ? null : 'true'
                )
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition ${
                currentFilters.hasTaxSaleRecord === 'true'
                  ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm shadow-amber-950/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {currentFilters.hasTaxSaleRecord === 'true' ? '✓ ' : '+ '}
                Tax-Sale Snapshot
              </span>
            </button>

            {/* Filter B: 311 Property-Condition Complaint */}
            <button
              onClick={() =>
                updateParam(
                  'hasPropertyConditionComplaint',
                  currentFilters.hasPropertyConditionComplaint === 'true' ? null : 'true'
                )
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition ${
                currentFilters.hasPropertyConditionComplaint === 'true'
                  ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm shadow-amber-950/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <FileQuestion className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {currentFilters.hasPropertyConditionComplaint === 'true' ? '✓ ' : '+ '}
                311 Property-Condition Complaint
              </span>
            </button>
          </div>

          {/* Active Filter Clear Helper */}
          {(currentFilters.hasTaxSaleRecord === 'true' ||
            currentFilters.hasPropertyConditionComplaint === 'true') && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400">
              <span className="font-semibold">
                {currentFilters.hasTaxSaleRecord === 'true' &&
                currentFilters.hasPropertyConditionComplaint === 'true'
                  ? 'AND Logic: Matches both signals'
                  : 'Single signal filter active'}
              </span>
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('hasTaxSaleRecord');
                  params.delete('hasPropertyConditionComplaint');
                  params.delete('page');
                  router.push(`/properties?${params.toString()}`);
                }}
                className="text-slate-400 hover:text-white underline transition"
              >
                Clear signals
              </button>
            </div>
          )}
        </div>

        {/* Short Explanatory Notices */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
          <div>
            <strong className="text-slate-400">Tax-Sale Snapshot:</strong> Sourced from Douglas County Treasurer annual tax-sale roll. Does not prove current unpaid balance or active foreclosure.
          </div>
          <div>
            <strong className="text-slate-400">311 Condition Complaint:</strong> Omaha citizen request classified as potential physical condition (litter, weeds, exterior). Does not prove official housing violation or owner responsibility. Context-only (animal control) and disputed civic reports are strictly excluded.
          </div>
        </div>
      </div>
    </div>
  );
}
