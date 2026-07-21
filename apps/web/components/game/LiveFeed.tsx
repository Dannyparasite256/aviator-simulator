'use client';

import { useMemo, useState } from 'react';
import { useGameStore } from '@/lib/game-store';
import { useAuthStore } from '@/lib/auth-store';

type Tab = 'all' | 'my' | 'top';

export function LiveFeed() {
  const feed = useGameStore((s) => s.liveFeed);
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('all');

  const rows = useMemo(() => {
    if (tab === 'my') {
      if (!user) return [];
      return feed.filter(
        (a) =>
          a.kind === 'user' &&
          (a.displayName === user.displayName || a.displayName === 'Player'),
      );
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
    return feed;
  }, [feed, tab, user]);

  return (
    <div className="flex h-full min-h-[200px] flex-col overflow-hidden rounded-xl border border-av-border bg-av-panel">
      <div className="flex items-center justify-between border-b border-av-border px-2 py-2">
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

      <div className="grid grid-cols-3 gap-1 border-b border-av-border px-3 py-1.5 text-[10px] font-semibold uppercase text-av-muted">
        <span>User</span>
        <span className="text-right">Bet</span>
        <span className="text-right">{tab === 'top' ? 'Profit' : 'Win'}</span>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {tab === 'my' && !user && (
          <li className="px-3 py-6 text-center text-xs text-av-muted">Log in to see your bets</li>
        )}
        {rows.length === 0 && (tab !== 'my' || !!user) && (
          <li className="px-3 py-6 text-center text-xs text-av-muted">
            {tab === 'top' ? 'No cash-outs yet this session' : 'Bets will appear here in real time'}
          </li>
        )}
        {rows.map((a, i) => {
          const winAmt =
            (a.type === 'CASH_OUT' || a.type === 'PARTIAL') && a.multiplier
              ? a.amount * a.multiplier
              : null;
          const isCash = winAmt != null;
          return (
            <li
              key={`${a.id}-${a.at}-${i}`}
              className={`row-in grid grid-cols-3 items-center gap-1 border-b border-white/[0.03] px-3 py-2 text-xs ${
                isCash ? 'feed-cash-row' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/10"
                  style={{ background: `hsl(${a.avatarHue} 65% 45%)` }}
                />
                <span className="truncate font-medium text-white/85">
                  {a.displayName}
                  {a.kind === 'bot' && (
                    <span className="ml-0.5 text-[9px] text-av-muted">·bot</span>
                  )}
                </span>
              </div>
              <div className="text-right font-mono text-white/70">{a.amount}</div>
              <div
                className={`text-right font-mono font-semibold ${
                  winAmt != null
                    ? 'text-av-green'
                    : a.type === 'BUST'
                      ? 'text-av-red/80'
                      : 'text-av-muted'
                }`}
              >
                {winAmt != null ? (
                  <span>
                    {winAmt.toFixed(2)}
                    <span className="ml-0.5 text-[10px] text-av-muted">
                      @{a.multiplier?.toFixed(2)}
                    </span>
                  </span>
                ) : a.type === 'BUST' ? (
                  '—'
                ) : a.type === 'BET' ? (
                  <span className="text-av-muted">…</span>
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
