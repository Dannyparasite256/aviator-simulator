'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoundDetail } from '@aviator/shared';

interface ReplayData {
  round: RoundDetail;
  samples: Array<{ t: number; m: number }>;
  note: string;
}

export default function RoundDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [round, setRound] = useState<RoundDetail | null>(null);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<RoundDetail>(`/rounds/${id}`, { auth: false })
      .then(setRound)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (!playing || !replay) return;
    if (playIdx >= replay.samples.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setPlayIdx((i) => i + 1), 16);
    return () => clearTimeout(timer);
  }, [playing, playIdx, replay]);

  const currentM = useMemo(() => {
    if (!replay) return round?.crashPoint ?? 1;
    return replay.samples[playIdx]?.m ?? 1;
  }, [replay, playIdx, round]);

  async function loadReplay() {
    try {
      const data = await api<ReplayData>(`/rounds/${id}/replay`, { auth: false });
      setReplay(data);
      setPlayIdx(0);
      setPlaying(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-accent-red">{error}</p>
        <Link href="/history" className="text-accent-cyan">
          ← Back
        </Link>
      </div>
    );
  }

  if (!round) {
    return <p className="text-white/50">Loading round…</p>;
  }

  return (
    <div className="space-y-4">
      <Link href="/history" className="text-sm text-accent-cyan hover:underline">
        ← History
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Round #{round.roundNumber}</h1>
          <p className="text-sm text-white/50">{round.phase} · educational replay</p>
        </div>
        <div className="font-mono text-3xl font-bold text-accent-red">
          {round.crashPoint != null ? `${Number(round.crashPoint).toFixed(2)}x` : '—'}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-strong p-4 space-y-2 text-sm">
          <Row label="Server seed hash" value={round.serverSeedHash} mono />
          <Row label="Server seed" value={round.serverSeed ?? '(revealed after crash)'} mono />
          <Row label="Client seed" value={round.clientSeed} mono />
          <Row label="Nonce" value={String(round.nonce)} mono />
          <Row label="Duration" value={round.durationMs != null ? `${round.durationMs} ms` : '—'} />
          <Row label="Started" value={round.startedAt ?? '—'} />
          <Row label="Crashed" value={round.crashedAt ?? '—'} />
        </div>

        <div className="glass-strong p-4">
          <h2 className="mb-2 font-semibold">Replay</h2>
          <p className="mb-3 text-xs text-white/45">
            Reconstructs multiplier curve client-side for completed rounds.
          </p>
          <div className="mb-4 flex h-32 items-center justify-center rounded-xl bg-black/30 font-mono text-4xl font-bold">
            {Number(currentM).toFixed(2)}x
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={loadReplay}>
              Load & play replay
            </button>
            {replay && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPlayIdx(0);
                    setPlaying(true);
                  }}
                >
                  Restart
                </button>
              </>
            )}
          </div>
          {replay && (
            <p className="mt-2 text-xs text-white/40">
              Frame {playIdx + 1}/{replay.samples.length} · {replay.note}
            </p>
          )}
        </div>
      </div>

      <div className="glass-strong p-4">
        <h2 className="mb-3 font-semibold">Events ({round.events?.length ?? 0})</h2>
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {(round.events ?? []).map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2"
            >
              <span className="font-medium">{e.type}</span>
              <span className="font-mono text-accent-cyan">
                {e.multiplier != null ? `${Number(e.multiplier).toFixed(2)}x` : '—'}
              </span>
              <span className="text-xs text-white/40">
                {new Date(e.createdAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-2 sm:flex-row sm:justify-between">
      <span className="text-white/40">{label}</span>
      <span className={`break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
