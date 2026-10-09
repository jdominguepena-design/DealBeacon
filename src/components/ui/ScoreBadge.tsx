import React from 'react';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
}

export function ScoreBadge({ score, size = 'md', showLabel = false }: ScoreBadgeProps) {
  let colorClasses = 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50';
  let badgeText = 'High Priority';

  if (score < 50) {
    colorClasses = 'bg-slate-900 text-slate-400 border-slate-700';
    badgeText = 'Low Distress';
  } else if (score < 75) {
    colorClasses = 'bg-amber-950/80 text-amber-300 border-amber-600/50';
    badgeText = 'Moderate';
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 font-bold',
    md: 'text-sm px-2.5 py-1 font-bold',
    lg: 'text-base px-3.5 py-1.5 font-extrabold',
    xl: 'text-2xl px-4 py-2 font-black',
  }[size];

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className={`inline-flex items-center justify-center rounded-md border tracking-tight shadow-sm ${colorClasses} ${sizeClasses}`}
        title={`Opportunity Score: ${score}/100`}
      >
        <span>{score}</span>
        <span className="text-[0.65em] font-normal opacity-70">/100</span>
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 font-medium">{badgeText}</span>
      )}
    </div>
  );
}
