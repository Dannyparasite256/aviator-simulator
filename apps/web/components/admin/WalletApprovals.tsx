'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type WalletReq = {
  id: string;
  type: string;
  status: string;
  currencyCode: string;
  amountCurrency: number;
  amountVc: number;
  note: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    virtualCredits: number;
  };
};

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  virtualCredits: number | string;
  role: string;
};

/**
 * Dedicated admin panel for approving virtual deposit/withdraw requests.
 */
export function WalletApprovals() {
  const [filter, setFilter] = useState<'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [rows, setRows] = useState<WalletReq[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState(1000);
  const [grantNote, setGrantNote] = useState('');

  const load = useCallback(async () => {
    try {
      const path =
        filter === 'ALL'
          ? '/wallet/admin/requests'
          : `/wallet/admin/requests?status=${filter}`;
      const [list, u] = await Promise.all([
        api<WalletReq[]>(path),
        api<AdminUser[]>('/wallet/admin/users'),
      ]);
      setRows(list);
      setUsers(u);
      if (!grantUserId && u[0]) setGrantUserId(u[0].id);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter, grantUserId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(id);
    setMessage(null);
    setError(null);
    try {
      await api(`/wallet/admin/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          adminNote: decision === 'REJECTED' ? 'Rejected by admin' : 'Approved by admin',
        }),
      });
      setMessage(
        decision === 'APPROVED'
          ? 'Request approved — virtual credits updated'
          : 'Request rejected',
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function grantCredits(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ granted: number; virtualCredits: number }>('/wallet/admin/grant', {
        method: 'POST',
        body: JSON.stringify({
          userId: grantUserId,
          amountVc: grantAmount,
          note: grantNote || undefined,
        }),
      });
      setMessage(`Granted +${r.granted} VC (new balance ${r.virtualCredits})`);
      setGrantNote('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

  return (
    <section className="rounded-xl border border-av-green/40 bg-av-panel p-4 shadow-bet">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-av-green">Virtual fund approvals</h2>
          <p className="text-xs text-av-muted">
            Approve player deposit / withdraw requests · simulation credits only · not real money
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filter === 'PENDING' && pendingCount > 0 && (
            <span className="rounded-full bg-av-gold/20 px-2.5 py-1 text-xs font-bold text-av-gold">
              {pendingCount} pending
            </span>
          )}
          <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-3 rounded-lg border border-av-green/30 bg-av-green/10 px-3 py-2 text-sm text-av-green">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-av-red/30 bg-av-red/10 px-3 py-2 text-sm text-av-red">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {(['PENDING', 'ALL', 'APPROVED', 'REJECTED'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              filter === f
                ? 'bg-av-green text-white'
                : 'border border-av-border bg-black/30 text-av-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="max-h-[420px] space-y-2 overflow-y-auto">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-av-muted">No {filter.toLowerCase()} requests</p>
        )}
        {rows.map((w) => (
          <div
            key={w.id}
            className="flex flex-col gap-2 rounded-xl border border-av-border bg-black/35 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    w.type === 'DEPOSIT'
                      ? 'bg-av-green/20 text-av-green'
                      : 'bg-av-gold/20 text-av-gold'
                  }`}
                >
                  {w.type}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    w.status === 'PENDING'
                      ? 'bg-av-gold/15 text-av-gold'
                      : w.status === 'APPROVED'
                        ? 'bg-av-green/15 text-av-green'
                        : 'bg-av-red/15 text-av-red'
                  }`}
                >
                  {w.status}
                </span>
              </div>
              <div className="mt-1 font-mono text-sm font-bold">
                {w.amountCurrency} {w.currencyCode}{' '}
                <span className="text-av-muted">→</span>{' '}
                <span className="text-av-gold">{w.amountVc.toLocaleString()} VC</span>
              </div>
              <div className="text-xs text-white/70">
                {w.user?.displayName} · {w.user?.email}
              </div>
              <div className="text-[11px] text-av-muted">
                Balance now: {Number(w.user?.virtualCredits ?? 0).toLocaleString()} VC ·{' '}
                {new Date(w.createdAt).toLocaleString()}
              </div>
              {w.note && <div className="mt-0.5 text-[11px] text-white/40">Note: {w.note}</div>}
            </div>

            {w.status === 'PENDING' && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === w.id}
                  className="btn-success !rounded-lg !px-4 !py-2 text-sm font-extrabold"
                  onClick={() => void review(w.id, 'APPROVED')}
                >
                  {busyId === w.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busyId === w.id}
                  className="btn-secondary !rounded-lg !px-4 !py-2 text-sm font-bold text-av-red"
                  onClick={() => void review(w.id, 'REJECTED')}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Direct grant */}
      <form
        onSubmit={grantCredits}
        className="mt-4 grid gap-2 border-t border-av-border pt-4 sm:grid-cols-4"
      >
        <div className="sm:col-span-2">
          <label className="label">Grant VC to user (direct)</label>
          <select
            className="input-field"
            value={grantUserId}
            onChange={(e) => setGrantUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email}) — {Number(u.virtualCredits).toLocaleString()} VC
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount VC</label>
          <input
            className="input-field font-mono"
            type="number"
            min={1}
            max={1_000_000}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full !rounded-lg">
            Grant credits
          </button>
        </div>
        <div className="sm:col-span-4">
          <input
            className="input-field"
            placeholder="Optional note"
            value={grantNote}
            onChange={(e) => setGrantNote(e.target.value)}
          />
        </div>
      </form>
    </section>
  );
}
