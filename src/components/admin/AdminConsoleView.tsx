'use client';

import React, { useState } from 'react';
import { IngestionRunDTO, SourceRecordDTO, SignalDTO } from '@/types';
import { SCORING_CONFIG } from '@/lib/scoring/scoring.config';
import {
  ShieldAlert,
  Database,
  RotateCw,
  FileCode,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AdminConsoleViewProps {
  runs: IngestionRunDTO[];
  sourceRecords: SourceRecordDTO[];
  signals: SignalDTO[];
  propertiesCount: number;
}

export function AdminConsoleView({
  runs,
  sourceRecords,
  signals,
  propertiesCount,
}: AdminConsoleViewProps) {
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);
  const [recalcSuccess, setRecalcSuccess] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<SourceRecordDTO | null>(
    sourceRecords[0] || null
  );

  const handleRecalculate = async () => {
    setRecalculating(true);
    setRecalcSuccess(null);
    try {
      const res = await fetch('/api/admin/recalculate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRecalcSuccess(`Successfully recalculated opportunity scores for ${data.updatedCount} properties.`);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Data Ingestion & Provenance Operations
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Monitor ingestion runs, inspect immutable raw source payloads, and manage scoring engine parameters.
          </p>
        </div>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
          <span>{recalculating ? 'Recalculating...' : 'Recalculate All Scores'}</span>
        </button>
      </div>

      {recalcSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{recalcSuccess}</span>
        </div>
      )}

      {/* Summary Ingestion Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Total Properties Resolved
          </span>
          <div className="text-2xl font-extrabold text-white">{propertiesCount}</div>
          <span className="text-[11px] text-slate-400">Douglas County Omaha Parcels</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Immutable Source Records
          </span>
          <div className="text-2xl font-extrabold text-amber-400">{sourceRecords.length}</div>
          <span className="text-[11px] text-slate-400">Preserved Raw Ingestion Payloads</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Distress Signals Derived
          </span>
          <div className="text-2xl font-extrabold text-emerald-400">{signals.length}</div>
          <span className="text-[11px] text-slate-400">Linked to Source Provenance</span>
        </div>
      </div>

      {/* Two Column: Ingestion Runs & Raw Source Record JSON Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingestion Runs History */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>Ingestion Runs Log</span>
            </h3>
            <span className="text-xs text-slate-400">{runs.length} Runs</span>
          </div>

          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white truncate">{run.sourceName}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1">
                  <span>
                    Records: <span className="text-slate-200">{run.recordsIngested}</span> • Signals: <span className="text-slate-200">{run.signalsCreated}</span>
                  </span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Raw Source Record JSON Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCode className="w-4 h-4 text-amber-400" />
              <span>Source Record Provenance Inspector</span>
            </h3>
            <span className="text-[10px] font-semibold text-slate-400">Immutable Raw Payload</span>
          </div>

          {/* Record Selector */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              Select Source Record to Inspect:
            </label>
            <select
              value={selectedRecord?.id || ''}
              onChange={(e) => {
                const found = sourceRecords.find((s) => s.id === e.target.value);
                setSelectedRecord(found || null);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {sourceRecords.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sourceName} — External ID: {s.sourceRecordId}
                </option>
              ))}
            </select>
          </div>

          {selectedRecord ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Ingested: {new Date(selectedRecord.ingestedAt).toLocaleString()}</span>
                <span className="text-emerald-400 font-semibold">{selectedRecord.matchedStatus}</span>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-amber-300/90 overflow-x-auto max-h-64">
                {JSON.stringify(selectedRecord.rawPayloadJson, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No source records to display.</p>
          )}
        </div>
      </div>

      {/* Configurable Scoring Engine Weights Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Opportunity Scoring Configuration Matrix</span>
          </h3>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            src/lib/scoring/scoring.config.ts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Financial Distress Rules */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Financial Distress</span>
              <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
                Max {SCORING_CONFIG.categories.FINANCIAL_DISTRESS.maxPoints} pts
              </span>
            </div>
            <ul className="space-y-1.5 text-slate-400 text-[11px] pt-1">
              <li className="flex justify-between">
                <span>Multi-Year Tax Delinquent</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.FINANCIAL_DISTRESS.rules.TAX_DELINQUENT_MULTI_YEAR.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Single-Year Tax Delinquent</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.FINANCIAL_DISTRESS.rules.TAX_DELINQUENT_SINGLE_YEAR.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Delinquent Balance &gt; $3k</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.FINANCIAL_DISTRESS.rules.HIGH_DELINQUENT_BALANCE.points}</span>
              </li>
            </ul>
          </div>

          {/* Property Distress Rules */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Property Distress</span>
              <span className="text-[10px] font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                Max {SCORING_CONFIG.categories.PROPERTY_DISTRESS.maxPoints} pts
              </span>
            </div>
            <ul className="space-y-1.5 text-slate-400 text-[11px] pt-1">
              <li className="flex justify-between">
                <span>Structural / Condemnation</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.PROPERTY_DISTRESS.rules.CODE_VIOLATION_STRUCTURAL.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Exterior Maintenance Citation</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.PROPERTY_DISTRESS.rules.CODE_VIOLATION_EXTERIOR.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Repeat Code Citations (2+)</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.PROPERTY_DISTRESS.rules.CODE_VIOLATION_REPEAT.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Vacancy / Board-Up Indicator</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.PROPERTY_DISTRESS.rules.VACANCY_INDICATOR.points}</span>
              </li>
            </ul>
          </div>

          {/* Ownership & Bonuses */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Ownership & Convergence</span>
              <span className="text-[10px] font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                Max {SCORING_CONFIG.categories.OWNERSHIP_SIGNALS.maxPoints} pts
              </span>
            </div>
            <ul className="space-y-1.5 text-slate-400 text-[11px] pt-1">
              <li className="flex justify-between">
                <span>Absentee (Out-of-State)</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.OWNERSHIP_SIGNALS.rules.ABSENTEE_OUT_OF_STATE.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Absentee (In-State)</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.OWNERSHIP_SIGNALS.rules.ABSENTEE_IN_STATE.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Long Tenure (&gt;15 Years)</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.OWNERSHIP_SIGNALS.rules.LONG_TERM_OWNERSHIP.points}</span>
              </li>
              <li className="flex justify-between">
                <span>Multi-Distress Convergence Bonus</span>
                <span className="text-emerald-400 font-bold">+{SCORING_CONFIG.categories.COMPOUND_BONUS.points}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
