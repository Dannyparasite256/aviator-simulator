'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SimulationSettings,
  ServerMetrics,
  AdminRoundPreview,
  DEFAULT_SIMULATION_SETTINGS,
  EdgeScenario,
} from '@aviator/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { WalletApprovals } from '@/components/admin/WalletApprovals';

interface SimPlayerRow {
  id: string;
  name: string;
  avatarHue: number;
  active: boolean;
  personality?: string;
  lastBetAmount: string | number | null;
  lastCashOutAt: string | number | null;
}

interface RtpReport {
  roundsSampled: number;
  betsSampled: number;
  averageCrashPoint: number;
  houseEdgeBps: number;
  theoreticalRtp: number;
  observedRtp: number | null;
  totalStake: number;
  netPlayerProfit: number;
  edgeScenario: string;
  note: string;
}

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();

  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SIMULATION_SETTINGS);
  const [activeRound, setActiveRound] = useState<Record<string, unknown> | null>(null);
  const [previews, setPreviews] = useState<AdminRoundPreview[]>([]);
  const [forecast, setForecast] = useState<{
    current: {
      roundNumber: number;
      phase: string;
      crashPoint: number;
      multiplier: number;
      serverSeedHash: string;
      nonce: number;
    } | null;
    next: {
      roundNumber: number;
      crashPoint: number;
      serverSeedHash: string;
      nonce: number;
      label: string;
    } | null;
    upcoming: Array<{
      label: string;
      roundNumber: number;
      crashPoint: number;
      serverSeedHash: string;
      nonce: number;
    }>;
    disclaimer: string;
  } | null>(null);
  const [seeds, setSeeds] = useState<Record<string, unknown> | null>(null);
  const [players, setPlayers] = useState<SimPlayerRow[]>([]);
  const [rtp, setRtp] = useState<RtpReport | null>(null);
  const [walletReqs, setWalletReqs] = useState<
    Array<{
      id: string;
      type: string;
      status: string;
      currencyCode: string;
      amountCurrency: number;
      amountVc: number;
      user?: { email: string; displayName: string; virtualCredits: number };
    }>
  >([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoBonus, setPromoBonus] = useState(200);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Load independently so one failing endpoint does not blank the whole admin panel
    const results = await Promise.allSettled([
      api<ServerMetrics>('/admin/metrics'),
      api<SimulationSettings>('/admin/settings'),
      api<Record<string, unknown> | null>('/admin/rounds/active'),
      api<{ items: AdminRoundPreview[] }>('/admin/preview-crashes?count=12'),
      api<Record<string, unknown>>('/admin/seeds'),
      api<SimPlayerRow[]>('/admin/sim-players'),
      api<RtpReport>('/admin/rtp'),
      api<typeof walletReqs>('/wallet/admin/requests?status=PENDING'),
      api<NonNullable<typeof forecast>>('/admin/rounds/next?count=12'),
    ]);

    const val = <T,>(i: number): T | null =>
      results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<T>).value : null;

    const m = val<ServerMetrics>(0);
    const s = val<SimulationSettings>(1);
    const r = val<Record<string, unknown> | null>(2);
    const p = val<{ items: AdminRoundPreview[] }>(3);
    const seed = val<Record<string, unknown>>(4);
    const pl = val<SimPlayerRow[]>(5);
    const rt = val<RtpReport>(6);
    const wr = val<typeof walletReqs>(7);
    const fc = val<NonNullable<typeof forecast>>(8);

    if (m) setMetrics(m);
    if (s) setSettings(s);
    if (r !== null) setActiveRound(r);
    if (p?.items) setPreviews(p.items);
    if (fc) setForecast(fc);
    if (seed) setSeeds(seed);
    if (pl) setPlayers(pl);
    if (rt) setRtp(rt);
    if (wr) setWalletReqs(wr);

    const failed = results.filter((x) => x.status === 'rejected').length;
    if (failed === results.length) {
      setError('Admin API failed — check you are logged in as admin and API is running');
    } else {
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.push('/login?next=/admin');
      return;
    }
    if (user.role !== 'ADMIN') {
      setError('Admin role required');
      return;
    }
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [user, hydrated, router, load]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    try {
      const s = await api<SimulationSettings>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(s);
      setMessage('Settings saved');
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function applyScenario(scenario: EdgeScenario) {
    const s = await api<SimulationSettings>('/admin/settings/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
    setSettings(s);
    setMessage(`Scenario applied: ${scenario}`);
  }

  async function exportLogs() {
    const data = await api<unknown>('/admin/logs/export?limit=200');
    downloadJson(data, `aviator-sim-logs-${Date.now()}.json`);
    setMessage('Logs exported');
  }

  async function exportFairness() {
    const data = await api<unknown>('/admin/fairness/export?limit=500');
    downloadJson(data, `aviator-fairness-proofs-${Date.now()}.json`);
    setMessage('Fairness proofs exported');
  }

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    if (!newPlayer.trim()) return;
    await api('/admin/sim-players', {
      method: 'POST',
      body: JSON.stringify({ name: newPlayer.trim(), personality: 'mixed' }),
    });
    setNewPlayer('');
    await load();
  }

  async function togglePlayer(p: SimPlayerRow) {
    await api(`/admin/sim-players/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !p.active }),
    });
    await load();
  }

  async function removePlayer(id: string) {
    await api(`/admin/sim-players/${id}`, { method: 'DELETE' });
    await load();
  }

  if (!hydrated) return <p className="text-white/50">Loading…</p>;
  if (user && user.role !== 'ADMIN') {
    return <p className="text-accent-red">Access denied — ADMIN role required.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-white/50">
            Simulation control · RTP · scenarios · fairness export
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={() => void exportLogs()}>
            Export logs
          </button>
          <button type="button" className="btn-primary text-sm" onClick={() => void exportFairness()}>
            Export fairness proofs
          </button>
        </div>
      </div>

      {message && <p className="text-av-green">{message}</p>}
      {error && <p className="text-av-red">{error}</p>}

      {/* Current + next round forecast — admin only */}
      <section className="rounded-xl border border-av-gold/40 bg-gradient-to-br from-[#1a1408] to-av-panel p-4 shadow-bet">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-av-gold">Round forecast</h2>
            <p className="text-xs text-av-muted">
              Admin-only · players never see this before crash · testing / debug
            </p>
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
            Refresh now
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-av-red/40 bg-black/40 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-av-red">
              Current round
            </div>
            {forecast?.current ? (
              <>
                <div className="mt-1 text-sm text-white/70">
                  #{forecast.current.roundNumber} ·{' '}
                  <span className="font-semibold text-white">{forecast.current.phase}</span>
                </div>
                <div className="mt-2 font-mono text-4xl font-extrabold text-av-red">
                  {Number(forecast.current.crashPoint).toFixed(2)}x
                </div>
                <div className="mt-1 text-xs text-av-muted">
                  Live mult {Number(forecast.current.multiplier).toFixed(2)}x · will crash at
                  above
                </div>
                <div className="mt-2 truncate font-mono text-[10px] text-white/30">
                  hash {forecast.current.serverSeedHash?.slice(0, 16)}… · nonce{' '}
                  {forecast.current.nonce}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-av-muted">No active round</p>
            )}
          </div>

          <div className="rounded-xl border border-av-green/40 bg-black/40 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-av-green">
              Next round
            </div>
            {forecast?.next ? (
              <>
                <div className="mt-1 text-sm text-white/70">
                  #{forecast.next.roundNumber} · upcoming
                </div>
                <div className="mt-2 font-mono text-4xl font-extrabold text-av-green">
                  {Number(forecast.next.crashPoint).toFixed(2)}x
                </div>
                <div className="mt-1 text-xs text-av-muted">
                  Crash point already determined for the next takeoff
                </div>
                <div className="mt-2 truncate font-mono text-[10px] text-white/30">
                  hash {forecast.next.serverSeedHash?.slice(0, 16)}… · nonce {forecast.next.nonce}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-av-muted">No preview available</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-av-muted">
            Next 12 rounds
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(forecast?.upcoming ?? previews).map((p, idx) => (
              <div
                key={`${p.roundNumber}-${idx}`}
                className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs ${
                  idx === 0
                    ? 'border-av-green/50 bg-av-green/15 text-av-green'
                    : 'border-av-border bg-black/30 text-white/80'
                }`}
                title={`Round #${p.roundNumber}`}
              >
                <span className="text-white/40">#{p.roundNumber}</span>{' '}
                <span className="font-bold">{Number(p.crashPoint).toFixed(2)}x</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Full virtual fund approval panel */}
      <WalletApprovals />

      <section className="rounded-xl border border-av-border bg-av-panel p-4">
        <h2 className="mb-2 font-semibold">Promo codes</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void api('/wallet/admin/promos', {
              method: 'POST',
              body: JSON.stringify({ code: promoCode, bonusVc: promoBonus }),
            }).then(() => {
              setMessage(`Promo ${promoCode} created`);
              setPromoCode('');
            });
          }}
        >
          <div>
            <label className="label">New promo code</label>
            <input
              className="input-field"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="BONUS100"
              required
            />
          </div>
          <div>
            <label className="label">Bonus VC</label>
            <input
              className="input-field w-28"
              type="number"
              value={promoBonus}
              onChange={(e) => setPromoBonus(Number(e.target.value))}
            />
          </div>
          <button type="submit" className="btn-secondary">
            Create promo
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
          Server performance
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Uptime" value={metrics ? `${metrics.uptimeSeconds}s` : '—'} />
          <Metric label="Heap" value={metrics ? `${metrics.memoryHeapUsedMb} MB` : '—'} />
          <Metric label="WS connections" value={metrics?.activeConnections} />
          <Metric label="Engine TPS" value={metrics?.ticksPerSecond} />
          <Metric label="DB latency" value={metrics != null ? `${metrics.dbLatencyMs} ms` : '—'} />
          <Metric label="Redis" value={metrics?.redisConnected ? 'connected' : 'optional/off'} />
          <Metric label="Phase" value={metrics?.currentPhase ?? '—'} />
          <Metric label="RSS" value={metrics ? `${metrics.memoryRssMb} MB` : '—'} />
        </div>
      </section>

      {rtp && (
        <section className="glass-strong p-4">
          <h2 className="mb-2 font-semibold">RTP report</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Theoretical RTP" value={`${(rtp.theoreticalRtp * 100).toFixed(2)}%`} />
            <Metric
              label="Observed RTP"
              value={rtp.observedRtp != null ? `${(rtp.observedRtp * 100).toFixed(2)}%` : 'n/a'}
            />
            <Metric label="Avg crash" value={`${rtp.averageCrashPoint.toFixed(2)}x`} />
            <Metric label="Net player P/L" value={rtp.netPlayerProfit.toFixed(2)} />
          </div>
          <p className="mt-2 text-xs text-white/40">{rtp.note}</p>
        </section>
      )}

      <section className="glass-strong p-4">
        <h2 className="mb-2 font-semibold">Edge scenarios</h2>
        <div className="flex flex-wrap gap-2">
          {(['low', 'standard', 'high', 'long_tail'] as EdgeScenario[]).map((sc) => (
            <button
              key={sc}
              type="button"
              className={`btn-secondary text-sm ${settings.edgeScenario === sc ? '!border-accent-cyan' : ''}`}
              onClick={() => void applyScenario(sc)}
            >
              {sc}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-strong p-4">
        <h2 className="mb-2 font-semibold">Active simulation round</h2>
        <pre className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-accent-cyan">
          {JSON.stringify(activeRound, null, 2)}
        </pre>
      </section>

      <section className="glass-strong p-4">
        <h2 className="mb-3 font-semibold">Simulation settings</h2>
        <form onSubmit={saveSettings} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['countdownSeconds', 'Countdown (s)'],
              ['waitingSeconds', 'Waiting (s)'],
              ['minCrashMultiplier', 'Min crash'],
              ['maxCrashMultiplier', 'Max crash'],
              ['houseEdgeBps', 'House edge (bps)'],
              ['tickMs', 'Tick ms'],
              ['targetFps', 'Target FPS'],
              ['growthRate', 'Growth rate'],
              ['simulatedPlayersMin', 'Sim players min'],
              ['simulatedPlayersMax', 'Sim players max'],
              ['minBet', 'Min bet'],
              ['maxBet', 'Max bet'],
              ['maxProfitPerBet', 'Max profit / bet'],
              ['seedRotateEveryNRounds', 'Seed rotate every N'],
              ['practiceDefaultBet', 'Default practice bet'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type="number"
                step="any"
                className="input-field"
                value={settings[key] as number}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
          <div>
            <label className="label">Bot personality</label>
            <select
              className="input-field"
              value={settings.botPersonality}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  botPersonality: e.target.value as SimulationSettings['botPersonality'],
                }))
              }
            >
              <option value="mixed">mixed</option>
              <option value="early">early</option>
              <option value="balanced">balanced</option>
              <option value="moon">moon</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.debugMode}
              onChange={(e) => setSettings((s) => ({ ...s, debugMode: e.target.checked }))}
            />
            Debug mode
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autoRestart}
              onChange={(e) => setSettings((s) => ({ ...s, autoRestart: e.target.checked }))}
            />
            Auto-restart
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.allowPartialCashOut}
              onChange={(e) =>
                setSettings((s) => ({ ...s, allowPartialCashOut: e.target.checked }))
              }
            />
            Allow partial cash-out
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="btn-primary">
              Save settings
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-strong p-4">
          <h2 className="mb-2 font-semibold">Simulation seeds</h2>
          <pre className="max-h-56 overflow-auto rounded-xl bg-black/30 p-3 text-xs">
            {JSON.stringify(seeds, null, 2)}
          </pre>
        </section>
        <section className="glass-strong rounded-xl border border-av-border bg-av-panel p-4">
          <h2 className="mb-2 font-semibold">Upcoming crash list</h2>
          <p className="mb-2 text-xs text-av-gold/80">
            Same forecast as above · auto-refreshes every few seconds
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {(forecast?.upcoming ?? previews).map((p, idx) => (
              <li
                key={`${p.roundNumber}-list-${idx}`}
                className={`flex justify-between rounded-lg px-3 py-2 font-mono ${
                  idx === 0 ? 'bg-av-green/15 text-av-green' : 'bg-black/20'
                }`}
              >
                <span>
                  {idx === 0 ? 'NEXT' : `+${idx + 1}`} · #{p.roundNumber}
                </span>
                <span className="font-bold text-av-red">
                  {Number(p.crashPoint).toFixed(2)}x
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass-strong p-4">
        <h2 className="mb-3 font-semibold">Simulated players</h2>
        <form onSubmit={addPlayer} className="mb-4 flex flex-wrap gap-2">
          <input
            className="input-field max-w-xs"
            placeholder="Player name"
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Add
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase text-white/40">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Personality</th>
                <th className="py-2">Active</th>
                <th className="py-2">Last</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2">
                    <span
                      className="mr-2 inline-block h-3 w-3 rounded-full"
                      style={{ background: `hsl(${p.avatarHue} 70% 50%)` }}
                    />
                    {p.name}
                  </td>
                  <td className="py-2 text-white/50">{p.personality ?? 'mixed'}</td>
                  <td className="py-2">{p.active ? 'yes' : 'no'}</td>
                  <td className="py-2 font-mono text-xs text-white/50">
                    {p.lastCashOutAt != null ? `@ ${Number(p.lastCashOutAt).toFixed(2)}x` : '—'}
                  </td>
                  <td className="space-x-2 py-2 text-right">
                    <button
                      type="button"
                      className="text-accent-cyan hover:underline"
                      onClick={() => void togglePlayer(p)}
                    >
                      Toggle
                    </button>
                    <button
                      type="button"
                      className="text-accent-red hover:underline"
                      onClick={() => void removePlayer(p.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="glass p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold">{value ?? '—'}</div>
    </div>
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
