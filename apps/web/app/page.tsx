'use client';

import { useEffect } from 'react';
import { BetSlotPanel } from '@/components/game/BetSlotPanel';
import { HistoryBar } from '@/components/game/HistoryBar';
import { LiveFeed } from '@/components/game/LiveFeed';
import { FlightStage } from '@/components/game/FlightStage';
import { StickyCashOut } from '@/components/game/StickyCashOut';
import { ToastHost } from '@/components/ui/ToastHost';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useGameStore } from '@/lib/game-store';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { api } from '@/lib/api';
import { PracticeBetState } from '@aviator/shared';
import { unlockAudio } from '@/lib/sound';
import Link from 'next/link';

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

  // Unlock audio on first interaction anywhere on play page
  useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <div
      className={`flex flex-col gap-2 sm:gap-2.5 ${hasLiveFlying ? 'pb-24 lg:pb-0' : ''}`}
    >
      <ToastHost />
      <StickyCashOut />

      <HistoryBar />

      <div className="grid gap-2 lg:grid-cols-12 lg:gap-2.5">
        <div className="flex flex-col gap-2 lg:col-span-8 xl:col-span-9">
          <FlightStage />

          {lastError && (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-av-red/40 bg-av-red/10 px-3 py-2 text-sm text-[#ff8a9a]">
              <span>{lastError}</span>
              <button
                type="button"
                className="shrink-0 text-xs font-bold uppercase text-white/60"
                onClick={() => setLastError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <BetSlotPanel slot={1} />
            <BetSlotPanel slot={2} />
          </div>
        </div>

        <div className="min-h-[280px] lg:col-span-4 xl:col-span-3 lg:min-h-0">
          <div className="h-full max-h-[520px] lg:h-full lg:max-h-none">
            <LiveFeed />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-av-border bg-av-panel px-3 py-2 text-[11px] text-av-muted">
        <span>Virtual credits only · Provably fair simulation</span>
        <div className="flex flex-wrap gap-2">
          <Link href="/verify" className="font-semibold text-white/70 hover:text-white">
            Fairness
          </Link>
          <Link href="/lab" className="font-semibold text-white/70 hover:text-white">
            Strategy lab
          </Link>
          <Link href="/stats" className="font-semibold text-white/70 hover:text-white">
            My stats
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
