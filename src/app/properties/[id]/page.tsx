import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getEligiblePropertyById } from '@/lib/repositories/property-repository';
import {
  ArrowLeft,
  Building,
  Building2,
  ExternalLink,
  MapPin,
  Calendar,
  Layers,
  Ruler,
  Landmark,
  Briefcase,
  User,
  HelpCircle,
  ShieldCheck,
  Info,
  Clock,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { HotlineReportsCard } from '@/components/detail/HotlineReportsCard';
import { TaxLiensCard } from '@/components/detail/TaxLiensCard';
import { CodeViolationsCard } from '@/components/detail/CodeViolationsCard';

export const dynamic = 'force-dynamic';

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = await params;

  let property = null;
  try {
    property = await getEligiblePropertyById(id);
  } catch (err) {
    console.error('Error fetching property by ID from repository:', err);
    property = null;
  }

  // Strict fail-closed: return Next.js notFound (404) if property does not exist or is not INSIDE_OMAHA
  if (!property) {
    notFound();
  }

  const owner = property.ownerDetail;
  const provenance = property.provenanceDetail;
  const hasAuthoritativeAddress = property.hasAuthoritativeAddress;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Property Intelligence Listing</span>
        </Link>
      </div>

      {/* Main Title Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            {property.propertyType.replace('_', ' ')}
          </span>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
            Douglas County PIN: <strong className="text-amber-300">{property.parcelId}</strong>
          </span>
          <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
            Omaha Municipal Jurisdiction
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {hasAuthoritativeAddress ? (
                property.address
              ) : (
                <span className="italic text-slate-400">Address not assigned</span>
              )}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {property.city}, {property.state} {property.zip || ''}
            </p>
          </div>

          {/* Official County Action Links */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {property.assessorUrl && (
              <a
                href={property.assessorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-amber-500/20"
              >
                <span>County Assessor Beacon</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {property.treasurerUrl && (
              <a
                href={property.treasurerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition"
              >
                <span>Treasurer Tax Info</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Grid: Sourced Specs & Ownership Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Physical & Assessor Characteristics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-400" />
              <span>Physical Attributes & Class</span>
            </h2>
            <span className="text-[11px] text-slate-400">Douglas County GIS</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Building Area
              </span>
              <div className="text-base font-extrabold text-white">
                {property.squareFeet ? `${property.squareFeet.toLocaleString()} sq ft` : 'No building recorded'}
              </div>
              <span className="text-[10px] text-slate-500">Sourced assessor record</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Year Built
              </span>
              <div className="text-base font-extrabold text-white">
                {property.yearBuilt ? property.yearBuilt : 'Unlisted'}
              </div>
              <span className="text-[10px] text-slate-500">Structure vintage</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Lot Area
              </span>
              <div className="text-base font-extrabold text-white">
                {property.lotSizeSqFt ? `${property.lotSizeSqFt.toLocaleString()} sq ft` : 'Unlisted'}
              </div>
              <span className="text-[10px] text-slate-500">Planar polygon area</span>
            </div>
          </div>

          {/* Additional Ratings & Legal Description */}
          <div className="space-y-3 pt-2 text-xs border-t border-slate-800/80">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block text-[11px]">County Class</span>
                <span className="font-semibold text-slate-200">{property.countyClass || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">DCA Account Type</span>
                <span className="font-semibold text-slate-200">{property.dcaAccountType || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Assessor Condition</span>
                <span className="font-semibold text-slate-200">{property.condition || 'Unlisted'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Assessor Quality</span>
                <span className="font-semibold text-slate-200">{property.quality || 'Unlisted'}</span>
              </div>
            </div>

            {property.legalDescription && (
              <div className="pt-2 border-t border-slate-800/60">
                <span className="text-slate-400 block text-[11px]">
                  Legal Description (Douglas County Parcel GIS Source)
                </span>
                <p className="font-mono text-[11px] text-slate-300 mt-0.5 bg-slate-950 p-2 rounded border border-slate-800">
                  {property.legalDescription}
                </p>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Extracted from Douglas County GIS parcel attribute layer; not an independently verified abstract or deed title search.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Ownership & Absentee Intelligence */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Ownership & Taxpayer Record</span>
            </h2>
            <span className="text-[11px] text-slate-400">Deed Grantee Records</span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              County Record Owner
            </span>
            <div className="text-base font-bold text-white">
              {owner?.ownerName || 'Public Record Unspecified'}
            </div>

            {/* Derived Classification */}
            <div className="pt-1">
              {owner?.ownerClassification === 'GOVERNMENT_OR_PUBLIC' ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-950 px-2.5 py-1 rounded border border-indigo-800">
                  <Landmark className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Government / Public Agency</span>
                </span>
              ) : owner?.ownerClassification === 'PROBABLE_BUSINESS' ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950 px-2.5 py-1 rounded border border-amber-800">
                  <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                  <span>Probable Business / Entity</span>
                  <span className="text-[10px] uppercase font-bold text-amber-400/80">(Inferred)</span>
                </span>
              ) : owner?.ownerClassification === 'PROBABLE_INDIVIDUAL' ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950 px-2.5 py-1 rounded border border-emerald-800">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Probable Individual</span>
                  <span className="text-[10px] uppercase font-bold text-emerald-400/80">(Inferred)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  <span>Classification Unknown</span>
                </span>
              )}
            </div>
          </div>

          {/* Sourced Mailing Address & Absentee Determination */}
          <div className="space-y-3 pt-2 text-xs border-t border-slate-800/80">
            <div>
              <span className="text-slate-400 block text-[11px]">Sourced Mailing Address</span>
              {owner?.mailingAddress ? (
                <div className="text-slate-200 mt-0.5 space-y-0.5">
                  <p className="font-medium">{owner.mailingAddress}</p>
                  <p className="text-slate-400 text-[11px]">
                    {owner.mailingCity || ''}, {owner.mailingState || ''} {owner.mailingZip || ''}
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 italic mt-0.5">Mailing address not recorded in county layer</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
              <div>
                <span className="text-slate-400 block text-[11px]">Absentee Status</span>
                {owner?.absenteeStatus === 'ABSENTEE' ? (
                  <span className="text-sky-300 font-semibold block mt-0.5">
                    Likely absentee — based on mailing records
                  </span>
                ) : owner?.absenteeStatus === 'OWNER_OCCUPIED' ? (
                  <span className="text-slate-300 font-semibold block mt-0.5">
                    Mailing address matches property
                  </span>
                ) : (
                  <span className="text-slate-400 italic block mt-0.5">
                    Not Confirmed (Unknown)
                  </span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Out-of-State Status</span>
                {owner?.outOfStateStatus === 'OUT_OF_STATE' ? (
                  <span className="text-sky-300 font-semibold block mt-0.5">
                    Out of State ({owner.mailingState || 'Outside NE'})
                  </span>
                ) : owner?.outOfStateStatus === 'IN_STATE' ? (
                  <span className="text-slate-300 font-semibold block mt-0.5">
                    In State (Nebraska)
                  </span>
                ) : (
                  <span className="text-slate-400 italic block mt-0.5">
                    Unconfirmed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Public Records Intelligence: Code Violations, Hotline Reports & Delinquent Tax Liens */}
      <div className="space-y-6">
        <CodeViolationsCard violations={property.codeViolations} />
        <HotlineReportsCard hotlineReports={property.hotlineReports} />
        <TaxLiensCard taxLiens={property.taxLiens} />
      </div>

      {/* Data Provenance & Methodology Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <Database className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">Public Record Provenance & Safeguards</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400 font-semibold block">Authoritative Source Layer:</span>
            <span className="font-mono text-slate-200 block">
              {provenance?.sourceName || 'DOUGLAS_COUNTY_ASSESSOR'}
            </span>
            <span className="text-[11px] text-slate-500 block">
              Record ID: {provenance?.sourceRecordId || `PARCEL-${property.parcelId}`}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 font-semibold block">Last Ingestion Run:</span>
            <span className="text-slate-200 block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {provenance?.ingestedAt
                ? new Date(provenance.ingestedAt).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'Verified'}
            </span>
            <span className="text-[11px] text-emerald-400 block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Status: {provenance?.matchedStatus || 'MATCHED'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 font-semibold block">Data Integrity Policy:</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              DealBeacon displays authoritative Douglas County public records. Fabricated distress metrics, simulated financial models, and speculative code violations are excluded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
