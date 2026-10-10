import React from 'react';
import { Building2, Building, Home, Briefcase, MailCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface KPIStatsProps {
  stats: {
    totalEligible: number;
    withBuilding: number;
    noBuilding: number;
    probableBusiness: number;
    likelyAbsentee: number;
    unassignedAddress: number;
  };
}

export function KPIStats({ stats }: KPIStatsProps) {
  const cards = [
    {
      label: 'Eligible Omaha Parcels',
      value: stats.totalEligible.toLocaleString(),
      subtext: 'Inside Omaha municipal limits',
      icon: Building2,
      color: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30',
      href: '/properties',
    },
    {
      label: 'Structures Recorded',
      value: stats.withBuilding.toLocaleString(),
      subtext: 'Building area or year on file',
      icon: Building,
      color: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30',
      href: '/properties?hasBuilding=true',
    },
    {
      label: 'No Building Recorded',
      value: stats.noBuilding.toLocaleString(),
      subtext: 'Unimproved or vacant land',
      icon: Home,
      color: 'from-slate-500/20 to-slate-600/10 text-slate-300 border-slate-700',
      href: '/properties?hasBuilding=false',
    },
    {
      label: 'Probable Business / Entity',
      value: stats.probableBusiness.toLocaleString(),
      subtext: 'Corporate or entity grantee',
      icon: Briefcase,
      color: 'from-amber-500/20 to-yellow-500/10 text-amber-300 border-amber-500/30',
      href: '/properties?corporateStatus=PROBABLE_CORPORATE_NAME',
    },
    {
      label: 'Likely Absentee Owners',
      value: stats.likelyAbsentee.toLocaleString(),
      subtext: 'Mailing differs from parcel situs',
      icon: MailCheck,
      color: 'from-sky-500/20 to-blue-500/10 text-sky-400 border-sky-500/30',
      href: '/properties?absenteeStatus=ABSENTEE',
    },
    {
      label: 'Unassigned Situs Parcels',
      value: stats.unassignedAddress.toLocaleString(),
      subtext: 'No official street address',
      icon: AlertCircle,
      color: 'from-indigo-500/20 to-purple-500/10 text-indigo-300 border-indigo-500/30',
      href: '/properties?hasAuthoritativeAddress=false',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Link
            key={idx}
            href={card.href}
            className={`p-4 rounded-xl bg-gradient-to-br bg-slate-900/90 border transition hover:scale-[1.02] hover:shadow-lg flex flex-col justify-between ${card.color}`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">
                  {card.label}
                </span>
                <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-white tracking-tight">
                  {card.value}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 font-medium leading-tight">{card.subtext}</p>
          </Link>
        );
      })}
    </div>
  );
}

