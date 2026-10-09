import React from 'react';
import { CodeViolationDTO } from '@/types';
import { FileWarning, CheckCircle, AlertOctagon } from 'lucide-react';

interface CodeViolationsCardProps {
  violations?: CodeViolationDTO[];
}

export function CodeViolationsCard({ violations }: CodeViolationsCardProps) {
  const records = violations || [];
  const openViolations = records.filter(
    (v) => v.status !== 'RESOLVED' && v.status !== 'CLOSED'
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-amber-400" />
          <span>City of Omaha — Code Enforcement Citations</span>
        </h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          {openViolations.length} Active / {records.length} Total Cases
        </span>
      </div>

      {records.length === 0 ? (
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center">
          <CheckCircle className="w-6 h-6 text-emerald-500/70 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">No municipal code violations recorded</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            No active exterior or structural citations found on Omaha city inspection rolls.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((v) => {
            const dateStr = new Date(v.violationDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            const isOpen = v.status !== 'RESOLVED' && v.status !== 'CLOSED';

            return (
              <div
                key={v.id}
                className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {v.caseNumber}
                    </span>
                    <span className="text-slate-300 font-semibold">
                      {v.violationType.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        isOpen
                          ? 'bg-rose-950 text-rose-300 border-rose-700/60'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                      }`}
                    >
                      {v.status}
                    </span>
                    <span className="text-[11px] text-slate-400">{dateStr}</span>
                  </div>
                </div>

                <p className="text-slate-300">{v.description}</p>

                {v.inspectorNotes && (
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">Inspector Notes: </span>
                    {v.inspectorNotes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
