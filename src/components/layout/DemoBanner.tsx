'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, ShieldCheck } from 'lucide-react';

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-950/80 border-b border-amber-800/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-between shadow-inner">
      <div className="flex items-center gap-2 max-w-6xl mx-auto w-full">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-semibold text-amber-300">
          SYNTHETIC DEMO ENVIRONMENT (Omaha MVP):
        </span>
        <span className="text-amber-200/90 hidden sm:inline">
          All property ownership entities, code violation citations, and tax delinquency records are strictly synthetic demo fixtures. Estimated market values, equity, and absentee determinations are inferred model estimates, not official county records.
        </span>
        <span className="text-amber-200/90 sm:hidden">
          All records and distress signals are synthetic demo data.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-100 p-1 transition"
        title="Dismiss notice"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
