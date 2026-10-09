import React from 'react';
import { OwnershipRecordDTO } from '@/types';
import { UserCheck, MapPin, Calendar, FileText, UserX, ShieldAlert } from 'lucide-react';

interface OwnershipCardProps {
  ownership?: OwnershipRecordDTO | null;
  propertyAddress: string;
}

export function OwnershipCard({ ownership, propertyAddress }: OwnershipCardProps) {
  if (!ownership) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-2">Ownership & Taxpayer Record</h3>
        <p className="text-xs text-slate-400">No ownership records available for this parcel.</p>
      </div>
    );
  }

  const purchaseDateFormatted = ownership.purchaseDate
    ? new Date(ownership.purchaseDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-400" />
          <span>Ownership & Absentee Intelligence</span>
        </h3>
        {ownership.isAbsentee ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700/60 flex items-center gap-1">
            <UserX className="w-3 h-3 text-sky-400" />
            <span>Absentee Owner (Inferred)</span>
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Owner Occupied (Inferred)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Record Owner */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Record Owner / Entity
          </span>
          <div className="text-base font-bold text-white truncate">
            {ownership.ownerName}
          </div>
          <div className="text-xs text-slate-400 space-y-1 pt-1">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-300 font-medium">{ownership.mailingAddress}</span>
                <span className="block text-slate-400">
                  {ownership.mailingCity}, {ownership.mailingState} {ownership.mailingZip}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Purchase & Tenure History */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Acquisition & Tenure
          </span>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <span className="text-slate-400 block text-[11px]">Recorded Purchase Date</span>
              <span className="font-semibold text-slate-200">{purchaseDateFormatted}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Ownership Tenure</span>
              <span className="font-bold text-emerald-400">
                {ownership.ownershipYears ? `${Math.round(ownership.ownershipYears)} Years` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Recorded Consideration</span>
              <span className="font-semibold text-slate-200">
                {ownership.purchasePrice ? `$${ownership.purchasePrice.toLocaleString()}` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Deed Instrument</span>
              <span className="font-semibold text-slate-200">{ownership.deedType || 'Standard Deed'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
