import React from 'react';
import { SignalDTO } from '@/types';
import { SignalBadge } from '../ui/SignalBadge';
import { Activity, Clock, Shield } from 'lucide-react';
import Link from 'next/link';

interface RecentActivityFeedProps {
  signals: SignalDTO[];
}

export function RecentActivityFeed({ signals }: RecentActivityFeedProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span>Recent Omaha Distress Signal Ingestion</span>
        </h3>
        <span className="text-[11px] text-slate-400 font-medium">Source Provenance Stream</span>
      </div>

      <div className="divide-y divide-slate-800/60 p-2">
        {signals.map((sig) => {
          const eventDateStr = new Date(sig.eventDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <div key={sig.id} className="p-3 hover:bg-slate-800/40 rounded-lg transition text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <SignalBadge type={sig.signalType} points={sig.scoreContribution} size="sm" />
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {eventDateStr}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="truncate font-medium">
                  Source: <span className="text-slate-400">{sig.sourceType}</span>
                </span>
                <Link
                  href={`/properties/${sig.propertyId}`}
                  className="text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 ml-2 shrink-0"
                >
                  View Property
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
