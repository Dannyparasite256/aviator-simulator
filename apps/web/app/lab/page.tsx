'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  MonteCarloResult,
  StrategyRunResult,
  StrategyType,
} from '@aviator/shared';

export default function LabPage() {
  const [type, setType] = useState<StrategyType>('fixed_cashout');
  const [baseBet, setBaseBet] = useState(100);
  const [cashOutAt, setCashOutAt] = useState(2);
  const [bankroll, setBankroll] = useState(10000);
  const [rounds, setRounds] = useState(500);
  const [strategy, setStrategy] = useState<StrategyRunResult | null>(null);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [myths, setMyths] = useState<Array<{ myth: string; truth: string }>>([]);
  const [theoretical, setTheoretical] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void api<{ items: Array<{ myth: string; truth: string }> }>('/lab/myths', { auth: false })
      .then((r) => setMyths(r.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void api<Record<string, unknown>>(`/lab/theoretical?cashOutAt=${cashOutAt}&bet=${baseBet}`, {
      auth: false,
    })
      .then(setTheoretical)
      .catch(() => undefined);
  }, [cashOutAt, baseBet]);

  async function runStrategy(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<StrategyRunResult>('/lab/strategy', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          type,
          baseBet,
          cashOutAt,
          bankroll,
          rounds,
          maxBet: baseBet * 64,
          bankrollPercent: 0.02,
        }),
      });
      setStrategy(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runMonteCarlo() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<MonteCarloResult>('/lab/monte-carlo', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          cashOutAt,
          bet: baseBet,
          bankroll,
          roundsPerPath: Math.min(rounds, 1000),
          paths: 200,
        }),
      });
      setMc(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategy lab</h1>
        <p className="text-sm text-white/50">
          Monte Carlo & strategy backtests on the virtual crash distribution. Educational only —
          house edge means long-run EV is negative.
        </p>
      </div>

      <form onSubmit={runStrategy} className="glass-strong grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">Strategy</label>
          <select
            className="input-field"
            value={type}
            onChange={(e) => setType(e.target.value as StrategyType)}
          >
            <option value="fixed_cashout">Fixed cash-out</option>
            <option value="flat">Flat bet</option>
            <option value="martingale">Martingale</option>
            <option value="anti_martingale">Anti-Martingale</option>
            <option value="percent_bankroll">% of bankroll</option>
          </select>
        </div>
        <div>
          <label className="label">Base bet (vc)</label>
          <input className="input-field" type="number" value={baseBet} onChange={(e) => setBaseBet(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Cash out at</label>
          <input className="input-field" type="number" step={0.01} value={cashOutAt} onChange={(e) => setCashOutAt(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Starting bankroll</label>
          <input className="input-field" type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Rounds</label>
          <input className="input-field" type="number" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            Run strategy
          </button>
          <button type="button" className="btn-secondary" disabled={loading} onClick={runMonteCarlo}>
            Monte Carlo
          </button>
        </div>
      </form>

      {error && <p className="text-accent-red">{error}</p>}

      {theoretical && (
        <div className="glass grid gap-3 p-4 sm:grid-cols-3">
          <Stat label="Theoretical EV / bet" value={Number(theoretical.evPerBet).toFixed(4)} />
          <Stat label="House edge" value={`${Number(theoretical.houseEdgeBps) / 100}%`} />
          <Stat label="Theoretical RTP" value={`${(Number(theoretical.theoreticalRtp) * 100).toFixed(2)}%`} />
        </div>
      )}

      {strategy && (
        <section className="glass-strong space-y-3 p-5">
          <h2 className="font-semibold">Strategy result</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Final bankroll" value={strategy.finalBankroll.toFixed(2)} />
            <Stat label="Net profit" value={strategy.netProfit.toFixed(2)} />
            <Stat label="Max drawdown" value={strategy.maxDrawdown.toFixed(2)} />
            <Stat label="Ruined?" value={strategy.ruined ? 'yes' : 'no'} />
          </div>
          <EquitySpark equity={strategy.equity} />
          <p className="text-xs text-white/40">{strategy.note}</p>
        </section>
      )}

      {mc && (
        <section className="glass-strong space-y-3 p-5">
          <h2 className="font-semibold">Monte Carlo ({mc.paths} paths)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Mean final" value={mc.meanFinalBankroll.toFixed(2)} />
            <Stat label="Median final" value={mc.medianFinalBankroll.toFixed(2)} />
            <Stat label="Ruin rate" value={`${(mc.ruinRate * 100).toFixed(1)}%`} />
            <Stat label="Avg max DD" value={mc.avgMaxDrawdown.toFixed(2)} />
          </div>
          <p className="text-xs text-white/40">{mc.note}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Myths vs math
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {myths.map((m) => (
            <div key={m.myth} className="glass p-4">
              <p className="text-sm font-medium text-accent-red/90">Myth: {m.myth}</p>
              <p className="mt-2 text-sm text-accent-lime/90">Truth: {m.truth}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function EquitySpark({ equity }: { equity: number[] }) {
  if (equity.length < 2) return null;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const w = 400;
  const h = 80;
  const pts = equity
    .map((v, i) => {
      const x = (i / (equity.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full max-w-xl text-accent-cyan">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} />
      </svg>
      <p className="text-xs text-white/40">Bankroll equity curve (sampled)</p>
    </div>
  );
}
