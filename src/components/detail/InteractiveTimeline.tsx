import React from 'react';
import { PropertyEventDTO } from '@/types';
import { Clock, Shield, AlertTriangle, AlertOctagon, CheckCircle2, Info, ArrowDown } from 'lucide-react';

interface InteractiveTimelineProps {
  events?: PropertyEventDTO[];
}

export function InteractiveTimeline({ events }: InteractiveTimelineProps) {
  const list = events || [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Chronological Property Narrative Timeline</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Normalized presentation layer synthesized from verified underlying source records and signals.
          </p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
          {list.length} Milestones
        </span>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-slate-400">No chronological milestones available for this parcel.</p>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {list.map((evt, idx) => {
            const dateStr = new Date(evt.eventDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            let dotColor = 'bg-slate-600 border-slate-900';
            let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';

            if (evt.severity === 'DANGER') {
              dotColor = 'bg-rose-500 border-slate-950 ring-4 ring-rose-950/60';
              badgeStyle = 'bg-rose-950 text-rose-300 border-rose-700/60';
            } else if (evt.severity === 'WARNING') {
              dotColor = 'bg-amber-500 border-slate-950 ring-4 ring-amber-950/60';
              badgeStyle = 'bg-amber-950 text-amber-300 border-amber-700/60';
            } else if (evt.severity === 'SUCCESS' || evt.severity === 'INFO') {
              dotColor = 'bg-blue-500 border-slate-950 ring-4 ring-blue-950/60';
              badgeStyle = 'bg-blue-950 text-blue-300 border-blue-700/60';
            }

            return (
              <div key={evt.id || idx} className="relative group">
                {/* Timeline node dot */}
                <div
                  className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 ${dotColor} transition-transform group-hover:scale-125`}
                />

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5 hover:border-slate-700 transition shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white tracking-tight">
                        {evt.title}
                      </span>
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${badgeStyle}`}>
                        {evt.eventType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">{dateStr}</span>
                  </div>

                  <p className="text-xs text-slate-300">{evt.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
