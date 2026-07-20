'use client';

import { FormEvent, useState } from 'react';
import { useGameStore } from '@/lib/game-store';
import { api } from '@/lib/api';
import { FairnessVerifyResult } from '@aviator/shared';

export default function VerifyPage() {
  const live = useGameStore();
  const [serverSeed, setServerSeed] = useState(live.serverSeed ?? '');
  const [clientSeed, setClientSeed] = useState(live.clientSeed ?? 'aviator-sim-round-client');
  const [nonce, setNonce] = useState(String(live.nonce ?? 0));
  const [houseEdgeBps, setHouseEdgeBps] = useState(String(live.houseEdgeBps || 300));
  const [result, setResult] = useState<FairnessVerifyResult | null>(null);
  const [roundCheck, setRoundCheck] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<FairnessVerifyResult>('/fairness/verify', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          serverSeed,
          clientSeed,
          nonce: Number(nonce),
          houseEdgeBps: Number(houseEdgeBps),
        }),
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function verifyLastRound() {
    if (!live.roundId || live.phase !== 'CRASHED') {
      setError('Wait for a crashed round, or open a round from History');
      return;
    }
    try {
      const res = await api<Record<string, unknown>>(
        `/fairness/rounds/${live.roundId}/verify?houseEdgeBps=${houseEdgeBps}`,
        { auth: false },
      );
      setRoundCheck(res);
      if (res.serverSeed) setServerSeed(String(res.serverSeed));
      if (res.clientSeed) setClientSeed(String(res.clientSeed));
      if (res.nonce != null) setNonce(String(res.nonce));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Provably fair verify</h1>
        <p className="text-sm text-white/50">
          Recompute crash points from revealed seeds — educational commit–reveal demo.
          Not a real casino.
        </p>
      </div>

      <div className="glass-strong space-y-4 p-5">
        <form onSubmit={onVerify} className="space-y-3">
          <div>
            <label className="label">Server seed (revealed after crash)</label>
            <input className="input-field font-mono text-xs" value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} required />
          </div>
          <div>
            <label className="label">Client seed</label>
            <input className="input-field font-mono text-xs" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nonce</label>
              <input className="input-field" type="number" value={nonce} onChange={(e) => setNonce(e.target.value)} required />
            </div>
            <div>
              <label className="label">House edge (bps)</label>
              <input className="input-field" type="number" value={houseEdgeBps} onChange={(e) => setHouseEdgeBps(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">
              Compute crash point
            </button>
            <button type="button" className="btn-secondary" onClick={verifyLastRound}>
              Verify current crashed round
            </button>
          </div>
        </form>

        {error && <p className="text-sm text-accent-red">{error}</p>}

        {result && (
          <div className="rounded-xl bg-black/30 p-4 text-sm">
            <div className="text-2xl font-mono font-bold text-accent-lime">
              {result.crashPoint.toFixed(2)}x
            </div>
            <p className="mt-2 break-all font-mono text-xs text-white/50">
              hash: {result.serverSeedHash}
            </p>
            <p className="mt-2 text-xs text-white/40">{result.formula}</p>
            <p className="mt-2 text-xs text-accent-gold">{result.note}</p>
          </div>
        )}

        {roundCheck && (
          <pre className="max-h-64 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-accent-cyan">
            {JSON.stringify(roundCheck, null, 2)}
          </pre>
        )}
      </div>

      <div className="glass p-4 text-sm text-white/55">
        <h2 className="mb-2 font-semibold text-white/80">How commit–reveal works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Before takeoff, only <code className="text-accent-cyan">SHA256(serverSeed)</code> is public.</li>
          <li>Crash point is fixed from HMAC(serverSeed, clientSeed:nonce).</li>
          <li>After crash, serverSeed is revealed so anyone can recompute.</li>
          <li>House edge is applied once in the distribution formula.</li>
        </ol>
      </div>
    </div>
  );
}
