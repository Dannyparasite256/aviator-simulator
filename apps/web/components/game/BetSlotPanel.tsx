'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BetSlot, PracticeBetState } from '@aviator/shared';
import { useAuthStore } from '@/lib/auth-store';
import { useGameStore } from '@/lib/game-store';
import { api } from '@/lib/api';
import { playSfx, unlockAudio } from '@/lib/sound';
import { useUiStore } from '@/lib/ui-store';

interface Props {
  slot: BetSlot;
}

type Tab = 'bet' | 'auto';

const QUICK = [10, 50, 100, 500, 1000];

export function BetSlotPanel({ slot }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const bet = useGameStore((s) => s.bets[slot]);
  const setBet = useGameStore((s) => s.setBet);
  const setLastError = useGameStore((s) => s.setLastError);
  const minBet = useGameStore((s) => s.minBet) || 1;
  const maxBet = useGameStore((s) => s.maxBet) || 100000;
  const pushToast = useUiStore((s) => s.pushToast);

  const [tab, setTab] = useState<Tab>('bet');
  const [amount, setAmount] = useState(100);
  const [autoCash, setAutoCash] = useState('2.00');
  const [busy, setBusy] = useState(false);

  // Finished bets don't block new ones
  const activeBet =
    bet &&
    (bet.status === 'ACTIVE' || bet.status === 'QUEUED') &&
    !bet.cashedOut
      ? bet
      : null;

  const potential = useMemo(() => {
    const m = phase === 'FLYING' ? multiplier : Number(autoCash) || 1;
    return Math.round(Math.max(0, amount) * Math.max(1, m) * 100) / 100;
  }, [amount, autoCash, multiplier, phase]);

  const canCash =
    !!user && !!activeBet && activeBet.status === 'ACTIVE' && phase === 'FLYING';

  const canCancel =
    !!user &&
    !!activeBet &&
    (activeBet.status === 'QUEUED' ||
      (activeBet.status === 'ACTIVE' &&
        (phase === 'WAITING' || phase === 'COUNTDOWN')));

  const credits = user?.virtualCredits ?? 0;
  const safeAmount = Math.min(maxBet, Math.max(minBet, Number(amount) || minBet));
  const canPlace =
    !!user && !activeBet && safeAmount >= minBet && safeAmount <= maxBet && safeAmount <= credits;

  function clampAmount(n: number) {
    if (!Number.isFinite(n)) return minBet;
    return Math.round(Math.min(maxBet, Math.max(minBet, n)) * 100) / 100;
  }

  function setAmountSafe(n: number) {
    setAmount(clampAmount(n));
  }

  function bump(delta: number) {
    setAmount((a) => clampAmount((Number(a) || 0) + delta));
  }

  function half() {
    setAmount((a) => clampAmount((Number(a) || 0) / 2));
  }

  function double() {
    setAmount((a) => clampAmount((Number(a) || 0) * 2));
  }

  function maxAll() {
    setAmountSafe(Math.min(maxBet, credits));
  }

  async function place() {
    if (!user) {
      setLastError('Please log in to play');
      pushToast({ kind: 'error', title: 'Login required', body: 'Sign in to place bets' });
      return;
    }
    const amt = clampAmount(amount);
    setAmount(amt);
    if (amt > credits) {
      setLastError('Insufficient virtual credits');
      pushToast({ kind: 'error', title: 'Not enough credits', body: 'Deposit virtual funds in Wallet' });
      return;
    }
    if (activeBet) {
      setLastError('Slot already has an active bet');
      return;
    }

    void unlockAudio();
    setBusy(true);
    // Clear previous finished bet state
    setBet(slot, null);

    try {
      const result = await api<PracticeBetState & { virtualCredits: number }>('/practice/bet', {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          slot,
          autoCashOutAt:
            tab === 'auto' && Number(autoCash) > 1 ? Number(autoCash) : undefined,
          queueIfClosed: true,
        }),
      });
      setBet(slot, {
        ...result,
        slot: result.slot ?? slot,
        remainingAmount: result.remainingAmount ?? result.amount,
        status: result.status ?? (result.queued ? 'QUEUED' : 'ACTIVE'),
        queued: result.queued ?? false,
        cashedOut: false,
        partialProfit: result.partialProfit ?? 0,
      });
      setUser({ ...user, virtualCredits: result.virtualCredits });
      setLastError(null);
      playSfx('bet');
      pushToast({
        kind: 'info',
        title: result.queued || result.status === 'QUEUED' ? `Bet ${slot} queued` : `Bet ${slot} placed`,
        body: `${amt} VC`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      // Auto-recover stuck-slot errors: resync bets then retry once
      if (msg.toLowerCase().includes('already has an active')) {
        try {
          const open = await api<PracticeBetState[]>('/practice/bets');
          setBet(slot, null);
          for (const b of open) {
            if (b.slot === slot) setBet(slot, b);
          }
          // If server cleaned it, retry place
          const still = open.find(
            (b) =>
              b.slot === slot &&
              (b.status === 'ACTIVE' || b.status === 'QUEUED') &&
              !b.cashedOut,
          );
          if (!still) {
            const result = await api<PracticeBetState & { virtualCredits: number }>(
              '/practice/bet',
              {
                method: 'POST',
                body: JSON.stringify({
                  amount: amt,
                  slot,
                  autoCashOutAt:
                    tab === 'auto' && Number(autoCash) > 1 ? Number(autoCash) : undefined,
                  queueIfClosed: true,
                }),
              },
            );
            setBet(slot, {
              ...result,
              slot: result.slot ?? slot,
              remainingAmount: result.remainingAmount ?? result.amount,
              status: result.status ?? (result.queued ? 'QUEUED' : 'ACTIVE'),
              queued: result.queued ?? false,
              cashedOut: false,
              partialProfit: result.partialProfit ?? 0,
            });
            setUser({ ...user, virtualCredits: result.virtualCredits });
            setLastError(null);
            playSfx('bet');
            pushToast({ kind: 'info', title: `Bet ${slot} placed`, body: `${amt} VC` });
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setLastError(msg);
      pushToast({ kind: 'error', title: 'Bet failed', body: msg });
    } finally {
      setBusy(false);
    }
  }

  async function cashOut(fraction = 1) {
    if (!user || !activeBet) return;
    void unlockAudio();

    const snapshot = { ...activeBet };
    const prevCredits = user.virtualCredits;
    const cashAmount = Math.round(activeBet.remainingAmount * fraction * 100) / 100;
    const optimisticWin = Math.round(cashAmount * multiplier * 100) / 100;
    const optimisticProfit = Math.round((optimisticWin - cashAmount) * 100) / 100;

    if (fraction >= 0.999) {
      setBet(slot, {
        ...activeBet,
        cashedOut: true,
        status: 'CASHED_OUT',
        cashOutMultiplier: multiplier,
        profit: optimisticProfit,
        remainingAmount: 0,
      });
      setUser({ ...user, virtualCredits: prevCredits + optimisticWin });
    }
    playSfx('cashout');
    setBusy(true);

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
        body: JSON.stringify({ slot, fraction }),
      });
      setBet(slot, {
        ...result,
        slot,
        status: result.cashedOut ? 'CASHED_OUT' : 'ACTIVE',
        remainingAmount: result.remainingAmount ?? 0,
        queued: false,
        partialProfit: result.partialProfit ?? 0,
        cashedOut: result.cashedOut,
        cashOutMultiplier: result.cashOutMultiplier,
      });
      setUser({ ...user, virtualCredits: result.virtualCredits });
      pushToast({
        kind: 'win',
        title: `Cashed out @ ${Number(result.cashOutMultiplier).toFixed(2)}x`,
        body: `${result.profit >= 0 ? '+' : ''}${Number(result.profit).toFixed(2)} VC`,
      });
    } catch (e) {
      setBet(slot, snapshot);
      setUser({ ...user, virtualCredits: prevCredits });
      setLastError((e as Error).message);
      pushToast({ kind: 'error', title: 'Cash out failed', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!user) return;
    setBusy(true);
    try {
      const result = await api<{ virtualCredits: number }>('/practice/cancel', {
        method: 'POST',
        body: JSON.stringify({ slot }),
      });
      setBet(slot, null);
      setUser({ ...user, virtualCredits: result.virtualCredits });
      pushToast({ kind: 'info', title: 'Bet cancelled', body: 'Credits returned' });
    } catch (e) {
      setLastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputsLocked = !!activeBet;

  return (
    <div className="flex flex-col rounded-xl border border-av-border bg-av-panel p-3 shadow-bet sm:p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-white/80">
          Bet {slot}
        </span>
        {phase === 'WAITING' || phase === 'COUNTDOWN' ? (
          <span className="rounded-full bg-av-green/15 px-2 py-0.5 text-[10px] font-bold text-av-green">
            Open
          </span>
        ) : phase === 'FLYING' ? (
          <span className="rounded-full bg-av-pink/15 px-2 py-0.5 text-[10px] font-bold text-av-pink">
            In flight
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-av-muted">
            Next round
          </span>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 rounded-lg bg-black/40 p-0.5">
        {(['bet', 'auto'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md py-1.5 text-xs font-bold uppercase tracking-wide transition ${
              tab === t ? 'bg-av-border text-white' : 'text-av-muted hover:text-white/80'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-av-muted">Bet amount (VC)</span>
          <button
            type="button"
            className="text-[11px] font-bold text-av-gold hover:underline"
            onClick={maxAll}
            disabled={inputsLocked || !user}
          >
            Max
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-av-border bg-black/40 text-lg font-bold text-white/80 active:bg-white/10 disabled:opacity-40"
            onClick={() => bump(-10)}
            disabled={inputsLocked}
          >
            −
          </button>
          <input
            type="number"
            className="input-field h-11 text-center font-mono text-base font-bold"
            value={amount}
            min={minBet}
            max={maxBet}
            step={1}
            onChange={(e) => setAmount(Number(e.target.value))}
            onBlur={() => setAmountSafe(amount)}
            disabled={inputsLocked}
          />
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-av-border bg-black/40 text-lg font-bold text-white/80 active:bg-white/10 disabled:opacity-40"
            onClick={() => bump(10)}
            disabled={inputsLocked}
          >
            +
          </button>
        </div>

        <div className="mt-2 grid grid-cols-5 gap-1">
          {QUICK.map((v) => (
            <button
              key={v}
              type="button"
              disabled={inputsLocked}
              onClick={() => setAmountSafe(v)}
              className={`rounded-md border py-1.5 text-xs font-semibold active:scale-95 disabled:opacity-40 ${
                amount === v
                  ? 'border-av-red bg-av-red/20 text-white'
                  : 'border-av-border bg-black/30 text-white/70 hover:bg-white/10'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={inputsLocked}
            onClick={half}
            className="rounded-md border border-av-border bg-black/30 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            ½
          </button>
          <button
            type="button"
            disabled={inputsLocked}
            onClick={double}
            className="rounded-md border border-av-border bg-black/30 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            2×
          </button>
          <button
            type="button"
            disabled={inputsLocked || !user}
            onClick={maxAll}
            className="rounded-md border border-av-border bg-black/30 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            MAX
          </button>
        </div>
      </div>

      {tab === 'auto' && (
        <div className="mb-3">
          <label className="label">Auto cash out at</label>
          <div className="relative">
            <input
              type="number"
              className="input-field h-11 pr-8 font-mono font-bold"
              step={0.01}
              min={1.01}
              value={autoCash}
              onChange={(e) => setAutoCash(e.target.value)}
              disabled={inputsLocked}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-av-muted">
              x
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[1.5, 2, 3, 5, 10].map((v) => (
              <button
                key={v}
                type="button"
                disabled={inputsLocked}
                onClick={() => setAutoCash(v.toFixed(2))}
                className="rounded-md border border-av-border bg-black/30 px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                {v}x
              </button>
            ))}
          </div>
        </div>
      )}

      {!user ? (
        <Link href="/login" className="btn-primary w-full py-3.5 text-sm">
          Log in to play
        </Link>
      ) : !activeBet ? (
        <button
          type="button"
          className="btn-primary w-full flex-col gap-0.5 !rounded-xl py-3.5"
          disabled={busy || safeAmount > credits}
          onClick={() => void place()}
        >
          <span className="text-[15px] font-extrabold uppercase tracking-wide">
            {phase === 'WAITING' || phase === 'COUNTDOWN' ? 'Bet' : 'Bet (next round)'}
          </span>
          <span className="font-mono text-xs font-semibold opacity-90">
            {safeAmount.toLocaleString()} VC
          </span>
        </button>
      ) : activeBet.status === 'QUEUED' ? (
        <button
          type="button"
          className="btn-cancel w-full flex-col !rounded-xl py-3.5"
          disabled={!canCancel || busy}
          onClick={() => void cancel()}
        >
          <span className="text-[15px] font-extrabold uppercase">Cancel</span>
          <span className="font-mono text-xs">Queued {activeBet.amount} VC</span>
        </button>
      ) : canCash ? (
        <div className="space-y-2">
          <button
            type="button"
            className="btn-success w-full flex-col !rounded-xl py-3.5 shadow-[0_0_24px_rgba(40,169,9,0.35)]"
            disabled={busy}
            onClick={() => void cashOut(1)}
          >
            <span className="text-[15px] font-extrabold uppercase tracking-wide">Cash Out</span>
            <span className="font-mono text-sm font-bold">
              {(activeBet.remainingAmount * multiplier).toFixed(2)} VC
            </span>
          </button>
          <button
            type="button"
            className="btn-secondary w-full text-xs"
            disabled={busy}
            onClick={() => void cashOut(0.5)}
          >
            Cash out 50%
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-av-green/30 bg-av-green/10 px-3 py-3 text-center">
            <div className="text-[11px] font-semibold uppercase text-av-green">
              Bet locked · waiting
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold">{activeBet.remainingAmount} VC</div>
            {activeBet.autoCashOutAt != null && (
              <div className="text-xs text-av-muted">Auto @ {activeBet.autoCashOutAt}x</div>
            )}
          </div>
          {canCancel && (
            <button
              type="button"
              className="btn-secondary w-full text-sm"
              onClick={() => void cancel()}
              disabled={busy}
            >
              Cancel bet
            </button>
          )}
        </div>
      )}

      {bet?.cashedOut && bet.cashOutMultiplier != null && !activeBet && (
        <p className="mt-2 text-center text-xs font-semibold text-av-green">
          Last win @ {bet.cashOutMultiplier.toFixed(2)}x · +{bet.profit?.toFixed(2)} VC
        </p>
      )}

      {!activeBet && user && (
        <p className="mt-2 text-center text-[10px] text-av-muted">
          Potential ~{potential.toLocaleString()} VC · Balance {credits.toLocaleString()} VC
        </p>
      )}

      {!canPlace && user && !activeBet && safeAmount > credits && (
        <Link href="/wallet" className="mt-2 text-center text-xs font-bold text-av-gold hover:underline">
          Need credits? Open Wallet →
        </Link>
      )}
    </div>
  );
}
