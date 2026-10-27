import React from 'react';
import { CodeViolationDTO } from '@/types';
import { FileWarning, CheckCircle, AlertOctagon, ExternalLink, Calendar, Clock, Home, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CodeViolationsCardProps {
  violations?: CodeViolationDTO[];
}

export function CodeViolationsCard({ violations }: CodeViolationsCardProps) {
  const records = violations || [];
  
  // Sort: Active enforcement first, then pending inspections, then historical closed cases
  const sortedRecords = [...records].sort((a, b) => {
    const stageRank = (stage?: string) => {
      if (stage === 'ACTIVE_CONFIRMED_VIOLATION' || stage === 'ACTIVE_LEGAL_CITATION') return 1;
      if (stage === 'INSPECTION_PENDING') return 2;
      if (stage === 'CLOSED_UNFOUNDED') return 3;
      return 4; // CLOSED_HISTORICAL or other
    };
    const rankA = stageRank(a.enforcementStage);
    const rankB = stageRank(b.enforcementStage);
    if (rankA !== rankB) return rankA - rankB;
    const dateA = new Date(a.openedDate || a.violationDate || 0).getTime();
    const dateB = new Date(b.openedDate || b.violationDate || 0).getTime();
    return dateB - dateA;
  });

  const activeEnforcement = sortedRecords.filter(
    (v) =>
      v.enforcementStage === 'ACTIVE_CONFIRMED_VIOLATION' ||
      v.enforcementStage === 'ACTIVE_LEGAL_CITATION' ||
      v.statusCurrentMapped === 'Active Violation' ||
      v.statusCurrentMapped === 'Citation Issued'
  );

  const pendingInspections = sortedRecords.filter(
    (v) =>
      v.enforcementStage === 'INSPECTION_PENDING' ||
      v.statusCurrentMapped === 'Inspection Scheduled' ||
      v.statusCurrentMapped === 'Awaiting Staff Review'
  );

  const historicalClosed = sortedRecords.filter(
    (v) =>
      v.enforcementStage === 'CLOSED_HISTORICAL' ||
      v.enforcementStage === 'CLOSED_COMPLIED' ||
      v.enforcementStage === 'CLOSED_UNFOUNDED' ||
      v.statusCurrentMapped === 'Closed' ||
      v.statusCurrentMapped === 'Citation Record Closed'
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-amber-400" />
            <span>City of Omaha — Housing Inspection Cases</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Official Accela Planning code-enforcement records via Douglas County GIS
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeEnforcement.length > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/60">
              {activeEnforcement.length} Active
            </span>
          )}
          {pendingInspections.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
              {pendingInspections.length} Pending
            </span>
          )}
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {records.length} Total
          </span>
        </div>
      </div>

      {sortedRecords.length === 0 ? (
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center">
          <CheckCircle className="w-6 h-6 text-emerald-500/70 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">No municipal code enforcement cases recorded</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            No active exterior, structural, or housing inspection citations found on Omaha city inspection rolls.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRecords.map((v) => {
            const stage = v.enforcementStage || 'UNKNOWN_STAGE';
            const isActive =
              stage === 'ACTIVE_CONFIRMED_VIOLATION' ||
              v.statusCurrentMapped === 'Active Violation';
            const isCitation =
              stage === 'ACTIVE_LEGAL_CITATION' ||
              v.statusCurrentMapped === 'Citation Issued';
            const isPending =
              stage === 'INSPECTION_PENDING' ||
              v.statusCurrentMapped === 'Inspection Scheduled' ||
              v.statusCurrentMapped === 'Awaiting Staff Review';
            const isUnfounded =
              stage === 'CLOSED_UNFOUNDED' ||
              v.statusCurrent?.toLowerCase().includes('no violati');
            const isClosed = !isActive && !isCitation && !isPending;

            const formatDate = (d?: string | null) => {
              if (!d) return null;
              try {
                return new Date(d).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
              } catch {
                return d;
              }
            };

            const openedStr = formatDate(v.openedDate || v.violationDate);
            const initialInspStr = formatDate(v.initialInspectionDate);
            const lastReInspStr = formatDate(v.lastReInspectionDate);
            const deadlineStr = formatDate(v.complianceDeadline);
            const complianceStr = formatDate(v.complianceDate);
            const sourceUpdateStr = formatDate(v.lastUpdatedSource);

            return (
              <div
                key={v.id || v.caseNumber}
                className={`p-3.5 rounded-lg border space-y-3 text-xs ${
                  isActive || isCitation
                    ? 'bg-slate-950 border-rose-900/40'
                    : isPending
                    ? 'bg-slate-950/80 border-amber-900/40'
                    : 'bg-slate-950/50 border-slate-800/80 opacity-90'
                }`}
              >
                {/* Header: Case #, Type, and Official Status */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {v.caseNumber}
                    </span>
                    <span className="text-slate-200 font-semibold">
                      {v.caseType || v.violationType?.replace(/_/g, ' ') || 'Housing Inspection Case'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-rose-950 text-rose-300 border-rose-700/60">
                        Active Violation
                      </span>
                    ) : isCitation ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-purple-950 text-purple-300 border-purple-700/60">
                        Citation Issued
                      </span>
                    ) : isPending ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-amber-950 text-amber-300 border-amber-700/60">
                        Inspection Scheduled (Pending)
                      </span>
                    ) : isUnfounded ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-950 text-emerald-300 border-emerald-700/60">
                        Closed — No Violation Found
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded border bg-slate-800/80 text-slate-300 border-slate-700">
                        {v.statusCurrentMapped || v.statusCurrent || 'Closed'} (Historical)
                      </span>
                    )}

                    {openedStr && <span className="text-[11px] text-slate-400">Opened {openedStr}</span>}
                  </div>
                </div>

                {/* Distress Signals: Active vs Historical Warnings */}
                {(v.isVacant || v.hasDemoOrder) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Active vacancy vs Historical vacancy note */}
                    {v.isVacant && (
                      isActive ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 border border-amber-700/60 text-amber-300 text-[11px] font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            Currently Flagged Vacant by City Inspector
                            {v.vacateReason ? ` (${v.vacateReason})` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[11px]">
                          <Home className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            Historical: Flagged vacant during case
                            {v.vacateReason ? ` (${v.vacateReason})` : ''} — Case closed
                          </span>
                        </div>
                      )
                    )}

                    {/* Active demo order vs Historical demo note */}
                    {v.hasDemoOrder && (
                      isActive ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/80 border border-rose-600/80 text-rose-200 text-[11px] font-bold">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                          <span>
                            Active Demolition Order Issued
                            {v.demoIssuedDate ? ` on ${formatDate(v.demoIssuedDate)}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[11px]">
                          <AlertOctagon className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            Historical: Demolition order issued {v.demoIssuedDate ? formatDate(v.demoIssuedDate) : ''} — Case closed
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Pending Inspection Disclaimer */}
                {isPending && (
                  <p className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-800/40 p-2 rounded">
                    <strong>Informational Note:</strong> An initial inspection is scheduled or awaiting review. Non-compliance has not yet been verified by a municipal inspector.
                  </p>
                )}

                {/* Inspection Dates & Timelines Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Initial Inspection:</span>
                    <span className="text-slate-300 font-medium">{initialInspStr || 'Not scheduled'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Latest Re-Inspection:</span>
                    <span className="text-slate-300 font-medium">{lastReInspStr || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Compliance Deadline:</span>
                    <span className="text-slate-300 font-medium">{deadlineStr || 'None assigned'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Case Outcome:</span>
                    <span className="text-slate-300 font-medium">
                      {complianceStr ? `Complied ${complianceStr}` : v.statusCurrent || 'In Review'}
                    </span>
                  </div>
                </div>

                {/* Inspector Notes / Description */}
                {v.inspectorNotes && (
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">Inspector Notes: </span>
                    {v.inspectorNotes}
                  </div>
                )}

                {/* Footer: Official City Accela Portal Link & Source Sync Date */}
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/40 text-[11px] text-slate-500">
                  <span>
                    {sourceUpdateStr ? `Upstream city record updated: ${sourceUpdateStr}` : 'Official municipal record'}
                  </span>
                  {v.accelaUrl && (
                    <a
                      href={v.accelaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      <span>View Official Case on Omaha Permits Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
