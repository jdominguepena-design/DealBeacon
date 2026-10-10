import React from 'react';
import Link from 'next/link';
import { ArrowRight, PieChart } from 'lucide-react';

interface PropertyTypeDistributionProps {
  distribution: Array<{
    type: string;
    label: string;
    count: number;
    percentage: number;
  }>;
}

export function PropertyTypeDistribution({ distribution }: PropertyTypeDistributionProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-amber-400" />
            <span>Property Class Distribution</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Breakdown across Douglas County Assessor classifications.
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {distribution.map((item) => (
          <Link
            key={item.type}
            href={`/properties?propertyType=${item.type}`}
            className="group block p-2 rounded-lg hover:bg-slate-800/50 transition"
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-300 group-hover:text-amber-400 transition">
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">{item.count.toLocaleString()}</span>
                <span className="text-slate-500 font-medium w-10 text-right">{item.percentage}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
              <div
                className="bg-amber-500 h-1.5 rounded-full group-hover:bg-amber-400 transition"
                style={{ width: `${Math.max(2, item.percentage)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
