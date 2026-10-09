import React from 'react';
import { ScoreFactor } from '@/types';
import { ScoreBadge } from '../ui/ScoreBadge';
import { ConfidencePill } from '../ui/ConfidencePill';
import { CheckCircle2, Info, Sparkles } from 'lucide-react';

interface ScoreExplainabilityCardProps {
  score: number;
  confidence: any;
  breakdown: ScoreFactor[] | null;
  lastScoredAt?: string | null;
}

export function ScoreExplainabilityCard({
  score,
  confidence,
  breakdown,
  lastScoredAt,
}: ScoreExplainabilityCardProps) {
  const factors = breakdown || [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Opportunity Score & Explainability Breakdown
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Deterministic rule-based scoring calculated from verified Douglas County public signals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ConfidencePill level={confidence} />
          <ScoreBadge score={score} size="xl" showLabel />
        </div>
      </div>

      {/* Factors List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
          <span>Why this property ranks with a score of {score}/100:</span>
        </h3>

        {factors.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No active distress factors triggered for this parcel.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {factors.map((factor, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition"
              >
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-950 text-emerald-400 font-extrabold text-xs shrink-0 border border-emerald-700/60 shadow-xs">
                    +{factor.points}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {factor.label}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {factor.description}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                  {factor.category}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {lastScoredAt && (
        <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-800/60">
          <span>Scoring Engine: Rule-Based Deterministic Engine v1.0</span>
          <span>Last Computed: {new Date(lastScoredAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
