'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';

interface PropertyFiltersProps {
  currentFilters: {
    query?: string;
    minScore?: string | number;
    neighborhood?: string;
    propertyType?: string;
    isAbsentee?: string;
    hasTax?: string | boolean;
    hasCode?: string | boolean;
    hasVacancy?: string | boolean;
    sortBy?: string;
  };
}

export function PropertyFilters({ currentFilters }: PropertyFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
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

  const neighborhoods = [
    'ALL',
    'North Omaha',
    'South Omaha',
    'Benson',
    'Dundee',
    'Florence',
    'Millard',
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search address, Douglas County PIN, owner name, or zip..."
            defaultValue={currentFilters.query || ''}
            onChange={(e) => updateParam('query', e.target.value || null)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Neighborhood */}
          <select
            value={currentFilters.neighborhood || 'ALL'}
            onChange={(e) => updateParam('neighborhood', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Omaha Neighborhoods</option>
            {neighborhoods.filter((n) => n !== 'ALL').map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          {/* Absentee Selector */}
          <select
            value={currentFilters.isAbsentee || 'ALL'}
            onChange={(e) => updateParam('isAbsentee', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Ownership Types</option>
            <option value="out_of_state">Absentee (Out-of-State)</option>
            <option value="in_state">Absentee (In-State)</option>
            <option value="any">Any Absentee</option>
          </select>

          {/* Sort By */}
          <select
            value={currentFilters.sortBy || 'score_desc'}
            onChange={(e) => updateParam('sortBy', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="score_desc">Opportunity Score (Highest)</option>
            <option value="score_asc">Opportunity Score (Lowest)</option>
            <option value="delinquent_desc">Tax Delinquent Amount</option>
            <option value="value_desc">Estimated Market Value</option>
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

      {/* Distress Signal Quick Toggle Tills */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
        <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Distress Toggles:</span>
        </span>

        <button
          onClick={() => updateParam('hasTax', currentFilters.hasTax ? null : 'true')}
          className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
            currentFilters.hasTax
              ? 'bg-rose-950 text-rose-300 border-rose-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          {currentFilters.hasTax ? '✓ Tax Delinquent' : '+ Tax Delinquent'}
        </button>

        <button
          onClick={() => updateParam('hasCode', currentFilters.hasCode ? null : 'true')}
          className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
            currentFilters.hasCode
              ? 'bg-amber-950 text-amber-300 border-amber-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          {currentFilters.hasCode ? '✓ Code Violations' : '+ Code Violations'}
        </button>

        <button
          onClick={() => updateParam('hasVacancy', currentFilters.hasVacancy ? null : 'true')}
          className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
            currentFilters.hasVacancy
              ? 'bg-purple-950 text-purple-300 border-purple-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          {currentFilters.hasVacancy ? '✓ Vacancy Indicator' : '+ Vacancy Indicator'}
        </button>

        <button
          onClick={() => updateParam('minScore', currentFilters.minScore === 80 ? null : '80')}
          className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
            currentFilters.minScore === 80
              ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          {currentFilters.minScore === 80 ? '✓ High Score (80+)' : '+ Score 80+'}
        </button>
      </div>
    </div>
  );
}
