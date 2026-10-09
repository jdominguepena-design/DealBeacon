import React from 'react';
import { PropertyDTO } from '@/types';
import { Building, DollarSign, Home, Layers, Ruler } from 'lucide-react';

interface PropertySpecsCardProps {
  property: PropertyDTO;
}

export function PropertySpecsCard({ property }: PropertySpecsCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Building className="w-4 h-4 text-amber-400" />
          <span>Property Characteristics & Valuation</span>
        </h3>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          PIN: {property.parcelId}
        </span>
      </div>

      {/* Valuation Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Douglas Co. Assessed Value
          </span>
          <div className="text-lg font-extrabold text-white">
            ${(property.assessedValue || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400">Official Assessor Assessment</span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Estimated Market Value
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Inferred Est.
            </span>
          </div>
          <div className="text-lg font-extrabold text-amber-400">
            ${(property.estimatedValue || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400">Synthetic automated valuation</span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Estimated Equity
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Inferred Est.
            </span>
          </div>
          <div className="text-lg font-extrabold text-emerald-400">
            {Math.round((property.estimatedEquityPct || 0) * 100)}%
          </div>
          <span className="text-[10px] text-slate-400">Based on tenure & deed history</span>
        </div>
      </div>

      {/* Structural Attributes Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
        <div className="space-y-0.5">
          <span className="text-slate-400 block text-[11px]">Property Type</span>
          <span className="font-semibold text-slate-200">{property.propertyType.replace(/_/g, ' ')}</span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-400 block text-[11px]">Year Built</span>
          <span className="font-semibold text-slate-200">{property.yearBuilt || 'N/A'}</span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-400 block text-[11px]">Beds / Baths</span>
          <span className="font-semibold text-slate-200">
            {property.bedrooms || '-'} Beds / {property.bathrooms || '-'} Baths
          </span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-400 block text-[11px]">Building & Lot Size</span>
          <span className="font-semibold text-slate-200">
            {(property.squareFeet || 0).toLocaleString()} sqft ({property.lotSizeSqFt?.toLocaleString()} sqft lot)
          </span>
        </div>
      </div>
    </div>
  );
}
