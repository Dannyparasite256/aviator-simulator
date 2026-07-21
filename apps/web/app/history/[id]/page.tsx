'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Draw scrubber curve + ball
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !replay) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const samples = replay.samples;
    if (samples.length < 2) return;

    const maxM = Math.max(...samples.map((s) => s.m), 1.01);
    const pad = 16;

    const xAt = (i: number) => pad + (i / (samples.length - 1)) * (w - pad * 2);
    const yAt = (m: number) => h - pad - ((m - 1) / (maxM - 1 || 1)) * (h - pad * 2);

    // Fill under curve up to playIdx
    ctx.beginPath();
    ctx.moveTo(xAt(0), h - pad);
    for (let i = 0; i <= playIdx; i++) {
      ctx.lineTo(xAt(i), yAt(samples[i].m));
    }
    ctx.lineTo(xAt(playIdx), h - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 45, 85, 0.15)';
    ctx.fill();

    // Full curve
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(samples[0].m));
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(xAt(i), yAt(samples[i].m));
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Played curve
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(samples[0].m));
    for (let i = 1; i <= playIdx; i++) {
      ctx.lineTo(xAt(i), yAt(samples[i].m));
    }
    ctx.strokeStyle = '#ff2d55';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ball
    const bx = xAt(playIdx);
    const by = yAt(samples[playIdx].m);
    const r = 8 + Math.min(10, Math.log(samples[playIdx].m) * 3);
    const grd = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, r);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(0.4, '#ff2d55');
    grd.addColorStop(1, 'rgba(227, 28, 61, 0.2)');
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }, [replay, playIdx]);

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

  const progress =
    replay && replay.samples.length > 1 ? playIdx / (replay.samples.length - 1) : 0;

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
        <div className="glass-strong space-y-2 p-4 text-sm">
          <Row label="Server seed hash" value={round.serverSeedHash} mono />
          <Row label="Server seed" value={round.serverSeed ?? '(revealed after crash)'} mono />
          <Row label="Client seed" value={round.clientSeed} mono />
          <Row label="Nonce" value={String(round.nonce)} mono />
          <Row label="Duration" value={round.durationMs != null ? `${round.durationMs} ms` : '—'} />
          <Row label="Started" value={round.startedAt ?? '—'} />
          <Row label="Crashed" value={round.crashedAt ?? '—'} />
        </div>

        <div className="glass-strong p-4">
          <h2 className="mb-2 font-semibold">Replay scrubber</h2>
          <p className="mb-3 text-xs text-white/45">
            Reconstructs the multiplier curve. Drag the scrubber or play to watch the orb climb.
          </p>

          <div className="relative mb-3 overflow-hidden rounded-xl border border-av-border bg-black/40">
            <canvas ref={canvasRef} className="h-40 w-full sm:h-48" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="font-mono text-4xl font-extrabold drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                {Number(currentM).toFixed(2)}x
              </div>
            </div>
          </div>

          {replay && (
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={Math.max(0, replay.samples.length - 1)}
                value={playIdx}
                onChange={(e) => {
                  setPlaying(false);
                  setPlayIdx(Number(e.target.value));
                }}
                className="w-full accent-av-red"
              />
              <div className="mt-1 flex justify-between text-[10px] text-av-muted">
                <span>1.00x</span>
                <span>{Math.round(progress * 100)}%</span>
                <span>
                  {round.crashPoint != null ? `${Number(round.crashPoint).toFixed(2)}x` : '—'}
                </span>
              </div>
            </div>
          )}

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
