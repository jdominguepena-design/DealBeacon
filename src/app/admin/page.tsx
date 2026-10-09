import React from 'react';
import { getAdminData } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { AdminConsoleView } from '@/components/admin/AdminConsoleView';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (user.role !== 'ADMIN') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4 my-12 shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
          <span className="text-rose-400 font-bold text-xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold text-white">Administrator Access Restricted</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your active session role is currently <span className="font-bold text-amber-400">{user.role}</span>. Ingestion run inspection and score recalculation operations require administrator authorization.
        </p>
        <p className="text-[11px] text-slate-500">
          Switch your role to <strong className="text-slate-300">Admin</strong> in the top navigation bar to access this console during development.
        </p>
      </div>
    );
  }

  const adminData = await getAdminData();

  return (
    <AdminConsoleView
      runs={adminData.runs}
      sourceRecords={adminData.sourceRecords}
      signals={adminData.signals}
      propertiesCount={adminData.propertiesCount}
    />
  );
}
