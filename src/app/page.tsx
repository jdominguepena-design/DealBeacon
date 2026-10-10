import React from 'react';
import { getDashboardMetrics } from '@/lib/repositories/property-repository';
import { KPIStats } from '@/components/dashboard/KPIStats';
import { RealPropertyPreviewFeed } from '@/components/dashboard/RealPropertyPreviewFeed';
import { PropertyTypeDistribution } from '@/components/dashboard/PropertyTypeDistribution';
import { Building2, Compass, ShieldCheck, ArrowRight, Info, Search } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-6">
      {/* Real Omaha Market Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold tracking-wide uppercase">
              <Building2 className="w-3 h-3 text-amber-400" />
              Douglas County Public Records
            </span>
            <span className="text-xs text-slate-400">Omaha Jurisdiction</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Omaha Property Intelligence Overview
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            DealBeacon indexes <span className="text-amber-400 font-semibold">{metrics.totalEligible.toLocaleString()} verified Omaha parcels</span> sourced directly from Douglas County GIS and County Assessor records.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/properties"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Explore Public Records ({metrics.totalEligible.toLocaleString()})</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Public Records Disclaimers & Provenance Notice */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-slate-300">
            <strong>Public Records Provenance:</strong> Parcel geometries, property types, improvements, and grantee names are sourced from official Douglas County Assessor and GIS datasets. Boundary filtering is applied using geographic municipal limits.
          </p>
          <p className="text-slate-400">
            Corporate entity classifications and absentee statuses are algorithmic estimates derived from public deed and mailing records; they do not represent certified title determinations. Unassigned parcels display official Douglas County PINs.
          </p>
        </div>
      </div>

      {/* Top Level Metric KPIs */}
      <KPIStats
        stats={{
          totalEligible: metrics.totalEligible,
          withBuilding: metrics.withBuilding,
          noBuilding: metrics.noBuilding,
          probableBusiness: metrics.probableBusiness,
          likelyAbsentee: metrics.likelyAbsentee,
          unassignedAddress: metrics.unassignedAddress,
        }}
      />

      {/* Main Grid: Previews & Class Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RealPropertyPreviewFeed
            properties={metrics.recentPreviewProperties}
          />
        </div>

        <div className="space-y-6">
          <PropertyTypeDistribution
            distribution={metrics.propertyTypeDistribution}
          />
        </div>
      </div>
    </div>
  );
}

