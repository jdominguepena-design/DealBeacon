import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPropertyById } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ScoreExplainabilityCard } from '@/components/detail/ScoreExplainabilityCard';
import { PropertySpecsCard } from '@/components/detail/PropertySpecsCard';
import { OwnershipCard } from '@/components/detail/OwnershipCard';
import { FinancialTaxCard } from '@/components/detail/FinancialTaxCard';
import { CodeViolationsCard } from '@/components/detail/CodeViolationsCard';
import { InteractiveTimeline } from '@/components/detail/InteractiveTimeline';
import { InvestorWorkflowBar } from '@/components/detail/InvestorWorkflowBar';
import { ArrowLeft, MapPin, Building, ShieldCheck, Share2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const property = await getPropertyById(id, user.id);

  if (!property) {
    notFound();
  }

  const savedRecord = property.savedProperties?.[0] || null;
  const initialNotes = property.notes || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Property Intelligence Table</span>
        </Link>
      </div>

      {/* Main Property Title Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {property.neighborhood || 'Omaha'}
            </span>
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
              Douglas County PIN: {property.parcelId}
            </span>
            <span className="text-xs text-slate-400">
              {property.city}, {property.state} {property.zip}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {property.address}
          </h1>
        </div>
      </div>

      {/* Investor Workflow Bar (Save / Lead Status / Notes) */}
      <InvestorWorkflowBar
        propertyId={property.id}
        savedRecord={savedRecord}
        initialNotes={initialNotes}
        userId={user.id}
      />

      {/* Score Explainability Card */}
      <ScoreExplainabilityCard
        score={property.opportunityScore}
        confidence={property.dataConfidence}
        breakdown={property.scoreBreakdownJson}
        lastScoredAt={property.lastScoredAt}
      />

      {/* Two Column Layout: Core Property Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PropertySpecsCard property={property} />
        <OwnershipCard
          ownership={property.ownershipRecords?.[0] || null}
          propertyAddress={property.address}
        />
      </div>

      {/* Two Column Layout: Distress Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FinancialTaxCard taxes={property.taxRecords} />
        <CodeViolationsCard violations={property.codeViolations} />
      </div>

      {/* Chronological Narrative Timeline */}
      <InteractiveTimeline events={property.events} />
    </div>
  );
}
