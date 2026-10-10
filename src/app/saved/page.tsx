import React from 'react';
import Link from 'next/link';
import { Bookmark, Building, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Saved Lead Pipeline & Outreach
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Investor lead organization and pipeline tracking for Douglas County properties.
          </p>
        </div>

        <Link
          href="/properties"
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <Building className="w-3.5 h-3.5" />
          <span>Explore Omaha Properties</span>
        </Link>
      </div>

      {/* Honest Coming Soon / Pipeline Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3 max-w-2xl mx-auto shadow-xl">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
          <Bookmark className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white">Saved Lead Pipeline — Coming in Next Phase</h3>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          DealBeacon is currently operating in public-records exploration mode across 2,839 Douglas County parcels. Custom user lead lists, note tracking, and outreach pipelines for real parcels are under development and not yet enabled.
        </p>
        <p className="text-xs text-slate-400">
          In adherence to data truth invariants, synthetic demonstration leads have been removed.
        </p>
        <div className="pt-2">
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md"
          >
            <span>Browse Real Omaha Public Records</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
