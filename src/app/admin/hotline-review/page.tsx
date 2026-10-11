import React from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getHotlineReviewDataset } from '@/lib/matching/hotline-review-service';
import { HotlineReviewWorkspaceView } from '@/components/admin/HotlineReviewWorkspaceView';

export const dynamic = 'force-dynamic';

export default async function HotlineReviewPage() {
  // Guardrail: Fail closed outside local development
  const isLocalDev = process.env.NODE_ENV === 'development';
  const user = await getCurrentUser();

  if (!isLocalDev || user.role !== 'ADMIN') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4 my-12 shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
          <span className="text-rose-400 font-bold text-xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold text-white">Administrator Access Restricted</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          The Hotline Candidate Review Workspace is strictly restricted to local development environments with an active <span className="font-bold text-amber-400">ADMIN</span> session role.
        </p>
        <p className="text-[11px] text-slate-500">
          In production environments, this administrative route fails closed to prevent unauthorized access and protect unverified citizen complaint records.
        </p>
      </div>
    );
  }

  // Load evaluated candidate dataset (100% read-only, zero database writes)
  const dataset = await getHotlineReviewDataset();

  return <HotlineReviewWorkspaceView dataset={dataset} />;
}
