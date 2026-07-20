'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useGameStore } from '@/lib/game-store';
import { useUiStore } from '@/lib/ui-store';
import { unlockAudio } from '@/lib/sound';

const STATIC_NAV = [
  { href: '/', label: 'Play' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/history', label: 'History' },
  { href: '/verify', label: 'Fair' },
  { href: '/lab', label: 'Lab' },
  { href: '/stats', label: 'Stats' },
] as const;

/**
 * Renders identical markup on server + first client paint, then fills
 * live values after mount (prevents React hydration mismatches).
 */
export function TopBar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const connected = useGameStore((s) => s.connected);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const muted = useUiStore((s) => s.muted);
  const toggleMute = useUiStore((s) => s.toggleMute);
  const hydrateUi = useUiStore((s) => s.hydrate);
  const reconnecting = useUiStore((s) => s.reconnecting);

  useEffect(() => {
    setMounted(true);
    hydrateAuth();
    hydrateUi();
  }, [hydrateAuth, hydrateUi]);

  // Fixed values during SSR + first client render
  const showMuted = mounted ? muted : false;
  const showConnected = mounted ? connected : false;
  const showReconnecting = mounted ? reconnecting : false;
  const showRound = mounted && roundNumber ? roundNumber : '—';
  const showUser = mounted ? user : null;
  const showCredits =
    mounted && user
      ? user.virtualCredits.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : '—';

  const nav = [
    ...STATIC_NAV,
    ...(showUser?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-av-border/80 bg-av-bg/95 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between gap-2 px-3 sm:h-14 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="relative flex h-8 w-8 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-av-red/20" />
            <svg viewBox="0 0 32 32" className="relative h-7 w-7" aria-hidden>
              <path
                d="M4 20c6-1 10-6 12-10 2 5 5 9 12 10-5 1-8 4-12 8-3-4-7-7-12-8z"
                fill="#e31c3d"
              />
              <circle cx="16" cy="14" r="2.2" fill="#fff" />
            </svg>
          </span>
          <div className="leading-none">
            <div className="text-[15px] font-extrabold tracking-tight sm:text-base">Aviator</div>
            <div className="hidden text-[9px] font-medium uppercase tracking-[0.14em] text-av-muted sm:block">
              #{showRound} ·{' '}
              {showConnected ? 'Live' : showReconnecting ? 'Reconnecting' : 'Offline'}
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {nav.map((l) => {
            const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-av-muted hover:bg-white/5 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label={showMuted ? 'Unmute sounds' : 'Mute sounds'}
            title={showMuted ? 'Sound off' : 'Sound on'}
            onClick={() => {
              void unlockAudio();
              toggleMute();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-av-border bg-av-panel text-sm text-white/80 hover:bg-white/5"
          >
            {showMuted ? '🔇' : '🔊'}
          </button>

          <div className="flex items-center gap-1.5 rounded-full border border-av-border bg-av-panel px-2.5 py-1 sm:px-3 sm:py-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                showConnected
                  ? 'bg-av-green'
                  : showReconnecting
                    ? 'animate-pulse bg-av-gold'
                    : 'bg-av-red'
              }`}
            />
            <span className="font-mono text-sm font-bold text-av-gold sm:text-[15px]">
              {showCredits}
            </span>
            <span className="text-[10px] font-semibold uppercase text-av-muted">vc</span>
          </div>

          {showUser ? (
            <div className="flex items-center gap-1.5">
              <Link
                href="/wallet"
                className="hidden max-w-[120px] truncate rounded-full border border-av-border bg-av-panel px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/5 sm:inline-flex"
                title={showUser.email}
              >
                {showUser.displayName}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-full border border-av-border bg-av-panel px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link
                href="/login"
                className="hidden rounded-full border border-av-border bg-av-panel px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5 sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-av-red px-3 py-1.5 text-xs font-bold text-white sm:px-4 sm:text-sm"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-av-border/50 px-2 py-1.5 md:hidden">
        {nav.map((l) => {
          const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                active ? 'bg-av-red text-white' : 'bg-av-panel text-av-muted'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
