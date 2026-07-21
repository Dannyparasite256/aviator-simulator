'use client';

import { useEffect } from 'react';
import { BetSlotPanel } from '@/components/game/BetSlotPanel';
import { HistoryBar } from '@/components/game/HistoryBar';
import { LiveFeed } from '@/components/game/LiveFeed';
import { FlightStage } from '@/components/game/FlightStage';
import { StickyCashOut } from '@/components/game/StickyCashOut';
import { ToastHost } from '@/components/ui/ToastHost';
import { CoachMarks } from '@/components/ui/CoachMarks';
import { PersonalBestBanner } from '@/components/ui/PersonalBestBanner';
import { ConfettiBurst } from '@/components/ui/ConfettiBurst';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useGameStore } from '@/lib/game-store';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { api } from '@/lib/api';
import { PracticeBetState } from '@aviator/shared';
import { unlockAudio } from '@/lib/sound';
import Link from 'next/link';

/**
 * Play page: fits stage + bets in the viewport (no scroll to place a bet).
 * Live feed is desktop-only; mobile keeps focus on flight + dual bet panels.
 */
export default function HomePage() {
  useGameSocket();
  const lastError = useGameStore((s) => s.lastError);
  const setLastError = useGameStore((s) => s.setLastError);
  const user = useAuthStore((s) => s.user);
  const setBets = useGameStore((s) => s.setBets);
  const hydrateUi = useUiStore((s) => s.hydrate);
  const phase = useGameStore((s) => s.phase);
  const bet1 = useGameStore((s) => s.bets[1]);
  const bet2 = useGameStore((s) => s.bets[2]);
  const focusMode = useUiStore((s) => s.focusMode);

  const hasLiveFlying =
    phase === 'FLYING' &&
    ((bet1?.status === 'ACTIVE' && !bet1.cashedOut) ||
      (bet2?.status === 'ACTIVE' && !bet2.cashedOut));

  useEffect(() => {
    hydrateUi();
  }, [hydrateUi]);

  useEffect(() => {
    if (!user) return;
    void api<PracticeBetState[]>('/practice/bets')
      .then(setBets)
      .catch(() => undefined);
  }, [user, setBets]);

  useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <div
      className={`play-shell flex min-h-0 flex-1 flex-col gap-1 overflow-hidden sm:gap-1.5 ${
        hasLiveFlying ? 'pb-[4.5rem] lg:pb-0' : ''
      }`}
    >
      <ToastHost />
      <CoachMarks />
      <PersonalBestBanner />
      <ConfettiBurst />
      <StickyCashOut />

      <div className="shrink-0">
        <HistoryBar compact />
      </div>

      <div className="grid min-h-0 flex-1 gap-1.5 lg:grid-cols-12 lg:gap-2">
        {/* Stage + bets — always visible without page scroll */}
        <div className="flex min-h-0 flex-col gap-1.5 lg:col-span-8 xl:col-span-9">
          <div className="min-h-0 flex-1">
            <FlightStage compact />
          </div>

          {lastError && (
            <div className="flex shrink-0 items-start justify-between gap-2 rounded-lg border border-av-red/40 bg-av-red/10 px-2 py-1.5 text-xs text-[#ff8a9a]">
              <span className="line-clamp-2">{lastError}</span>
              <button
                type="button"
                className="shrink-0 text-[10px] font-bold uppercase text-white/60"
                onClick={() => setLastError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            className="grid shrink-0 grid-cols-2 gap-1.5 sm:gap-2"
            data-coach="bets"
          >
            <BetSlotPanel slot={1} compact />
            <BetSlotPanel slot={2} compact />
          </div>
        </div>

        {/* Live feed — large screens only so mobile never scrolls past bets */}
        {!focusMode && (
          <div className="hidden min-h-0 lg:col-span-4 lg:block xl:col-span-3">
            <LiveFeed compact />
          </div>
        )}
        {focusMode && (
          <div className="hidden min-h-0 lg:col-span-4 lg:block xl:col-span-3">
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-av-border bg-av-panel/50 p-3 text-center">
              <div className="text-sm font-bold text-white/70">Focus mode</div>
              <p className="mt-1 text-xs text-av-muted">Feed hidden · ⚙ to exit</p>
            </div>
          </div>
        )}
      </div>

      <div className="hidden shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-av-border bg-av-panel px-3 py-1 text-[10px] text-av-muted sm:flex">
        <span>Virtual credits only · Provably fair</span>
        <div className="flex flex-wrap gap-2">
          <Link href="/verify" className="font-semibold text-white/70 hover:text-white">
            Fairness
          </Link>
          <Link href="/lab" className="font-semibold text-white/70 hover:text-white">
            Lab
          </Link>
          <Link href="/stats" className="font-semibold text-white/70 hover:text-white">
            Stats
          </Link>
          {!user && (
            <Link href="/login" className="font-bold text-av-red hover:underline">
              Log in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
