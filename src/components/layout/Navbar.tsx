'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Compass,
  Building2,
  Bookmark,
  ShieldAlert,
  Flame,
  UserCheck,
  ChevronDown,
  Layers,
  MapPin,
} from 'lucide-react';
import { UserRole } from '@/types';

interface NavbarProps {
  currentRole: UserRole;
  userName: string;
}

export function Navbar({ currentRole, userName }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const handleRoleSwitch = async (role: UserRole) => {
    if (role === currentRole || switching) return;
    setSwitching(true);
    try {
      await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSwitching(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Daily Dashboard', icon: Flame, exact: true },
    { href: '/properties', label: 'Property Intelligence', icon: Building2 },
    { href: '/saved', label: 'Saved Pipeline', icon: Bookmark },
    { href: '/admin', label: 'Admin & Provenance', icon: ShieldAlert },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Market Identifier */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-lg tracking-tight text-white">DealBeacon</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    Omaha MVP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  Douglas County, NE
                </p>
              </div>
            </Link>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = link.exact
                  ? pathname === link.href
                  : pathname.startsWith(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-800 text-amber-400 border border-slate-700'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Session Switcher (Dev abstraction complying with Guardrail #1) */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
              <span className="px-2 py-1 text-slate-400 font-medium">Session Role:</span>
              <button
                onClick={() => handleRoleSwitch('INVESTOR')}
                disabled={switching}
                className={`px-2.5 py-1 rounded transition font-medium ${
                  currentRole === 'INVESTOR'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Investor
              </button>
              <button
                onClick={() => handleRoleSwitch('ADMIN')}
                disabled={switching}
                className={`px-2.5 py-1 rounded transition font-medium ${
                  currentRole === 'ADMIN'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
