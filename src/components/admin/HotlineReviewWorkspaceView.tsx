'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  HotlineReviewDatasetDTO,
  HotlineReviewItemDTO,
} from '@/lib/matching/hotline-review-service';
import { CandidateMatchClassification } from '@/lib/matching/hotline-matcher';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Building2,
  HelpCircle,
  XCircle,
  FileText,
  Compass,
  ArrowRight,
  Filter,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';

interface HotlineReviewWorkspaceViewProps {
  dataset: HotlineReviewDatasetDTO;
}

type FilterTier = 'ALL' | 'VALIDATION_SAMPLE' | CandidateMatchClassification;

function formatDistance(meters: number | null): string {
  if (meters === null) return 'No distance';
  if (meters === 0) return 'Inside Polygon';
  if (meters < 0.1) return '<0.1m to edge';
  return `${meters.toFixed(1)}m to edge`;
}

export function HotlineReviewWorkspaceView({ dataset }: HotlineReviewWorkspaceViewProps) {
  const [activeTier, setActiveTier] = useState<FilterTier>('VALIDATION_SAMPLE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<HotlineReviewItemDTO | null>(
    dataset.items.find((i) => i.isValidationSample) || dataset.items[0] || null
  );

  // Filtered list based on tier tab and search input
  const filteredItems = useMemo(() => {
    return dataset.items.filter((item) => {
      // Tier tab filter
      if (activeTier === 'VALIDATION_SAMPLE' && !item.isValidationSample) {
        return false;
      }
      if (activeTier !== 'ALL' && activeTier !== 'VALIDATION_SAMPLE') {
        if (item.evaluation.classification !== activeTier) {
          return false;
        }
      }

      // Search query (RequestID, category, location, PIN, address)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesReq = (item.requestId || '').toLowerCase().includes(q);
        const matchesCat = (item.reportCategory || '').toLowerCase().includes(q);
        const matchesProb = (item.problemType || '').toLowerCase().includes(q);
        const matchesLoc = (item.originalLocationText || '').toLowerCase().includes(q);
        const matchesPin = (item.evaluation.candidatePin || '').toLowerCase().includes(q);
        const matchesAddr = (item.evaluation.candidateAddress || '').toLowerCase().includes(q);
        if (!matchesReq && !matchesCat && !matchesProb && !matchesLoc && !matchesPin && !matchesAddr) {
          return false;
        }
      }

      return true;
    });
  }, [dataset.items, activeTier, searchQuery]);

  const counts = dataset.classificationCounts;

  const getBadgeStyle = (classification: CandidateMatchClassification) => {
    switch (classification) {
      case 'DUAL_EVIDENCE_CANDIDATE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'SPATIAL_ONLY_CANDIDATE':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'ADDRESS_ONLY_CANDIDATE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'AMBIGUOUS_MULTI_PARCEL':
      case 'AMBIGUOUS_CONFLICT':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'EXCLUDED_PUBLIC_INFRASTRUCTURE':
      case 'EXCLUDED_RIGHT_OF_WAY':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'UNMATCHED':
      default:
        return 'bg-slate-700/30 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Context Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Hotline Candidate Review Workspace
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Read-Only Audit Mode
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Local-development audit workspace for inspecting deterministic Hotline-to-parcel match candidates before permanent association.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition"
          >
            ← Admin Console
          </Link>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Neon DEV Status</div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              0 Mutations (Pure Read-Only)
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimers & Invariant Distinctions Card */}
      <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-5 text-xs space-y-3">
        <div className="flex items-center gap-2 font-bold text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Strict Legal & Data Integrity Classifications</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-amber-300 block">1. Unverified Citizen Complaints</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every Hotline report is an unconfirmed citizen call. It does <strong>not</strong> establish legal property-owner responsibility or constitute an official violation.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-sky-300 block">2. Geographic Candidates Only</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Dual-evidence or spatial matches represent spatial consistency with a parcel boundary, not legal culpability for the reported condition.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-purple-300 block">3. Right-of-Way & Infrastructure</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Street parking, curbs, potholes, and sidewalks occur in the public domain and are excluded or flagged even when geocoded to an adjacent parcel.
            </p>
          </div>
        </div>
      </div>

      {/* Tier Summary Counters & Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            Candidate Tiers & Stratified Samples
          </h2>
          <span className="text-xs text-slate-400">
            Showing {filteredItems.length} of {dataset.totalReports} records
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <button
            onClick={() => setActiveTier('VALIDATION_SAMPLE')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'VALIDATION_SAMPLE'
                ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
              50-Sample
            </span>
            <div className="text-xl font-extrabold text-amber-400 my-1">{dataset.validationSampleCount}</div>
            <span className="text-[10px] text-slate-400">Stratified Packet</span>
          </button>

          <button
            onClick={() => setActiveTier('DUAL_EVIDENCE_CANDIDATE')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'DUAL_EVIDENCE_CANDIDATE'
                ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
              Dual Evidence
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.DUAL_EVIDENCE_CANDIDATE}</div>
            <span className="text-[10px] text-slate-400">Address + Poly</span>
          </button>

          <button
            onClick={() => setActiveTier('SPATIAL_ONLY_CANDIDATE')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'SPATIAL_ONLY_CANDIDATE'
                ? 'bg-sky-500/10 border-sky-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
              Spatial Only
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.SPATIAL_ONLY_CANDIDATE}</div>
            <span className="text-[10px] text-slate-400">Poly Containment</span>
          </button>

          <button
            onClick={() => setActiveTier('ADDRESS_ONLY_CANDIDATE')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'ADDRESS_ONLY_CANDIDATE'
                ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
              Address Only
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.ADDRESS_ONLY_CANDIDATE}</div>
            <span className="text-[10px] text-slate-400">Curbside Offset</span>
          </button>

          <button
            onClick={() => setActiveTier('AMBIGUOUS_CONFLICT')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'AMBIGUOUS_CONFLICT'
                ? 'bg-rose-500/10 border-rose-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
              Conflict
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.AMBIGUOUS_CONFLICT}</div>
            <span className="text-[10px] text-slate-400">Addr vs Point</span>
          </button>

          <button
            onClick={() => setActiveTier('EXCLUDED_PUBLIC_INFRASTRUCTURE')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'EXCLUDED_PUBLIC_INFRASTRUCTURE'
                ? 'bg-purple-500/10 border-purple-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
              Infrastructure
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.EXCLUDED_PUBLIC_INFRASTRUCTURE}</div>
            <span className="text-[10px] text-slate-400">Pothole / Signal</span>
          </button>

          <button
            onClick={() => setActiveTier('EXCLUDED_RIGHT_OF_WAY')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'EXCLUDED_RIGHT_OF_WAY'
                ? 'bg-purple-500/10 border-purple-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
              ROW / Corridors
            </span>
            <div className="text-xl font-extrabold text-white my-1">{counts.EXCLUDED_RIGHT_OF_WAY}</div>
            <span className="text-[10px] text-slate-400">Intersections</span>
          </button>

          <button
            onClick={() => setActiveTier('ALL')}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
              activeTier === 'ALL'
                ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
              All Reports
            </span>
            <div className="text-xl font-extrabold text-white my-1">{dataset.totalReports}</div>
            <span className="text-[10px] text-slate-400">Full Inventory</span>
          </button>
        </div>
      </div>

      {/* Main Review Layout: Split Pane Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Candidates Table & Search (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
          {/* Search Bar */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by RequestID, category, location, PIN, or address..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto max-h-[700px] overflow-y-auto divide-y divide-slate-800/60 text-xs">
            {filteredItems.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-600" />
                <p>No candidate records match your current filter and search query.</p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItem?.reportId === item.reportId;
                const cls = item.evaluation.classification;
                return (
                  <div
                    key={item.reportId}
                    onClick={() => setSelectedItem(item)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-amber-500/10 border-l-4 border-l-amber-500'
                        : 'hover:bg-slate-800/40 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          #{item.requestId || 'NO-ID'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getBadgeStyle(
                            cls
                          )}`}
                        >
                          {cls.replace('_CANDIDATE', '').replace('EXCLUDED_', '')}
                        </span>
                        {item.isValidationSample && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase">
                            50-Sample
                          </span>
                        )}
                        {item.evaluation.hasRightOfWayProblemTypeWarning && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase flex items-center gap-1">
                            ROW Issue
                          </span>
                        )}
                      </div>

                      <div className="text-white font-medium truncate">
                        {item.originalLocationText || 'No location description'}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>{item.reportCategory}</span>
                        <span>•</span>
                        <span className="text-slate-400">{item.problemType}</span>
                        {item.evaluation.distanceToPolygonMeters !== null && (
                          <>
                            <span>•</span>
                            <span className="font-mono">
                              {formatDistance(item.evaluation.distanceToPolygonMeters)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {item.evaluation.candidatePin ? (
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Candidate PIN
                          </span>
                          <span className="font-mono font-bold text-white text-xs">
                            {item.evaluation.candidatePin}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No Parcel</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Read-Only Side-by-Side Comparison Inspector (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedItem ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 sticky top-24">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-amber-400">
                      Request #{selectedItem.requestId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getBadgeStyle(
                        selectedItem.evaluation.classification
                      )}`}
                    >
                      {selectedItem.evaluation.classification}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    Candidate Association Audit
                  </h3>
                </div>
              </div>

              {/* Side-by-Side Comparison Box */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Side-by-Side Location & Geometry Comparison
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Left: Citizen Report Source */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                      <FileText className="w-3.5 h-3.5" />
                      Citizen Report Source
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Location Text:</span>
                      <p className="text-white font-medium text-xs break-words">
                        {selectedItem.originalLocationText || 'None'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Category / Problem:</span>
                      <p className="text-slate-300 text-xs">
                        {selectedItem.reportCategory} / {selectedItem.problemType}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Normalized Address:</span>
                      <p className="font-mono text-amber-300 text-[11px]">
                        {selectedItem.evaluation.normalizedReportAddress || 'None'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">WGS84 Coordinates:</span>
                      <p className="font-mono text-slate-400 text-[10px]">
                        {selectedItem.latitude ? `${selectedItem.latitude.toFixed(5)}, ${selectedItem.longitude?.toFixed(5)}` : 'No coordinates'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Douglas County Assessor Parcel */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                      <Building2 className="w-3.5 h-3.5" />
                      Candidate Parcel
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Assessor PIN:</span>
                      <p className="font-mono text-white font-bold text-xs">
                        {selectedItem.evaluation.candidatePin || 'None Resolved'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Assessor Situs Address:</span>
                      <p className="font-mono text-emerald-300 text-[11px] break-words">
                        {selectedItem.evaluation.candidateAddress || 'No Situs Match'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Polygon Relationship:</span>
                      <p className="text-xs font-semibold text-slate-200">
                        {selectedItem.evaluation.spatialContainment ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Point Inside Polygon
                          </span>
                        ) : selectedItem.evaluation.distanceToPolygonMeters !== null ? (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> {formatDistance(selectedItem.evaluation.distanceToPolygonMeters)}
                          </span>
                        ) : (
                          <span className="text-slate-400">No Spatial Overlap</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Address Matching:</span>
                      <p className="text-xs font-semibold">
                        {selectedItem.evaluation.addressMatch ? (
                          <span className="text-emerald-400">Authoritative Situs Match</span>
                        ) : (
                          <span className="text-slate-400">Address Mismatch or None</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rationale & Warnings Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Matching Engine Evaluation Rationale
                </span>
                <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
                  {selectedItem.evaluation.locationConsistencyNotes}
                </p>

                {selectedItem.evaluation.hasRightOfWayProblemTypeWarning && (
                  <div className="mt-2 p-2.5 rounded-lg bg-purple-950/50 border border-purple-500/40 text-purple-300 text-[11px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
                    <span>
                      <strong>Public Right-of-Way Warning:</strong> Complaint problem type ({selectedItem.problemType}) refers to on-street vehicles, curbs, or sidewalks. Do not assume property owner responsibility.
                    </span>
                  </div>
                )}
              </div>

              {/* Audit Decision Safeguard Notice */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Decision Persistence Status
                </span>
                <p className="text-slate-400 text-[11px]">
                  No approval buttons or database update handlers are enabled during Stage 12B.1. All associations remain in-memory candidates.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center text-slate-500 space-y-2">
              <Eye className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs">Select any candidate record from the table to inspect details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
