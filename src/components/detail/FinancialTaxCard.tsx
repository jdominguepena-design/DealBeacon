import React from 'react';
import { TaxRecordDTO } from '@/types';
import { Receipt, AlertTriangle, CheckCircle } from 'lucide-react';

interface FinancialTaxCardProps {
  taxes?: TaxRecordDTO[];
}

export function FinancialTaxCard({ taxes }: FinancialTaxCardProps) {
  const records = taxes || [];
  const delinquentRecords = records.filter((t) => t.isDelinquent);
  const totalDelinquent = delinquentRecords.reduce(
    (sum, t) => sum + (t.amountDelinquent || 0),
    0
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-400" />
          <span>Douglas County Treasurer — Property Tax Status</span>
        </h3>
        {totalDelinquent > 0 ? (
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/60 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>Delinquent Tax Balance: ${totalDelinquent.toLocaleString()}</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>Property Taxes Current</span>
          </span>
        )}
      </div>

      {records.length === 0 ? (
        <p className="text-xs text-slate-400">No county tax records available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                <th className="pb-2">Tax Year</th>
                <th className="pb-2">Total Assessed</th>
                <th className="pb-2">Annual Tax Due</th>
                <th className="pb-2">Delinquent Amount</th>
                <th className="pb-2">Status & Lien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {records.map((tax) => (
                <tr key={tax.id}>
                  <td className="py-2.5 font-bold text-white">{tax.taxYear}</td>
                  <td className="py-2.5">${tax.totalAssessed.toLocaleString()}</td>
                  <td className="py-2.5">${tax.annualTaxDue.toLocaleString()}</td>
                  <td className="py-2.5">
                    {tax.amountDelinquent > 0 ? (
                      <span className="text-rose-400 font-bold">
                        ${tax.amountDelinquent.toLocaleString()} ({tax.delinquentYears} yr{tax.delinquentYears > 1 ? 's' : ''})
                      </span>
                    ) : (
                      <span className="text-slate-500">$0.00</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {tax.taxSaleStatus ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        {tax.taxSaleStatus}
                      </span>
                    ) : tax.isDelinquent ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                        Past Due
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-emerald-400">
                        Paid / Current
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
