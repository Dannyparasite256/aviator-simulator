'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BetSlot, PracticeBetState } from '@aviator/shared';
import { useAuthStore } from '@/lib/auth-store';
import { useGameStore } from '@/lib/game-store';
import { api } from '@/lib/api';
import { playSfx, unlockAudio } from '@/lib/sound';
import { useUiStore } from '@/lib/ui-store';

interface Props {
  slot: BetSlot;
  /** Dense layout for viewport-fit play page (no scroll to bet). */
  compact?: boolean;
}

type Tab = 'bet' | 'auto';

const QUICK = [10, 50, 100, 500, 1000];
const QUICK_COMPACT = [10, 50, 100, 500];

export function BetSlotPanel({ slot, compact = false }: Props) {
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
  const recordCashOut = useUiStore((s) => s.recordCashOut);

  const [tab, setTab] = useState<Tab>('bet');
  const [amount, setAmount] = useState(100);
  const [autoCash, setAutoCash] = useState('2.00');
  const [busy, setBusy] = useState(false);
  const [flashWin, setFlashWin] = useState(false);
  const [shakeLoss, setShakeLoss] = useState(false);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhase = useRef(phase);

  const slotAccent = slot === 1 ? 'slot-cyan' : 'slot-violet';

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

  const livePotential = useMemo(() => {
    if (!activeBet || phase !== 'FLYING') return null;
    return Math.round(activeBet.remainingAmount * multiplier * 100) / 100;
  }, [activeBet, phase, multiplier]);

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

  const balancePct = credits > 0 ? Math.min(100, (safeAmount / credits) * 100) : 0;

  // Loss shake when flying bet busts
  useEffect(() => {
    if (
      prevPhase.current === 'FLYING' &&
      phase === 'CRASHED' &&
      bet?.status === 'ACTIVE' &&
      !bet.cashedOut
    ) {
      setShakeLoss(true);
      const t = setTimeout(() => setShakeLoss(false), 500);
      return () => clearTimeout(t);
    }
    prevPhase.current = phase;
  }, [phase, bet]);

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

  function startHold(delta: number) {
    bump(delta);
    stopHold();
    holdRef.current = setInterval(() => bump(delta), 80);
  }

  function stopHold() {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
  }

  useEffect(() => () => stopHold(), []);

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
      try {
        navigator.vibrate?.(8);
      } catch {
        /* ignore */
      }
      pushToast({
        kind: 'info',
        title: result.queued || result.status === 'QUEUED' ? `Bet ${slot} queued` : `Bet ${slot} placed`,
        body: `${amt} VC`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes('already has an active')) {
        try {
          const open = await api<PracticeBetState[]>('/practice/bets');
          setBet(slot, null);
          for (const b of open) {
            if (b.slot === slot) setBet(slot, b);
          }
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
    recordCashOut(multiplier);
    setFlashWin(true);
    setTimeout(() => setFlashWin(false), 600);
    try {
      navigator.vibrate?.(14);
    } catch {
      /* ignore */
    }
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
      if (result.cashOutMultiplier != null) {
        recordCashOut(Number(result.cashOutMultiplier));
      }
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

  const placeDisabledReason = !user
    ? 'Log in to play'
    : safeAmount > credits
      ? 'Not enough credits'
      : busy
        ? 'Working…'
        : null;

  // Step indicator for bet lifecycle
  const steps = useMemo(() => {
    if (!bet && !activeBet) return null;
    const b = activeBet ?? bet;
    if (!b) return null;
    if (b.status === 'QUEUED') return { step: 1, label: 'Queued' };
    if (b.status === 'ACTIVE' && !b.cashedOut) {
      if (phase === 'WAITING' || phase === 'COUNTDOWN') return { step: 1, label: 'Locked' };
      return { step: 2, label: 'Active' };
    }
    if (b.cashedOut || b.status === 'CASHED_OUT') {
      return {
        step: 3,
        label: `Cashed ${b.cashOutMultiplier != null ? Number(b.cashOutMultiplier).toFixed(2) + 'x' : ''}`,
      };
    }
    return null;
  }, [bet, activeBet, phase]);

  const cashHeat =
    multiplier >= 10 ? 'hot' : multiplier >= 5 ? 'warm' : multiplier >= 2 ? 'mid' : 'cool';

  const quick = compact ? QUICK_COMPACT : QUICK;
  const pad = compact ? 'p-1.5 sm:p-2' : 'p-3 sm:p-3.5';
  const btnH = compact ? 'h-9' : 'h-11';
  const primaryPy = compact ? 'py-2 sm:py-2.5' : 'py-3.5';

  return (
    <div
      className={`flex flex-col rounded-xl border border-av-border bg-av-panel shadow-bet ${pad} ${slotAccent} ${
        shakeLoss ? 'bet-shake' : ''
      } ${flashWin ? 'bet-win-flash' : ''}`}
      data-coach={slot === 1 ? 'bet' : undefined}
    >
      <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/80 sm:text-xs">
          <span
            className={`slot-dot h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${
              slot === 1 ? 'bg-cyan-400' : 'bg-violet-400'
            }`}
          />
          Bet {slot}
        </span>
        {phase === 'WAITING' || phase === 'COUNTDOWN' ? (
          <span className="rounded-full bg-av-green/15 px-1.5 py-0.5 text-[9px] font-bold text-av-green sm:px-2 sm:text-[10px]">
            Open
          </span>
        ) : phase === 'FLYING' ? (
          <span className="rounded-full bg-av-pink/15 px-1.5 py-0.5 text-[9px] font-bold text-av-pink sm:px-2 sm:text-[10px]">
            Live
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-av-muted sm:px-2 sm:text-[10px]">
            Wait
          </span>
        )}
      </div>

      {steps && !compact && (
        <div className="mb-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-av-muted">
          {['Queued', 'Active', 'Cashed'].map((label, i) => {
            const n = i + 1;
            const on = steps.step >= n;
            return (
              <span key={label} className="flex flex-1 items-center gap-1">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    on ? 'bg-av-green/25 text-av-green' : 'bg-white/5 text-white/30'
                  }`}
                >
                  {n}
                </span>
                <span className={on ? 'text-white/70' : ''}>{label}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className={`grid grid-cols-2 rounded-lg bg-black/40 p-0.5 ${compact ? 'mb-1.5' : 'mb-3'}`}>
        {(['bet', 'auto'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md font-bold uppercase tracking-wide transition active:scale-[0.98] ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
            } ${tab === t ? 'bg-av-border text-white' : 'text-av-muted hover:text-white/80'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={compact ? 'mb-1.5' : 'mb-2'}>
        {!compact && (
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
        )}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            className={`flex ${btnH} w-8 shrink-0 items-center justify-center rounded-lg border border-av-border bg-black/40 text-base font-bold text-white/80 active:scale-95 active:bg-white/10 disabled:opacity-40 sm:w-10 sm:text-lg`}
            onPointerDown={() => !inputsLocked && startHold(-10)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            disabled={inputsLocked}
          >
            −
          </button>
          <input
            type="number"
            className={`input-field ${btnH} text-center font-mono font-bold ${
              compact ? 'text-sm' : 'text-base'
            }`}
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
            className={`flex ${btnH} w-8 shrink-0 items-center justify-center rounded-lg border border-av-border bg-black/40 text-base font-bold text-white/80 active:scale-95 active:bg-white/10 disabled:opacity-40 sm:w-10 sm:text-lg`}
            onPointerDown={() => !inputsLocked && startHold(10)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            disabled={inputsLocked}
          >
            +
          </button>
        </div>

        {user && !inputsLocked && !compact && (
          <div className="mt-1.5">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  balancePct > 80 ? 'bg-av-red' : balancePct > 40 ? 'bg-av-gold' : 'bg-av-green'
                }`}
                style={{ width: `${balancePct}%` }}
              />
            </div>
          </div>
        )}

        <div className={`grid gap-1 ${compact ? 'mt-1 grid-cols-4' : 'mt-2 grid-cols-5'}`}>
          {quick.map((v) => (
            <button
              key={v}
              type="button"
              disabled={inputsLocked}
              onClick={() => setAmountSafe(v)}
              className={`chip-tap rounded-md border font-semibold active:scale-95 disabled:opacity-40 ${
                compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
              } ${
                amount === v
                  ? 'border-av-red bg-av-red/20 text-white'
                  : 'border-av-border bg-black/30 text-white/70 hover:bg-white/10'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={`grid grid-cols-3 gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
          <button
            type="button"
            disabled={inputsLocked}
            onClick={half}
            className={`rounded-md border border-av-border bg-black/30 font-bold text-white/70 hover:bg-white/10 active:scale-95 disabled:opacity-40 ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'
            }`}
          >
            ½
          </button>
          <button
            type="button"
            disabled={inputsLocked}
            onClick={double}
            className={`rounded-md border border-av-border bg-black/30 font-bold text-white/70 hover:bg-white/10 active:scale-95 disabled:opacity-40 ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'
            }`}
          >
            2×
          </button>
          <button
            type="button"
            disabled={inputsLocked || !user}
            onClick={maxAll}
            className={`rounded-md border border-av-border bg-black/30 font-bold text-white/70 hover:bg-white/10 active:scale-95 disabled:opacity-40 ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'
            }`}
            title="Use full balance (confirm by pressing Bet)"
          >
            MAX
          </button>
        </div>
      </div>

      {tab === 'auto' && (
        <div className={compact ? 'mb-1.5' : 'mb-3'}>
          {!compact && <label className="label">Auto cash out at</label>}
          <div className="relative">
            <input
              type="number"
              className={`input-field pr-7 font-mono font-bold ${compact ? 'h-9 text-sm' : 'h-11'}`}
              step={0.01}
              min={1.01}
              value={autoCash}
              onChange={(e) => setAutoCash(e.target.value)}
              disabled={inputsLocked}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-av-muted sm:text-sm">
              x
            </span>
          </div>
          <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
            {[1.5, 2, 3, 5, 10].map((v) => (
              <button
                key={v}
                type="button"
                disabled={inputsLocked}
                onClick={() => setAutoCash(v.toFixed(2))}
                className={`rounded-md border font-semibold active:scale-95 disabled:opacity-40 ${
                  compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
                } ${
                  Number(autoCash) === v
                    ? 'border-av-green/50 bg-av-green/15 text-av-green'
                    : 'border-av-border bg-black/30 text-white/70 hover:bg-white/10'
                }`}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>
      )}

      {!user ? (
        <Link href="/login" className={`btn-primary w-full text-sm ${primaryPy}`}>
          Log in
        </Link>
      ) : !activeBet ? (
        <div>
          <button
            type="button"
            className={`btn-primary w-full flex-col gap-0 !rounded-xl active:scale-[0.98] ${primaryPy}`}
            disabled={busy || safeAmount > credits}
            onClick={() => void place()}
            title={placeDisabledReason ?? undefined}
          >
            <span
              className={`font-extrabold uppercase tracking-wide ${
                compact ? 'text-xs sm:text-sm' : 'text-[15px]'
              }`}
            >
              {phase === 'WAITING' || phase === 'COUNTDOWN' ? 'Bet' : 'Next round'}
            </span>
            <span className="font-mono text-[10px] font-semibold opacity-90 sm:text-xs">
              {safeAmount.toLocaleString()} VC
            </span>
          </button>
          {placeDisabledReason && safeAmount > credits && (
            <p className="mt-0.5 text-center text-[9px] font-semibold text-av-red/90">
              {placeDisabledReason}
            </p>
          )}
        </div>
      ) : activeBet.status === 'QUEUED' ? (
        <button
          type="button"
          className={`btn-cancel w-full flex-col !rounded-xl active:scale-[0.98] ${primaryPy}`}
          disabled={!canCancel || busy}
          onClick={() => void cancel()}
        >
          <span className={`font-extrabold uppercase ${compact ? 'text-xs' : 'text-[15px]'}`}>
            Cancel
          </span>
          <span className="font-mono text-[10px]">Queued {activeBet.amount}</span>
        </button>
      ) : canCash ? (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          <button
            type="button"
            className={`btn-success w-full flex-col !rounded-xl shadow-[0_0_24px_rgba(40,169,9,0.35)] cash-heat-${cashHeat} active:scale-[0.98] ${primaryPy}`}
            disabled={busy}
            onClick={() => void cashOut(1)}
          >
            <span
              className={`font-extrabold uppercase tracking-wide ${
                compact ? 'text-xs sm:text-sm' : 'text-[15px]'
              }`}
            >
              Cash Out
            </span>
            <span className="font-mono text-xs font-bold tabular-nums sm:text-sm">
              {(livePotential ?? activeBet.remainingAmount * multiplier).toFixed(2)} VC
            </span>
            {!compact && (
              <span className="text-[10px] font-semibold opacity-80">
                +
                {(
                  (livePotential ?? activeBet.remainingAmount * multiplier) -
                  activeBet.remainingAmount
                ).toFixed(2)}{' '}
                profit
              </span>
            )}
          </button>
          {!compact && (
            <button
              type="button"
              className="btn-secondary w-full text-xs active:scale-[0.98]"
              disabled={busy}
              onClick={() => void cashOut(0.5)}
            >
              Cash out 50%
            </button>
          )}
        </div>
      ) : (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          <div
            className={`rounded-xl border border-av-green/30 bg-av-green/10 text-center ${
              compact ? 'px-2 py-1.5' : 'px-3 py-3'
            }`}
          >
            <div className="text-[9px] font-semibold uppercase text-av-green sm:text-[11px]">
              Locked
            </div>
            <div className={`font-mono font-bold ${compact ? 'text-sm' : 'mt-0.5 text-lg'}`}>
              {activeBet.remainingAmount} VC
            </div>
            {activeBet.autoCashOutAt != null && (
              <div className="text-[10px] text-av-muted">Auto @ {activeBet.autoCashOutAt}x</div>
            )}
          </div>
          {canCancel && (
            <button
              type="button"
              className={`btn-secondary w-full ${compact ? 'py-1.5 text-xs' : 'text-sm'}`}
              onClick={() => void cancel()}
              disabled={busy}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {bet?.cashedOut && bet.cashOutMultiplier != null && !activeBet && !compact && (
        <p className="mt-2 text-center text-xs font-semibold text-av-green">
          Last win @ {bet.cashOutMultiplier.toFixed(2)}x · +{bet.profit?.toFixed(2)} VC
        </p>
      )}

      {!activeBet && user && !compact && (
        <p className="mt-2 text-center text-[10px] text-av-muted">
          Potential ~{potential.toLocaleString()} VC · Balance {credits.toLocaleString()} VC
        </p>
      )}

      {!canPlace && user && !activeBet && safeAmount > credits && (
        <Link
          href="/wallet"
          className={`text-center font-bold text-av-gold hover:underline ${
            compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'
          }`}
        >
          Wallet →
        </Link>
      )}
    </div>
  );
}
