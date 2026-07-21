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

export function HistoryBar() {
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
    <div className="flex flex-col gap-1.5">
      {/* Density heat strip */}
      {heat.length > 0 && (
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
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
          {history.length === 0 && (
            <span className="px-1 text-xs text-av-muted">Waiting for first round…</span>
          )}
          {history.slice(0, 32).map((h, idx) => (
            <Link
              key={h.id}
              href={`/history/${h.id}`}
              className={`${chipClass(h.crashPoint)} chip-enter transition hover:brightness-110 active:scale-95 ${
                idx === 0 ? 'ring-1 ring-white/20' : ''
              }`}
              title={`Round #${h.roundNumber}${h.crashPoint != null ? ` · ${Number(h.crashPoint).toFixed(2)}x` : ''}`}
              style={{ animationDelay: `${Math.min(idx, 8) * 20}ms` }}
            >
              {h.crashPoint != null ? `${Number(h.crashPoint).toFixed(2)}x` : '—'}
            </Link>
          ))}
        </div>
        <Link
          href="/history"
          className="shrink-0 rounded-full border border-av-border bg-av-panel px-2.5 py-1 text-[11px] font-semibold text-av-muted hover:text-white"
        >
          History
        </Link>
      </div>
    </div>
  );
}
