'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoundSummary } from '@aviator/shared';

export default function HistoryPage() {
  const [items, setItems] = useState<RoundSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: RoundSummary[]; total: number }>('/rounds?limit=50', { auth: false })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Round history</h1>
        <p className="text-sm text-white/50">
          {total} simulated rounds stored · click for detail & replay
        </p>
      </div>
      {error && <p className="text-accent-red">{error}</p>}
      <div className="glass-strong overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Round</th>
                <th className="px-4 py-3">Phase</th>
                <th className="px-4 py-3">Crash</th>
                <th className="px-4 py-3">Seed hash</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-mono">#{r.roundNumber}</td>
                  <td className="px-4 py-3">{r.phase}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-accent-cyan">
                    {r.crashPoint != null ? `${Number(r.crashPoint).toFixed(2)}x` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">
                    {r.serverSeedHash.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/history/${r.id}`} className="text-accent-cyan hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                    No rounds yet — start the API game engine.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
