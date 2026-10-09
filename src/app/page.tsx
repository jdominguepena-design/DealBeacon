import React from 'react';
import { getDashboardKPIs } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { KPIStats } from '@/components/dashboard/KPIStats';
import { NewOpportunitiesFeed } from '@/components/dashboard/NewOpportunitiesFeed';
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed';
import { Compass, Sparkles, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const kpiData = await getDashboardKPIs(user.id);

  return (
    <div className="space-y-6">
      {/* Daily Briefing Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Daily Morning Intelligence Briefing
            </span>
            <span className="text-xs text-slate-400">Omaha Market</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            What should I investigate today?
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            DealBeacon aggregated <span className="text-amber-400 font-semibold">{kpiData.totalProperties} Omaha properties</span> across Douglas County. 
            Here are the highest-scoring opportunities with active multi-distress convergence.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/properties?minScore=80"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            <span>Explore High Priority ({kpiData.highPriorityCount})</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Top Level Metric KPIs */}
      <KPIStats
        stats={{
          totalProperties: kpiData.totalProperties,
          highPriorityCount: kpiData.highPriorityCount,
          taxDelinquentCount: kpiData.taxDelinquentCount,
          openViolationsCount: kpiData.openViolationsCount,
          savedPipelineCount: kpiData.savedPipelineCount,
        }}
      />

      {/* Main Grid: Opportunities & Signals Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <NewOpportunitiesFeed
            properties={kpiData.topOpportunities}
            userId={user.id}
          />
        </div>

        <div className="space-y-6">
          <RecentActivityFeed signals={kpiData.recentSignalsFeed} />
        </div>
      </div>
    </div>
  );
}
