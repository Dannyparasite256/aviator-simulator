'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurrencyInfo, WalletRequest } from '@aviator/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';

interface WalletData {
  disclaimer: string;
  virtualCredits: number;
  preferredCurrency: string;
  display: { code: string; symbol: string; amount: number; rateToVc: number } | null;
  currencies: CurrencyInfo[];
  pendingRequests: number;
}

interface Notif {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const router = useRouter();
  const pushToast = useUiStore((s) => s.pushToast);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [currency, setCurrency] = useState('UGX');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [promo, setPromo] = useState('WELCOME500');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, r, n] = await Promise.all([
        api<WalletData>('/wallet'),
        api<WalletRequest[]>('/wallet/requests'),
        api<Notif[]>('/wallet/notifications'),
      ]);
      setWallet(w);
      setRequests(r);
      setNotifs(n);
      if (w.preferredCurrency) setCurrency(w.preferredCurrency);
      await refreshUser();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refreshUser]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.push('/login?next=/wallet');
      return;
    }
    void load();
  }, [user, hydrated, router, load]);

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/wallet/requests', {
        method: 'POST',
        body: JSON.stringify({
          type,
          currencyCode: currency,
          amountCurrency: Number(amount),
          note: note || undefined,
        }),
      });
      pushToast({
        kind: 'info',
        title: `${type === 'DEPOSIT' ? 'Deposit' : 'Withdraw'} submitted`,
        body: 'Waiting for admin approval (virtual only)',
      });
      setNote('');
      await load();
      await refreshUser();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function redeemPromo(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ bonusVc: number; virtualCredits: number }>('/wallet/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: promo }),
      });
      pushToast({
        kind: 'win',
        title: 'Promo redeemed',
        body: `+${res.bonusVc} VC`,
      });
      await refreshUser();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function setPreferred(code: string) {
    await api('/wallet/currency', {
      method: 'PATCH',
      body: JSON.stringify({ currencyCode: code }),
    });
    setCurrency(code);
    await load();
    await refreshUser();
  }

  async function cancelReq(id: string) {
    await api(`/wallet/requests/${id}/cancel`, { method: 'POST' });
    await load();
    await refreshUser();
  }

  if (!hydrated || !user) {
    return <p className="text-av-muted">Loading wallet…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Wallet</h1>
        <p className="text-sm text-av-muted">
          Virtual multi-currency ledger · deposits & withdrawals require admin approval ·{' '}
          <strong className="text-av-gold">not real money</strong>
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-av-red/40 bg-av-red/10 px-3 py-2 text-sm text-[#ff8a9a]">
          {error}
        </div>
      )}

      {/* Balances */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-av-border bg-av-panel p-5 shadow-bet">
          <div className="text-xs font-semibold uppercase tracking-wide text-av-muted">
            Virtual credits
          </div>
          <div className="mt-1 font-mono text-3xl font-extrabold text-av-gold">
            {(wallet?.virtualCredits ?? user.virtualCredits).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-base text-av-muted">VC</span>
          </div>
          {wallet?.display && (
            <div className="mt-2 text-sm text-white/70">
              ≈ {wallet.display.symbol}
              {wallet.display.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
              {wallet.display.code}
            </div>
          )}
          {wallet && wallet.pendingRequests > 0 && (
            <div className="mt-2 text-xs font-semibold text-av-pink">
              {wallet.pendingRequests} pending request(s)
            </div>
          )}
        </div>

        <div className="rounded-xl border border-av-border bg-av-panel p-5 shadow-bet">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-av-muted">
            Display currency
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(wallet?.currencies ?? []).map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => void setPreferred(c.code)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  currency === c.code
                    ? 'border-av-red bg-av-red/20 text-white'
                    : 'border-av-border bg-black/30 text-av-muted hover:text-white'
                }`}
              >
                {c.symbol} {c.code}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-av-muted">
            Rates are simulated for display only. Ledger unit is always VC.
          </p>
        </div>
      </div>

      {/* Deposit / Withdraw */}
      <form
        onSubmit={submitRequest}
        className="rounded-xl border border-av-border bg-av-panel p-5 shadow-bet space-y-3"
      >
        <h2 className="font-bold">Request deposit / withdraw</h2>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/40 p-0.5">
          {(['DEPOSIT', 'WITHDRAW'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md py-2 text-xs font-bold uppercase ${
                type === t ? 'bg-av-border text-white' : 'text-av-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Currency</label>
            <select
              className="input-field h-11"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {(wallet?.currencies ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} (1 = {c.rateToVc} VC)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              className="input-field h-11 font-mono"
              type="number"
              step="any"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input-field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reference for admin"
          />
        </div>
        <p className="text-[11px] text-av-gold">
          {type === 'DEPOSIT'
            ? 'Admin must approve before VC is credited. No real bank deposits.'
            : 'VC is held while pending. Admin approval releases the virtual withdraw.'}
        </p>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>
          {loading ? 'Submitting…' : `Submit ${type.toLowerCase()} request`}
        </button>
      </form>

      {/* Promo */}
      <form
        onSubmit={redeemPromo}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-av-border bg-av-panel p-4"
      >
        <div className="min-w-[180px] flex-1">
          <label className="label">Promo code</label>
          <input
            className="input-field"
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="WELCOME500"
          />
        </div>
        <button type="submit" className="btn-secondary">
          Redeem
        </button>
      </form>

      {/* Requests history */}
      <section className="rounded-xl border border-av-border bg-av-panel p-4">
        <h2 className="mb-3 font-bold">Your requests</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[10px] uppercase text-av-muted">
              <tr>
                <th className="py-2">Type</th>
                <th className="py-2">Amount</th>
                <th className="py-2">VC</th>
                <th className="py-2">Status</th>
                <th className="py-2">Date</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 font-semibold">{r.type}</td>
                  <td className="py-2 font-mono">
                    {r.amountCurrency} {r.currencyCode}
                  </td>
                  <td className="py-2 font-mono">{r.amountVc}</td>
                  <td className="py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="py-2 text-xs text-av-muted">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    {r.status === 'PENDING' && (
                      <button
                        type="button"
                        className="text-xs font-bold text-av-red hover:underline"
                        onClick={() => void cancelReq(r.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-av-muted">
                    No requests yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-av-border bg-av-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Notifications</h2>
          <button
            type="button"
            className="text-xs font-semibold text-av-muted hover:text-white"
            onClick={() =>
              void api('/wallet/notifications/read', { method: 'POST', body: '{}' }).then(load)
            }
          >
            Mark all read
          </button>
        </div>
        <ul className="space-y-2">
          {notifs.slice(0, 12).map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                n.read ? 'border-white/5 bg-black/20 text-white/50' : 'border-av-border bg-black/40'
              }`}
            >
              <div className="font-semibold">{n.title}</div>
              <div className="text-xs text-av-muted">{n.body}</div>
            </li>
          ))}
          {notifs.length === 0 && (
            <li className="text-sm text-av-muted">No notifications</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'APPROVED'
      ? 'text-av-green bg-av-green/15'
      : status === 'REJECTED'
        ? 'text-av-red bg-av-red/15'
        : status === 'PENDING'
          ? 'text-av-gold bg-av-gold/15'
          : 'text-av-muted bg-white/10';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
      {status}
    </span>
  );
}
