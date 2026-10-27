import React from 'react';
import Link from 'next/link';
import { RealPropertySummaryDTO } from '@/lib/repositories/property-repository';
import { Building2, ArrowRight, ExternalLink, Landmark, Briefcase, User, HelpCircle } from 'lucide-react';

interface RealPropertyPreviewFeedProps {
  properties: RealPropertySummaryDTO[];
}

export function RealPropertyPreviewFeed({ properties }: RealPropertyPreviewFeedProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>Douglas County Parcel Previews</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Inside Omaha
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sample inventory from official Douglas County GIS and Assessor public records.
          </p>
        </div>
        <Link
          href="/properties"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition shrink-0"
        >
          <span>Explore All 2,839</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="divide-y divide-slate-800/80">
        {properties.map((prop) => {
          const owner = prop.owner;
          return (
            <div
              key={prop.id}
              className="p-4 sm:p-5 hover:bg-slate-800/40 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/properties/${prop.id}`}
                    className="text-sm sm:text-base font-bold text-white group-hover:text-amber-400 transition truncate"
                  >
                    {prop.hasAuthoritativeAddress ? prop.address : 'Address not assigned'}
                  </Link>

                  <span className="font-mono text-[11px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-amber-300 font-medium">
                    PIN: {prop.parcelId}
                  </span>

                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {prop.propertyType.replace('_', ' ')}
                  </span>

                  {prop.hasTaxSaleRecord && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-950/70 border border-amber-800/80 px-1.5 py-0.5 rounded"
                      title="Douglas County tax-sale snapshot record on file. Does not indicate active foreclosure or current delinquency."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      Tax-Sale Snapshot
                    </span>
                  )}
                  {prop.hasPropertyConditionComplaint && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 bg-sky-950/70 border border-sky-800/80 px-1.5 py-0.5 rounded"
                      title="Omaha 311 citizen report concerning property condition. Unverified complaint, not a citation."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                      311 Condition Complaint
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span className="text-slate-300 font-medium">
                    Owner: {owner?.ownerName || 'Public Record Unspecified'}
                  </span>

                  {owner?.ownerClassification === 'GOVERNMENT_OR_PUBLIC' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-300 bg-indigo-950/70 px-1.5 py-0.5 rounded border border-indigo-800">
                      <Landmark className="w-3 h-3 text-indigo-400" />
                      Government / Public
                    </span>
                  ) : owner?.ownerClassification === 'PROBABLE_BUSINESS' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800">
                      <Briefcase className="w-3 h-3 text-amber-400" />
                      Probable Business (Est.)
                    </span>
                  ) : owner?.ownerClassification === 'PROBABLE_INDIVIDUAL' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800">
                      <User className="w-3 h-3 text-emerald-400" />
                      Probable Individual (Est.)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      <HelpCircle className="w-3 h-3 text-slate-500" />
                      Unknown
                    </span>
                  )}

                  <span>•</span>
                  <span>
                    {prop.squareFeet ? `${prop.squareFeet.toLocaleString()} sq ft` : 'No building recorded'}
                  </span>
                  {prop.yearBuilt && <span>Built: {prop.yearBuilt}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Link
                  href={`/properties/${prop.id}`}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  View Details
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
