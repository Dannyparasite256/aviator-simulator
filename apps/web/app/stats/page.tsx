'use client';

import { FormEvent, useEffect, useState } from 'react';
import { GlobalStats, SessionReport, UserStats } from '@aviator/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function StatsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [mine, setMine] = useState<UserStats | null>(null);
  const [session, setSession] = useState<SessionReport | null>(null);
  const [lossLimit, setLossLimit] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [clientSeed, setClientSeed] = useState(user?.clientSeed ?? '');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void api<GlobalStats>('/stats/global', { auth: false })
      .then(setGlobal)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!user) {
      setMine(null);
      setSession(null);
      return;
    }
    setClientSeed(user.clientSeed);
    void api<UserStats>('/stats/me').then(setMine).catch(() => setMine(null));
    void api<SessionReport>('/lab/session').then(setSession).catch(() => setSession(null));
  }, [user]);

  async function saveSession(e: FormEvent) {
    e.preventDefault();
    try {
      const u = await api<typeof user>('/users/me/session', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionLossLimit: lossLimit === '' ? null : Number(lossLimit),
          sessionTimeLimitMin: timeLimit === '' ? null : Number(timeLimit),
        }),
      });
      if (u) setUser(u);
      setMsg('Session limits saved');
      await refreshUser();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function resetSession() {
    const u = await api<NonNullable<typeof user>>('/users/me/session/reset', { method: 'POST' });
    setUser(u);
    setMsg('Session reset');
    const s = await api<SessionReport>('/lab/session');
    setSession(s);
  }

  async function saveSeed(e: FormEvent) {
    e.preventDefault();
    const u = await api<NonNullable<typeof user>>('/users/me/client-seed', {
      method: 'PATCH',
      body: JSON.stringify({ clientSeed }),
    });
    setUser(u);
    setMsg('Client seed updated');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistics & session</h1>
        <p className="text-sm text-white/50">Simulation metrics — practice volume is virtual only.</p>
      </div>

      {error && <p className="text-accent-red">{error}</p>}
      {msg && <p className="text-accent-lime">{msg}</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">Global</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total rounds" value={global?.totalRounds} />
          <StatCard label="Avg crash point" value={global?.averageCrashPoint?.toFixed(2)} suffix="x" />
          <StatCard label="Highest crash" value={global?.highestCrashPoint?.toFixed(2)} suffix="x" />
          <StatCard label="Theoretical RTP" value={global != null ? `${(global.theoreticalRtp * 100).toFixed(2)}` : undefined} suffix="%" />
          <StatCard label="Observed RTP" value={global?.observedRtp != null ? `${(global.observedRtp * 100).toFixed(2)}` : '—'} suffix={global?.observedRtp != null ? '%' : ''} />
          <StatCard label="Practice volume (vc)" value={global?.totalPracticeVolume?.toLocaleString()} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">Your practice stats</h2>
        {!user ? (
          <p className="glass p-4 text-sm text-white/50">Log in to see personal statistics.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Rounds played" value={mine?.totalRoundsPlayed} />
            <StatCard label="Practice bets" value={mine?.totalPracticeBets} />
            <StatCard label="Net profit (vc)" value={mine?.totalPracticeProfit?.toFixed(2)} />
            <StatCard label="Best cash out" value={mine?.bestMultiplier?.toFixed(2)} suffix="x" />
            <StatCard label="Avg cash out" value={mine?.averageCashOut?.toFixed(2)} suffix="x" />
            <StatCard label="Cash-out rate" value={mine != null ? `${(mine.winRate * 100).toFixed(1)}` : undefined} suffix="%" />
          </div>
        )}
      </section>

      {user && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass-strong space-y-3 p-4">
            <h2 className="font-semibold">Session safety rails</h2>
            <p className="text-xs text-white/45">
              Virtual practice limits — stop when loss/time caps hit (education feature).
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <StatCard label="Session profit" value={session?.sessionProfit?.toFixed(2) ?? user.sessionProfit.toFixed(2)} />
              <StatCard label="Session bets" value={session?.bets} />
            </div>
            <form onSubmit={saveSession} className="space-y-2">
              <div>
                <label className="label">Loss limit (vc)</label>
                <input className="input-field" placeholder={user.sessionLossLimit?.toString() ?? 'none'} value={lossLimit} onChange={(e) => setLossLimit(e.target.value)} />
              </div>
              <div>
                <label className="label">Time limit (minutes)</label>
                <input className="input-field" placeholder={user.sessionTimeLimitMin?.toString() ?? 'none'} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">Save limits</button>
                <button type="button" className="btn-secondary" onClick={() => void resetSession()}>Reset session</button>
              </div>
            </form>
            {session && session.equity.length > 1 && (
              <p className="text-xs text-white/40">{session.equity.length} bankroll snapshots this session</p>
            )}
          </div>

          <div className="glass-strong space-y-3 p-4">
            <h2 className="font-semibold">Your client seed</h2>
            <p className="text-xs text-white/45">
              Used for personal fairness demos. Round crash points use the server round client seed.
            </p>
            <form onSubmit={saveSeed} className="space-y-2">
              <input className="input-field font-mono text-xs" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} />
              <button type="submit" className="btn-secondary">Update seed</button>
            </form>
            {session?.myths?.[0] && (
              <div className="rounded-xl bg-black/25 p-3 text-xs">
                <p className="text-accent-red/90">Myth: {session.myths[0].myth}</p>
                <p className="mt-1 text-accent-lime/90">Truth: {session.myths[0].truth}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value?: string | number | null;
  suffix?: string;
}) {
  return (
    <div className="glass-strong p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold">
        {value ?? '—'}
        {value != null && suffix ? (
          <span className="text-base font-semibold text-white/50">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}
