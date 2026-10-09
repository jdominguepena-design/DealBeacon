import React from 'react';
import { Flame, Receipt, FileWarning, Bookmark, Building, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface KPIStatsProps {
  stats: {
    totalProperties: number;
    highPriorityCount: number;
    taxDelinquentCount: number;
    openViolationsCount: number;
    savedPipelineCount: number;
  };
}

export function KPIStats({ stats }: KPIStatsProps) {
  const cards = [
    {
      label: 'High Priority (Score 80+)',
      value: stats.highPriorityCount,
      subtext: 'Immediate action candidates',
      icon: Flame,
      color: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30',
      href: '/properties?minScore=80',
    },
    {
      label: 'Douglas Co. Tax Delinquent',
      value: stats.taxDelinquentCount,
      subtext: 'Unpaid county property taxes',
      icon: Receipt,
      color: 'from-rose-500/20 to-pink-500/10 text-rose-400 border-rose-500/30',
      href: '/properties?hasTax=true',
    },
    {
      label: 'Active Omaha Code Cases',
      value: stats.openViolationsCount,
      subtext: 'Exterior / structural citations',
      icon: FileWarning,
      color: 'from-amber-500/20 to-yellow-500/10 text-amber-300 border-amber-500/30',
      href: '/properties?hasCode=true',
    },
    {
      label: 'Saved Lead Pipeline',
      value: stats.savedPipelineCount,
      subtext: 'Active investor follow-ups',
      icon: Bookmark,
      color: 'from-blue-500/20 to-indigo-500/10 text-blue-400 border-blue-500/30',
      href: '/saved',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Link
            key={idx}
            href={card.href}
            className={`p-5 rounded-xl bg-gradient-to-br bg-slate-900/90 border transition hover:scale-[1.02] hover:shadow-lg ${card.color}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {card.label}
              </span>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {card.value}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 font-medium">{card.subtext}</p>
          </Link>
        );
      })}
    </div>
  );
}
