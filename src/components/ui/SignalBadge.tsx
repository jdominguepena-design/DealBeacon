import React from 'react';
import {
  AlertTriangle,
  Receipt,
  Home,
  Clock,
  Building,
  UserX,
  FileWarning,
} from 'lucide-react';

interface SignalBadgeProps {
  type: string;
  label?: string;
  points?: number;
  size?: 'sm' | 'md';
}

export function SignalBadge({ type, label, points, size = 'sm' }: SignalBadgeProps) {
  let displayLabel = label || type.replace(/_/g, ' ');
  let Icon = AlertTriangle;
  let styleClasses = 'bg-slate-800 text-slate-300 border-slate-700';

  if (type.includes('TAX') || type === 'TAX_DELINQUENT') {
    displayLabel = label || 'Tax Delinquent';
    Icon = Receipt;
    styleClasses = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
  } else if (type.includes('CODE') || type === 'STRUCTURAL_CODE_VIOLATION' || type === 'EXTERIOR_CODE_VIOLATION') {
    displayLabel = label || 'Code Violation';
    Icon = FileWarning;
    styleClasses = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
  } else if (type.includes('ABSENTEE')) {
    displayLabel = label || 'Absentee Owner';
    Icon = UserX;
    styleClasses = 'bg-sky-950/80 text-sky-300 border-sky-700/60';
  } else if (type.includes('VACAN') || type === 'VACANCY_INDICATOR') {
    displayLabel = label || 'Vacancy Indicator';
    Icon = Home;
    styleClasses = 'bg-purple-950/80 text-purple-300 border-purple-700/60';
  } else if (type.includes('TENURE') || type.includes('LONG_TERM')) {
    displayLabel = label || 'Long Tenure';
    Icon = Clock;
    styleClasses = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
  }

  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-medium border shadow-xs tracking-tight ${sizeClasses} ${styleClasses}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{displayLabel}</span>
      {points !== undefined && (
        <span className="font-bold ml-0.5 opacity-80">+{points}</span>
      )}
    </span>
  );
}
