import React from 'react';
import { getAllProperties } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PropertyTable } from '@/components/properties/PropertyTable';
import { PropertyFilters } from '@/components/properties/PropertyFilters';
import { Building2, Filter, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PropertiesPageProps {
  searchParams: Promise<{
    query?: string;
    minScore?: string;
    maxScore?: string;
    neighborhood?: string;
    propertyType?: string;
    isAbsentee?: string;
    hasTax?: string;
    hasCode?: string;
    hasVacancy?: string;
    sortBy?: string;
  }>;
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters = {
    query: params.query,
    minScore: params.minScore ? parseInt(params.minScore, 10) : undefined,
    maxScore: params.maxScore ? parseInt(params.maxScore, 10) : undefined,
    neighborhood: params.neighborhood,
    propertyType: params.propertyType,
    isAbsentee:
      params.isAbsentee === 'out_of_state'
        ? ('out_of_state' as const)
        : params.isAbsentee === 'in_state'
        ? ('in_state' as const)
        : params.isAbsentee === 'any'
        ? true
        : undefined,
    hasTaxDelinquency: params.hasTax === 'true',
    hasCodeViolation: params.hasCode === 'true',
    hasVacancy: params.hasVacancy === 'true',
    sortBy: params.sortBy as any,
  };

  const properties = await getAllProperties(filters, user.id);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Omaha Property Intelligence
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Filter and prioritize Douglas County off-market properties by distress scores, violations, and absentee signals.
          </p>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Showing <span className="text-amber-400 font-bold">{properties.length}</span> properties
        </div>
      </div>

      {/* Multi-Signal Filters */}
      <PropertyFilters currentFilters={params} />

      {/* Property Intelligence Table */}
      <PropertyTable properties={properties} userId={user.id} />
    </div>
  );
}
