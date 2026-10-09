import React from 'react';
import Link from 'next/link';
import { getSavedPipeline } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { Bookmark, Building, ChevronRight, MessageSquare, Plus, Clock } from 'lucide-react';
import { LeadStatus } from '@/types';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  const user = await getCurrentUser();
  const rawSavedItems = await getSavedPipeline(user.id);
  const savedItems = rawSavedItems.filter((i): i is NonNullable<typeof i> => Boolean(i));

  const stageGroups: { status: LeadStatus; label: string; color: string }[] = [
    { status: 'NEW', label: 'New Saved Leads', color: 'border-slate-700 bg-slate-900/60' },
    { status: 'RESEARCHING', label: 'In Research', color: 'border-blue-700/60 bg-blue-950/20' },
    { status: 'CONTACTING', label: 'Contacting Owner', color: 'border-amber-700/60 bg-amber-950/20' },
    { status: 'FOLLOW_UP', label: 'Follow Up', color: 'border-purple-700/60 bg-purple-950/20' },
    { status: 'INTERESTED', label: 'Interested / Under Review', color: 'border-emerald-700/60 bg-emerald-950/20' },
    { status: 'CLOSED_DEAL', label: 'Closed / Under Contract', color: 'border-amber-500 bg-amber-500/10' },
  ];

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
            Track saved Omaha off-market properties across outreach and acquisition stages.
          </p>
        </div>

        <Link
          href="/properties"
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Discover More Opportunities</span>
        </Link>
      </div>

      {savedItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Bookmark className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No properties saved to your pipeline yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Browse the Property Intelligence Table and click &quot;Save Property&quot; to organize your off-market acquisition workflow.
          </p>
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
          >
            <span>Explore Omaha Properties</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {stageGroups.map((stage) => {
            const itemsInStage = savedItems.filter((i) => i.status === stage.status);
            if (itemsInStage.length === 0) return null;

            return (
              <div
                key={stage.status}
                className={`border rounded-xl p-5 shadow-lg space-y-3 ${stage.color}`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{stage.label}</span>
                    <span className="text-xs font-semibold px-2 py-0.2 rounded bg-slate-800 text-slate-300">
                      {itemsInStage.length}
                    </span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {itemsInStage.map((item) => {
                    const prop = item.property;
                    const latestNote = item.notes?.[0];

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <ScoreBadge score={prop.opportunityScore} size="sm" />
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                              {prop.neighborhood || 'Omaha'}
                            </span>
                          </div>

                          <Link
                            href={`/properties/${prop.id}`}
                            className="font-bold text-white hover:text-amber-400 text-sm block transition truncate"
                          >
                            {prop.address}
                          </Link>

                          <div className="text-[11px] text-slate-400">
                            PIN: <span className="font-mono text-slate-300">{prop.parcelId}</span>
                          </div>

                          {latestNote && (
                            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-0.5">
                              <span className="text-[10px] text-amber-400 font-semibold block">
                                Latest Note:
                              </span>
                              <p className="line-clamp-2">{latestNote.content}</p>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-slate-400" />
                            {item.notes?.length || 0} Notes
                          </span>

                          <Link
                            href={`/properties/${prop.id}`}
                            className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                          >
                            <span>Open Record</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
