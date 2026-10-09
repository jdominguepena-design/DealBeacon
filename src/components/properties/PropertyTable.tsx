'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PropertyDTO } from '@/types';
import { ScoreBadge } from '../ui/ScoreBadge';
import { ConfidencePill } from '../ui/ConfidencePill';
import { SignalBadge } from '../ui/SignalBadge';
import {
  Bookmark,
  Building,
  Check,
  ChevronRight,
  ExternalLink,
  MapPin,
  Receipt,
  FileWarning,
} from 'lucide-react';

interface PropertyTableProps {
  properties: PropertyDTO[];
  userId: string;
}

export function PropertyTable({ properties, userId }: PropertyTableProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(
    new Set(
      properties
        .filter((p) => p.savedProperties && p.savedProperties.length > 0)
        .map((p) => p.id)
    )
  );

  const handleToggleSave = async (propertyId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/properties/${propertyId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESEARCHING' }),
      });
      const data = await res.json();
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (data.isSaved) next.add(propertyId);
        else next.delete(propertyId);
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (properties.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <Building className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white">No properties match your active filters</h3>
        <p className="text-xs text-slate-400 mt-1">
          Try clearing search terms or selecting fewer distress filters to expand the Omaha dataset.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-3.5 px-4">Score</th>
              <th className="py-3.5 px-4">Property & PIN</th>
              <th className="py-3.5 px-4">Confidence</th>
              <th className="py-3.5 px-4">Ownership</th>
              <th className="py-3.5 px-4">Distress Signals</th>
              <th className="py-3.5 px-4">Est. Valuation & Equity</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-slate-300">
            {properties.map((prop) => {
              const isSaved = savedIds.has(prop.id);
              const owner = prop.ownershipRecords?.[0];
              const taxDelinquent = prop.taxRecords?.find((t) => t.isDelinquent);
              const totalDelinquent = prop.taxRecords?.reduce(
                (s, t) => s + (t.amountDelinquent || 0),
                0
              ) || 0;
              const openViolations = prop.codeViolations?.filter(
                (v) => v.status !== 'RESOLVED' && v.status !== 'CLOSED'
              ) || [];

              return (
                <tr
                  key={prop.id}
                  className="hover:bg-slate-800/40 transition group"
                >
                  {/* Score */}
                  <td className="py-4 px-4 align-top">
                    <ScoreBadge score={prop.opportunityScore} size="md" />
                  </td>

                  {/* Property & PIN */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[200px]">
                    <Link
                      href={`/properties/${prop.id}`}
                      className="font-bold text-white hover:text-amber-400 text-sm block transition"
                    >
                      {prop.address}
                    </Link>
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        PIN: {prop.parcelId}
                      </span>
                      <span>{prop.neighborhood || 'Omaha'}</span>
                    </div>
                  </td>

                  {/* Confidence */}
                  <td className="py-4 px-4 align-top">
                    <ConfidencePill level={prop.dataConfidence} />
                  </td>

                  {/* Ownership */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[180px]">
                    <div className="font-semibold text-slate-200 truncate">
                      {owner?.ownerName || 'Synthetic Owner'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {owner?.isOutOfState ? (
                        <span className="text-sky-400 font-semibold">
                          Absentee ({owner.mailingState})
                        </span>
                      ) : owner?.isAbsentee ? (
                        <span className="text-sky-300 font-medium">
                          Absentee (NE)
                        </span>
                      ) : (
                        <span className="text-slate-400">Owner Occupied</span>
                      )}
                      {owner?.ownershipYears && (
                        <span className="ml-1.5">• {Math.round(owner.ownershipYears)} yrs tenure</span>
                      )}
                    </div>
                  </td>

                  {/* Distress Signals */}
                  <td className="py-4 px-4 align-top min-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      {totalDelinquent > 0 && (
                        <SignalBadge
                          type="TAX_DELINQUENT"
                          label={`Tax Due $${totalDelinquent.toLocaleString()}`}
                          size="sm"
                        />
                      )}
                      {openViolations.length > 0 && (
                        <SignalBadge
                          type="CODE_VIOLATION"
                          label={`${openViolations.length} Code Case${
                            openViolations.length > 1 ? 's' : ''
                          }`}
                          size="sm"
                        />
                      )}
                      {prop.signals
                        ?.filter((s) => s.signalType === 'VACANCY_INDICATOR')
                        .map((s) => (
                          <SignalBadge
                            key={s.id}
                            type="VACANCY_INDICATOR"
                            label="Vacant / Boarded"
                            size="sm"
                          />
                        ))}
                    </div>
                  </td>

                  {/* Valuation & Equity */}
                  <td className="py-4 px-4 align-top space-y-0.5 min-w-[150px]">
                    <div className="font-bold text-white">
                      ${(prop.estimatedValue || prop.assessedValue || 0).toLocaleString()}
                      <span className="text-[10px] text-slate-400 font-normal ml-1">(Est.)</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Assessed: ${(prop.assessedValue || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-semibold">
                      {Math.round((prop.estimatedEquityPct || 0) * 100)}% Est. Equity
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-4 align-top text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => handleToggleSave(prop.id, e)}
                        className={`p-2 rounded-lg border transition ${
                          isSaved
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                        title={isSaved ? 'Lead Saved' : 'Save Lead'}
                      >
                        {isSaved ? (
                          <Check className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Link
                        href={`/properties/${prop.id}`}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition shadow-xs"
                      >
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
