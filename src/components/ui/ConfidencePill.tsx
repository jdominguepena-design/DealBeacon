import React from 'react';
import { ConfidenceLevel } from '@/types';
import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';

interface ConfidencePillProps {
  level: ConfidenceLevel;
}

export function ConfidencePill({ level }: ConfidencePillProps) {
  const config = {
    HIGH: {
      label: 'Verified / High Data Confidence',
      classes: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
      icon: ShieldCheck,
    },
    MEDIUM: {
      label: 'Standard Confidence',
      classes: 'bg-blue-950/60 text-blue-300 border-blue-700/50',
      icon: Shield,
    },
    LOW: {
      label: 'Preliminary / Needs Verification',
      classes: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
      icon: ShieldAlert,
    },
  }[level] || {
    label: level,
    classes: 'bg-slate-900 text-slate-300 border-slate-700',
    icon: Shield,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${config.classes}`}
      title={config.label}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{level} CONFIDENCE</span>
    </span>
  );
}
