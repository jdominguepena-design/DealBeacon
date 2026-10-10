'use client';

import React from 'react';
import Link from 'next/link';
import { RealPropertySummaryDTO } from '@/lib/repositories/property-repository';
import {
  Building,
  ExternalLink,
  MapPin,
  HelpCircle,
  Landmark,
  Briefcase,
  User,
  Layers,
} from 'lucide-react';

interface PropertyTableProps {
  properties: RealPropertySummaryDTO[];
}

export function PropertyTable({ properties }: PropertyTableProps) {
  if (properties.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <Building className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white">No properties match your active filters</h3>
        <p className="text-xs text-slate-400 mt-1">
          Try clearing search terms or resetting filters to explore the real Douglas County Omaha dataset.
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
              <th className="py-3.5 px-4">Property & PIN</th>
              <th className="py-3.5 px-4">Property Classification</th>
              <th className="py-3.5 px-4">Ownership & Category</th>
              <th className="py-3.5 px-4">Absentee Status</th>
              <th className="py-3.5 px-4">Physical Attributes</th>
              <th className="py-3.5 px-4 text-right">Official County Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-slate-300">
            {properties.map((prop) => {
              const owner = prop.owner;
              const hasAddress = prop.hasAuthoritativeAddress;

              return (
                <tr
                  key={prop.id}
                  className="hover:bg-slate-800/40 transition group"
                >
                  {/* Property & PIN */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[220px]">
                    {hasAddress ? (
                      <div className="font-bold text-white text-sm block">
                        {prop.address}
                      </div>
                    ) : (
                      <div className="text-slate-400 text-xs italic">
                        Address not assigned
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-amber-300 font-medium">
                        PIN: {prop.parcelId}
                      </span>
                      <span>{prop.city}, {prop.state}</span>
                    </div>
                  </td>

                  {/* Property Classification */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[160px]">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                      {prop.propertyType.replace('_', ' ')}
                    </span>
                    {prop.countyClass && (
                      <div className="text-[11px] text-slate-400">
                        Class: <span className="font-mono font-medium text-slate-300">{prop.countyClass}</span>
                      </div>
                    )}
                  </td>

                  {/* Ownership & Category */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[200px]">
                    <div className="font-semibold text-slate-200">
                      {owner?.ownerName || 'Public Record Unspecified'}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {owner?.ownerClassification === 'GOVERNMENT_OR_PUBLIC' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-300 bg-indigo-950/70 px-2 py-0.5 rounded border border-indigo-800">
                          <Landmark className="w-3 h-3 text-indigo-400" />
                          Government / Public Agency
                        </span>
                      ) : owner?.ownerClassification === 'PROBABLE_BUSINESS' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800" title="Estimated based on entity tokens in county deed record">
                          <Briefcase className="w-3 h-3 text-amber-400" />
                          Probable Business / Entity
                          <span className="text-[9px] uppercase tracking-wider text-amber-400/80">(Est.)</span>
                        </span>
                      ) : owner?.ownerClassification === 'PROBABLE_INDIVIDUAL' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800" title="Estimated based on absence of corporate entity tokens">
                          <User className="w-3 h-3 text-emerald-400" />
                          Probable Individual
                          <span className="text-[9px] uppercase tracking-wider text-emerald-400/80">(Est.)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          <HelpCircle className="w-3 h-3 text-slate-500" />
                          Classification Unknown
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Absentee Status */}
                  <td className="py-4 px-4 align-top space-y-1 min-w-[170px]">
                    {owner?.absenteeStatus === 'ABSENTEE' ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-950 text-sky-300 border border-sky-800">
                          Likely absentee — based on mailing records
                        </span>
                        {owner.outOfStateStatus === 'OUT_OF_STATE' && (
                          <div className="text-[10px] text-sky-400 font-medium">Out of State</div>
                        )}
                      </div>
                    ) : owner?.absenteeStatus === 'OWNER_OCCUPIED' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        Mailing address matches property
                      </span>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        Not Confirmed (Unknown)
                      </div>
                    )}

                    {owner?.hasSeparateMailingAddress && (
                      <div className="text-[10px] text-slate-400">
                        • Separate mailing address on file
                      </div>
                    )}
                  </td>

                  {/* Physical Attributes */}
                  <td className="py-4 px-4 align-top space-y-0.5 min-w-[170px] text-slate-300">
                    <div className="text-xs">
                      {prop.squareFeet ? (
                        <span><strong className="text-white">{prop.squareFeet.toLocaleString()}</strong> sq ft</span>
                      ) : (
                        <span className="text-slate-500">No building recorded</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {prop.yearBuilt ? (
                        <span>Built: <strong className="text-slate-300">{prop.yearBuilt}</strong></span>
                      ) : (
                        <span>Year: unlisted</span>
                      )}
                      {prop.lotSizeSqFt && (
                        <span> • Lot: {prop.lotSizeSqFt.toLocaleString()} sq ft</span>
                      )}
                    </div>
                    {(prop.condition || prop.quality) && (
                      <div className="text-[10px] text-slate-400">
                        {prop.condition && <span>Cond: {prop.condition}</span>}
                        {prop.condition && prop.quality && <span> | </span>}
                        {prop.quality && <span>Qual: {prop.quality}</span>}
                      </div>
                    )}
                  </td>

                  {/* Actions / County Links */}
                  <td className="py-4 px-4 align-top text-right shrink-0">
                    <div className="flex flex-col items-end gap-1.5">
                      <Link
                        href={`/properties/${prop.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 px-2.5 py-1 rounded transition shadow-xs"
                      >
                        <span>Details</span>
                      </Link>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {prop.assessorUrl && (
                          <a
                            href={prop.assessorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hover:border-amber-500/50 transition"
                            title="Official Douglas County Assessor Beacon"
                          >
                            <span>Assessor</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {prop.treasurerUrl && (
                          <a
                            href={prop.treasurerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hover:border-slate-700 transition"
                            title="Official Douglas County Treasurer Tax Information"
                          >
                            <span>Treasurer</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
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
