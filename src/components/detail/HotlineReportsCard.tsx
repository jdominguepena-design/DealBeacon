'use client';

import React, { useState } from 'react';
import { PropertyHotlineReportDTO } from '@/lib/repositories/property-repository';
import {
  AlertTriangle,
  FileQuestion,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  Tag,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface HotlineReportsCardProps {
  hotlineReports?: PropertyHotlineReportDTO[];
  initialDisplayLimit?: number;
}

export function HotlineReportsCard({
  hotlineReports = [],
  initialDisplayLimit = 5,
}: HotlineReportsCardProps) {
  const [showAll, setShowAll] = useState(false);
  const reports = hotlineReports || [];
  const displayReports = showAll ? reports : reports.slice(0, initialDisplayLimit);
  const hasMore = reports.length > initialDisplayLimit;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileQuestion className="w-4 h-4 text-amber-400" />
          <span>Omaha 311 Citizen Hotline Reports</span>
        </h3>
        <div className="flex items-center gap-2">
          {hasMore && (
            <span className="text-[11px] text-slate-400">
              Showing {displayReports.length} of {reports.length}
            </span>
          )}
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {reports.length} Associated Report{reports.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Mandatory Unverified Complaint Disclaimer */}
      <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
        <div className="flex items-center gap-2 text-amber-300 font-bold tracking-wide">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>UNVERIFIED CITIZEN COMPLAINT — NOT AN OFFICIAL CODE VIOLATION</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed">
          Hotline submissions represent raw citizen requests recorded via Omaha Mayor&apos;s Hotline (311).
          They reflect citizen observations and service inquiries, not verified municipal housing citations,
          proven code violations, or owner legal liability.
        </p>
      </div>

      {/* Empty State */}
      {reports.length === 0 ? (
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
          <CheckCircle2 className="w-6 h-6 text-emerald-500/70 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">No linked Hotline reports found in DealBeacon&apos;s currently imported records</p>
          <p className="text-[11px] text-slate-500 max-w-xl mx-auto leading-relaxed">
            This does not establish that the property has no complaints or municipal violations. Public records reflect only reports successfully matched from current city data batches.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayReports.map((report) => {
            const reportedDate = report.reportedAt
              ? new Date(report.reportedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Date unrecorded';

            const completedDate = report.completedAt
              ? new Date(report.completedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : null;

            return (
              <div
                key={report.id}
                className={`p-3.5 rounded-lg bg-slate-950 border space-y-2.5 text-xs ${
                  report.isDisputed
                    ? 'border-rose-900/60 bg-rose-950/10'
                    : 'border-slate-800'
                }`}
              >
                {/* Disputed Banner if off-site / disputed link */}
                {report.isDisputed && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">PARCEL ASSOCIATION UNDER REVIEW: </span>
                      {report.disputeReason ||
                        'Source narrative references an off-site civic facility or municipal park. Suppressed from property distress scoring and condition signals.'}
                    </div>
                  </div>
                )}

                {/* Top Row: Request ID, Category, Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Req #{report.requestId}
                    </span>
                    <span className="font-semibold text-slate-200">
                      {report.reportCategory || 'General Inquiry'}
                    </span>
                  </div>

                  {/* Investor Relevance Badge */}
                  <div>
                    {report.investorRelevance === 'POTENTIAL_PROPERTY_CONDITION' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-amber-400" />
                        <span>Potential Property Condition</span>
                      </span>
                    )}
                    {report.investorRelevance === 'CONTEXT_ONLY' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1">
                        <Info className="w-3 h-3 text-sky-400" />
                        <span>Occupant / Context Only</span>
                      </span>
                    )}
                    {report.investorRelevance === 'PUBLIC_SERVICE_OR_INFRASTRUCTURE' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">
                        <Info className="w-3 h-3 text-indigo-400" />
                        <span>Public Service / Infrastructure</span>
                      </span>
                    )}
                    {report.investorRelevance === 'UNKNOWN' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3 text-slate-400" />
                        <span>Relevance Unclassified</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Problem Type & Location */}
                <div className="space-y-1">
                  {report.problemType && (
                    <div className="text-slate-300">
                      <span className="text-slate-500 font-medium">Problem: </span>
                      <span className="font-semibold text-slate-200">{report.problemType}</span>
                    </div>
                  )}
                  {report.locationText && (
                    <div className="text-slate-400 text-[11px]">
                      <span className="text-slate-500 font-medium">Reported Location: </span>
                      <span className="font-mono">{report.locationText}</span>
                    </div>
                  )}
                </div>

                {/* Association Audit Evidence */}
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                  <div>
                    <span className="text-slate-500">Location Match Method: </span>
                    <span className="font-mono text-slate-300">
                      {report.matchMethod || 'SPATIAL_INTERSECTION'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Confidence: </span>
                    <span className="font-semibold text-emerald-400">
                      {report.matchConfidence || report.matchStatus}
                    </span>
                  </div>
                </div>

                {/* Footer: Dates & Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-[11px] text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Reported: {reportedDate}
                    </span>
                    {completedDate && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3 h-3 text-slate-500" />
                        Closed: {completedDate}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        report.status?.toUpperCase() === 'CLOSED' ||
                        report.status?.toUpperCase() === 'COMPLETED'
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-amber-950 text-amber-300 border-amber-800'
                      }`}
                    >
                      Status: {report.status || 'UNSPECIFIED'}
                    </span>

                    {report.sourceUrl ? (
                      <a
                        href={report.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline"
                        title="View raw record query on Omaha Hotline ArcGIS REST API"
                      >
                        <span>REST Record</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : report.sourceObjectId ? (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        OID #{report.sourceObjectId}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-amber-400 hover:text-amber-300 font-semibold transition"
              >
                {showAll ? (
                  <>
                    <span>Show Recent {initialDisplayLimit} Only</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>View All {reports.length} Reports</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
