'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PropertyDTO } from '@/types';
import { ScoreBadge } from '../ui/ScoreBadge';
import { ConfidencePill } from '../ui/ConfidencePill';
import { SignalBadge } from '../ui/SignalBadge';
import { ArrowRight, Bookmark, MapPin, Building, ShieldCheck, Check } from 'lucide-react';

interface NewOpportunitiesFeedProps {
  properties: PropertyDTO[];
  userId: string;
}

export function NewOpportunitiesFeed({ properties, userId }: NewOpportunitiesFeedProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(
    new Set(properties.filter((p) => p.savedProperties && p.savedProperties.length > 0).map((p) => p.id))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleToggleSave = async (propertyId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSavingId(propertyId);
    try {
      const res = await fetch(`/api/properties/${propertyId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESEARCHING' }),
      });
      const data = await res.json();
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (data.isSaved) next.add(propertyId);
        else next.delete(propertyId);
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Daily Opportunity Prioritization Feed</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Ranked by Score
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Properties with concurrent distress signals ranked for today&apos;s Omaha outreach.
          </p>
        </div>
        <Link
          href="/properties"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
        >
          <span>View All Properties</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="divide-y divide-slate-800/80">
        {properties.map((prop) => {
          const isSaved = savedIds.has(prop.id);
          const owner = prop.ownershipRecords?.[0];

          return (
            <div
              key={prop.id}
              className="p-5 hover:bg-slate-800/50 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
            >
              {/* Left Details */}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <ScoreBadge score={prop.opportunityScore} size="md" />
                  <Link
                    href={`/properties/${prop.id}`}
                    className="text-base font-bold text-white group-hover:text-amber-400 transition truncate"
                  >
                    {prop.address}
                  </Link>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {prop.neighborhood || 'Omaha'}
                  </span>
                  <ConfidencePill level={prop.dataConfidence} />
                </div>

                {/* Score Explainability Teaser */}
                {prop.scoreBreakdownJson && prop.scoreBreakdownJson.length > 0 && (
                  <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                    <span className="font-semibold text-amber-400/90 uppercase tracking-wider text-[10px] block">
                      Why this property ranks highly:
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {prop.scoreBreakdownJson.slice(0, 3).map((factor, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center text-slate-300 text-[11px] bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60"
                        >
                          <span className="text-emerald-400 font-bold mr-1">+{factor.points}</span>
                          {factor.label}
                        </span>
                      ))}
                      {prop.scoreBreakdownJson.length > 3 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{prop.scoreBreakdownJson.length - 3} more signals
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Spec details and synthetic note */}
                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400 pt-1">
                  <span>
                    PIN: <span className="font-mono text-slate-300">{prop.parcelId}</span>
                  </span>
                  <span>•</span>
                  <span>
                    Owner: <span className="text-slate-300">{owner?.ownerName || 'Synthetic Owner'}</span>
                    {owner?.isAbsentee && (
                      <span className="ml-1 text-sky-400 font-semibold">(Absentee {owner.mailingState})</span>
                    )}
                  </span>
                  <span>•</span>
                  <span>
                    Est. Equity: <span className="text-slate-300">{Math.round((prop.estimatedEquityPct || 0) * 100)}%</span>{' '}
                    <span className="text-[10px] text-slate-500">(Inferred)</span>
                  </span>
                </div>
              </div>

              {/* Right Action Bar */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                <button
                  onClick={(e) => handleToggleSave(prop.id, e)}
                  disabled={savingId === prop.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                    isSaved
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {isSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save Lead</span>
                    </>
                  )}
                </button>
                <Link
                  href={`/properties/${prop.id}`}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm"
                >
                  <span>Investigate</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
