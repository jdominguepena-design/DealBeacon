import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { DemoBanner } from '@/components/layout/DemoBanner';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'DealBeacon | Omaha Off-Market Real Estate Intelligence',
  description:
    'Off-market real estate intelligence and distress signal prioritization platform for Omaha, Nebraska.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <DemoBanner />
        <Navbar currentRole={currentUser.role} userName={currentUser.name || 'Investor'} />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="bg-slate-950 border-t border-slate-800/80 py-6 text-center text-xs text-slate-400">
          <div className="max-w-7xl mx-auto px-4 space-y-1">
            <p className="font-medium text-slate-300">
              DealBeacon — Omaha Off-Market Intelligence Platform (Milestone 1 MVP)
            </p>
            <p>
              Focused on Douglas County, NE. Prioritizing off-market opportunities through explainable public signals.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
