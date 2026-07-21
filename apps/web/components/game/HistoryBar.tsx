'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useGameStore } from '@/lib/game-store';

function chipClass(m: number | null) {
  if (m == null) return 'chip chip-low';
  if (m < 2) return 'chip chip-low';
  if (m < 10) return 'chip chip-mid';
  return 'chip chip-high';
}

export function HistoryBar({ compact = false }: { compact?: boolean }) {
  const history = useGameStore((s) => s.history);

  const heat = useMemo(() => {
    const slice = history.slice(0, 24);
    if (!slice.length) return [];
    return slice.map((h) => {
      const m = h.crashPoint ?? 1;
      if (m < 2) return 'low';
      if (m < 10) return 'mid';
      return 'high';
    });
  }, [history]);

  return (
    <div className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1.5'}`}>
      {heat.length > 0 && !compact && (
        <div className="flex h-1 overflow-hidden rounded-full">
          {heat.map((t, i) => (
            <span
              key={i}
              className={`flex-1 ${
                t === 'low' ? 'bg-av-red/50' : t === 'mid' ? 'bg-violet-400/50' : 'bg-av-gold/60'
              }`}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5 sm:gap-1.5">
          {history.length === 0 && (
            <span className="px-1 text-[11px] text-av-muted sm:text-xs">Waiting for first round…</span>
          )}
          {history.slice(0, compact ? 20 : 32).map((h, idx) => (
            <Link
              key={h.id}
              href={`/history/${h.id}`}
              className={`${chipClass(h.crashPoint)} chip-enter transition hover:brightness-110 active:scale-95 ${
                compact ? '!px-1.5 !py-0.5 !text-[11px]' : ''
              } ${idx === 0 ? 'ring-1 ring-white/20' : ''}`}
              title={`Round #${h.roundNumber}${h.crashPoint != null ? ` · ${Number(h.crashPoint).toFixed(2)}x` : ''}`}
              style={{ animationDelay: `${Math.min(idx, 8) * 20}ms` }}
            >
              {h.crashPoint != null ? `${Number(h.crashPoint).toFixed(2)}x` : '—'}
            </Link>
          ))}
        </div>
        <Link
          href="/history"
          className={`shrink-0 rounded-full border border-av-border bg-av-panel font-semibold text-av-muted hover:text-white ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
          }`}
        >
          All
        </Link>
      </div>
    </div>
  );
}
