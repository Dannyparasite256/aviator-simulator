'use client';

import { useMemo, useState } from 'react';
import { BetSlot, PracticeBetState } from '@aviator/shared';
import { useAuthStore } from '@/lib/auth-store';
import { useGameStore } from '@/lib/game-store';
import { api } from '@/lib/api';
import { playSfx } from '@/lib/sound';
import { useUiStore } from '@/lib/ui-store';

/**
 * Mobile sticky cash-out bar when any bet is live during FLYING.
 */
export function StickyCashOut() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const bets = useGameStore((s) => s.bets);
  const setBet = useGameStore((s) => s.setBet);
  const setLastError = useGameStore((s) => s.setLastError);
  const pushToast = useUiStore((s) => s.pushToast);
  const recordCashOut = useUiStore((s) => s.recordCashOut);
  const [busy, setBusy] = useState<BetSlot | null>(null);

  const liveSlots = ([1, 2] as BetSlot[]).filter(
    (s) => bets[s]?.status === 'ACTIVE' && !bets[s]?.cashedOut,
  );

  const heat = useMemo(() => {
    if (multiplier >= 10) return 'hot';
    if (multiplier >= 5) return 'warm';
    if (multiplier >= 2) return 'mid';
    return 'cool';
  }, [multiplier]);

  if (phase !== 'FLYING' || !user || liveSlots.length === 0) return null;

  async function cash(slot: BetSlot) {
    if (!user || busy) return;
    const bet = bets[slot];
    if (!bet) return;

    const optimisticWin = Math.round(bet.remainingAmount * multiplier * 100) / 100;
    const optimisticProfit = Math.round((optimisticWin - bet.remainingAmount) * 100) / 100;
    const snapshot = { ...bet };
    const prevCredits = user.virtualCredits;

    setBusy(slot);
    setBet(slot, {
      ...bet,
      cashedOut: true,
      status: 'CASHED_OUT',
      cashOutMultiplier: multiplier,
      profit: optimisticProfit,
      remainingAmount: 0,
    });
    setUser({ ...user, virtualCredits: prevCredits + optimisticWin });
    playSfx('cashout');
    recordCashOut(multiplier);
    // Light haptic when available
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    pushToast({
      kind: 'win',
      title: `Cash out @ ${multiplier.toFixed(2)}x`,
      body: `+${optimisticProfit.toFixed(2)} vc (confirming…)`,
    });

    try {
      const result = await api<
        PracticeBetState & {
          virtualCredits: number;
          cashedOut: boolean;
          profit: number;
          cashOutMultiplier: number;
        }
      >('/practice/cashout', {
        method: 'POST',
        body: JSON.stringify({ slot, fraction: 1 }),
      });
      setBet(slot, {
        ...result,
        slot,
        status: result.cashedOut ? 'CASHED_OUT' : 'ACTIVE',
        remainingAmount: result.remainingAmount ?? 0,
        queued: false,
        partialProfit: result.partialProfit ?? 0,
      });
      setUser({ ...user, virtualCredits: result.virtualCredits });
      if (result.cashOutMultiplier != null) {
        recordCashOut(Number(result.cashOutMultiplier));
      }
    } catch (e) {
      setBet(slot, snapshot);
      setUser({ ...user, virtualCredits: prevCredits });
      setLastError((e as Error).message);
      pushToast({ kind: 'error', title: 'Cash out failed', body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-av-border bg-av-bg/95 p-2 pb-[calc(0.5rem+var(--safe-bottom))] backdrop-blur-md lg:hidden"
      data-coach="cashout"
    >
      <div className={`grid gap-2 ${liveSlots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {liveSlots.map((slot) => {
          const bet = bets[slot]!;
          const win = bet.remainingAmount * multiplier;
          const profit = win - bet.remainingAmount;
          return (
            <button
              key={slot}
              type="button"
              disabled={busy === slot}
              onClick={() => void cash(slot)}
              className={`btn-success flex min-h-[56px] flex-col !rounded-xl py-3 cash-heat-${heat} active:scale-[0.98]`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-90">
                Cash out {liveSlots.length > 1 ? `· Bet ${slot}` : ''}
              </span>
              <span className="font-mono text-base font-extrabold tabular-nums">
                {win.toFixed(2)} vc
              </span>
              <span className="font-mono text-[11px] opacity-80">
                @{multiplier.toFixed(2)}x · +{profit.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
