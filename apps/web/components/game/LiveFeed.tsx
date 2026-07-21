'use client';

import { useMemo, useState } from 'react';
import { LiveBetFeedItem, PracticeBetState } from '@aviator/shared';
import { useGameStore } from '@/lib/game-store';
import { useAuthStore } from '@/lib/auth-store';
import { formatMoney } from '@/lib/currency';

type Tab = 'all' | 'my' | 'top';

function isMine(a: LiveBetFeedItem, user: { id: string; displayName: string }) {
  if (a.kind === 'bot') return false;
  if (a.userId && a.userId === user.id) return true;
  const name = (a.displayName || '').trim().toLowerCase();
  const mine = (user.displayName || '').trim().toLowerCase();
  if (name && mine && name === mine) return true;
  return false;
}

/**
 * Build stable rows from local practice slots.
 * Do NOT include live multiplier or Date.now() — those cause re-mount / shake.
 */
function rowsFromLocalBets(
  bets: Record<1 | 2, PracticeBetState | null>,
  user: { id: string; displayName: string },
  phase: string,
): LiveBetFeedItem[] {
  const out: LiveBetFeedItem[] = [];
  for (const slot of [1, 2] as const) {
    const b = bets[slot];
    if (!b) continue;
    const amount = b.remainingAmount > 0 ? b.remainingAmount : b.amount;
    const base = {
      kind: 'user' as const,
      userId: user.id,
      displayName: user.displayName,
      avatarHue: 200,
      slot,
      at: 0, // stable — never Date.now()
    };

    if (b.cashedOut || b.status === 'CASHED_OUT') {
      out.push({
        ...base,
        id: b.betId || `local-cash-${slot}`,
        amount: b.amount,
        type: 'CASH_OUT',
        multiplier: b.cashOutMultiplier ?? null,
        profit: b.profit ?? null,
      });
    } else if (b.status === 'QUEUED' || b.queued) {
      out.push({
        ...base,
        id: b.betId || `local-queue-${slot}`,
        amount: b.amount,
        type: 'BET',
        multiplier: null,
      });
    } else if (b.status === 'ACTIVE') {
      const busted = phase === 'CRASHED' && !b.cashedOut;
      out.push({
        ...base,
        id: b.betId || `local-active-${slot}`,
        amount,
        type: busted ? 'BUST' : 'BET',
        multiplier: null, // live mult applied at render time only
      });
    } else if (b.status === 'BUSTED') {
      out.push({
        ...base,
        id: b.betId || `local-bust-${slot}`,
        amount: b.amount,
        type: 'BUST',
        multiplier: null,
      });
    }
  }
  return out;
}

export function LiveFeed({ compact = false }: { compact?: boolean }) {
  const feed = useGameStore((s) => s.liveFeed);
  const bets = useGameStore((s) => s.bets);
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('all');

  // Rows rebuild only when bet identities / feed change — NOT every multiplier tick
  const rows = useMemo(() => {
    if (tab === 'my') {
      if (!user) return [];
      const fromFeed = feed.filter((a) => isMine(a, user));
      const fromLocal = rowsFromLocalBets(bets, user, phase);
      const localIds = new Set(fromLocal.map((r) => r.id));
      const localSlots = new Set(
        fromLocal.map((r) => r.slot).filter((s): s is 1 | 2 => s === 1 || s === 2),
      );
      const extra = fromFeed.filter((a) => {
        if (localIds.has(a.id)) return false;
        if (a.slot && localSlots.has(a.slot) && a.type === 'BET') return false;
        return true;
      });
      return [...fromLocal, ...extra].slice(0, 40);
    }
    if (tab === 'top') {
      return [...feed]
        .filter((a) => (a.type === 'CASH_OUT' || a.type === 'PARTIAL') && a.multiplier != null)
        .sort((a, b) => {
          const wa = a.amount * (a.multiplier ?? 0);
          const wb = b.amount * (b.multiplier ?? 0);
          return wb - wa;
        })
        .slice(0, 30);
    }
    if (user) {
      const local = rowsFromLocalBets(bets, user, phase);
      const ids = new Set(local.map((r) => r.id));
      return [...local, ...feed.filter((a) => !ids.has(a.id))].slice(0, 60);
    }
    return feed;
    // intentionally omit `multiplier` — live win is computed in render
  }, [feed, tab, user, bets, phase]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-xl border border-av-border bg-av-panel ${
        compact ? 'min-h-0' : 'min-h-[200px]'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-av-border px-2 py-1.5">
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-black/40 p-0.5">
          {(
            [
              ['all', 'All Bets'],
              ['my', 'My Bets'],
              ['top', 'Top'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md py-1.5 text-[11px] font-bold transition active:scale-[0.98] ${
                tab === id ? 'bg-av-border text-white' : 'text-av-muted hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-av-border px-3 py-1.5 text-[10px] font-semibold uppercase text-av-muted">
        <span>User</span>
        <span className="text-right">Bet</span>
        <span className="text-right">{tab === 'top' ? 'Profit' : 'Win'}</span>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'my' && !user && (
          <li className="px-3 py-6 text-center text-xs text-av-muted">Log in to see your bets</li>
        )}
        {rows.length === 0 && (tab !== 'my' || !!user) && (
          <li className="px-3 py-6 text-center text-xs text-av-muted">
            {tab === 'my'
              ? 'No bets yet — place one on Bet 1 or Bet 2'
              : tab === 'top'
                ? 'No cash-outs yet this session'
                : 'Bets will appear here in real time'}
          </li>
        )}
        {rows.map((a) => {
          const isMyLocal =
            !!user &&
            a.userId === user.id &&
            a.type === 'BET' &&
            a.slot != null &&
            bets[a.slot as 1 | 2]?.status === 'ACTIVE' &&
            !bets[a.slot as 1 | 2]?.cashedOut;
          const isLiveActive = isMyLocal && phase === 'FLYING';
          const liveWin =
            isLiveActive && a.amount > 0 ? a.amount * multiplier : null;
          const isCash = a.type === 'CASH_OUT' || a.type === 'PARTIAL';
          const slotLabel = a.slot != null ? ` ·${a.slot}` : '';
          // Stable key — never include index or Date.now()
          const rowKey = `${a.id}-${a.type}-${a.slot ?? 0}`;

          return (
            <li
              key={rowKey}
              className={`grid grid-cols-3 items-center gap-1 border-b border-white/[0.03] px-3 py-2 text-xs ${
                a.userId && user?.id === a.userId ? 'bg-white/[0.03]' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/10"
                  style={{ background: `hsl(${a.avatarHue} 65% 45%)` }}
                />
                <span className="truncate font-medium text-white/85">
                  {a.displayName}
                  {slotLabel && (
                    <span className="ml-0.5 text-[9px] text-av-muted">{slotLabel}</span>
                  )}
                  {a.kind === 'bot' && (
                    <span className="ml-0.5 text-[9px] text-av-muted">·bot</span>
                  )}
                  {a.userId && user?.id === a.userId && (
                    <span className="ml-0.5 text-[9px] font-bold text-av-gold">you</span>
                  )}
                </span>
              </div>
              <div className="text-right font-mono text-white/70">
                {formatMoney(a.amount, { compact: true })}
              </div>
              <div
                className={`text-right font-mono font-semibold tabular-nums ${
                  isCash || isLiveActive
                    ? 'text-av-green'
                    : a.type === 'BUST'
                      ? 'text-av-red/80'
                      : 'text-av-muted'
                }`}
              >
                {isCash && a.multiplier != null ? (
                  <span>
                    {a.profit != null
                      ? formatMoney(a.profit, { signed: true, compact: true })
                      : formatMoney(a.amount * a.multiplier, { compact: true })}
                    <span className="ml-0.5 text-[10px] text-av-muted">
                      @{a.multiplier.toFixed(2)}
                    </span>
                  </span>
                ) : isLiveActive && liveWin != null ? (
                  <span>
                    {formatMoney(liveWin, { compact: true })}
                    <span className="ml-0.5 text-[10px] text-av-muted">
                      @{multiplier.toFixed(2)}
                    </span>
                  </span>
                ) : a.type === 'BUST' ? (
                  '—'
                ) : a.type === 'BET' ? (
                  <span className="text-av-muted">
                    {a.slot && bets[a.slot as 1 | 2]?.status === 'QUEUED' ? 'queued' : '…'}
                  </span>
                ) : a.type === 'CANCEL' ? (
                  <span className="text-av-muted">cancel</span>
                ) : (
                  a.type
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
