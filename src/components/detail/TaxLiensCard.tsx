import React from 'react';
import { PropertyTaxLienDTO } from '@/lib/repositories/property-repository';
import { Landmark, AlertCircle, CheckCircle2, Calendar, Database } from 'lucide-react';

interface TaxLiensCardProps {
  taxLiens?: PropertyTaxLienDTO[];
}

export function TaxLiensCard({ taxLiens = [] }: TaxLiensCardProps) {
  const liens = taxLiens || [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Landmark className="w-4 h-4 text-amber-400" />
          <span>Douglas County Delinquent Tax Sale Records</span>
        </h3>
        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          {liens.length} Observed Listing{liens.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Snapshot Nature & Non-Foreclosure Explanatory Notice */}
      <div className="p-3.5 rounded-lg bg-sky-950/40 border border-sky-800/60 text-xs space-y-1">
        <div className="flex items-center gap-2 text-sky-300 font-bold tracking-wide">
          <AlertCircle className="w-4 h-4 shrink-0 text-sky-400" />
          <span>ANNUAL TAX SALE SNAPSHOT OBSERVATION — NOT ACTIVE FORECLOSURE</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed">
          Records represent appearances in the Douglas County Treasurer annual delinquent tax sale listing.
          A snapshot observation indicates that a tax sale certificate was offered or issued for the specified tax year.
          It does not imply an active judicial foreclosure, sheriff sale, deed forfeiture, or verified current unpaid balance.
        </p>
      </div>

      {/* Empty State */}
      {liens.length === 0 ? (
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
          <CheckCircle2 className="w-6 h-6 text-emerald-500/70 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">No matching record found in the imported tax-sale snapshot</p>
          <p className="text-[11px] text-slate-500 max-w-xl mx-auto leading-relaxed">
            This indicates the parcel does not appear in DealBeacon&apos;s currently imported Douglas County Treasurer annual delinquent tax sale snapshot lists. It does not certify that all general property taxes or special assessments are current.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                <th className="pb-2">Tax Year</th>
                <th className="pb-2">Certificate Amount</th>
                <th className="pb-2">Snapshot Status</th>
                <th className="pb-2">Observation Window</th>
                <th className="pb-2">Source Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {liens.map((lien) => {
                const firstObserved = lien.firstObservedAt
                  ? new Date(lien.firstObservedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—';

                const lastObserved = lien.lastObservedAt
                  ? new Date(lien.lastObservedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : null;

                return (
                  <tr key={lien.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 font-bold text-white font-mono">
                      {lien.taxYear || 'Unspecified'}
                    </td>
                    <td className="py-2.5 font-semibold text-amber-300 font-mono">
                      {lien.amountFormatted ||
                        (lien.amountCents !== null
                          ? `$${(lien.amountCents / 100).toFixed(2)}`
                          : 'Amount Unlisted')}
                    </td>
                    <td className="py-2.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                        {lien.observationStatus}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400 text-[11px]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>
                          {firstObserved}
                          {lastObserved && lastObserved !== firstObserved
                            ? ` to ${lastObserved}`
                            : ''}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 block">
                          PIN {lien.sourcePin} ({lien.matchStatus})
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 block">
                          {lien.sourceName} OID #{lien.sourceObjectId}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
