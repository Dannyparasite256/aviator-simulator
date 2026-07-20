'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api';

const DEMO_ACCOUNTS = [
  {
    label: 'Player',
    email: 'player@aviator.local',
    password: 'Player123!',
    hint: '10,000 virtual credits',
  },
  {
    label: 'Admin',
    email: 'admin@aviator.local',
    password: 'Admin123!',
    hint: 'Admin dashboard access',
  },
] as const;

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => safeNextPath(searchParams.get('next')),
    [searchParams],
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && user) {
      router.replace(user.role === 'ADMIN' && nextPath === '/' ? '/admin' : nextPath);
    }
  }, [hydrated, user, router, nextPath]);

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    const trimmed = email.trim();
    if (!trimmed) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) next.email = 'Enter a valid email';
    if (!password) next.password = 'Password is required';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email, password);
      const current = useAuthStore.getState().user;
      if (current?.role === 'ADMIN' && nextPath === '/') {
        router.replace('/admin');
      } else {
        router.replace(nextPath);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Login failed');
      } else {
        setError((err as Error).message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
    setFieldErrors({});
  }

  if (hydrated && user) {
    return (
      <div className="mx-auto flex min-h-[50dvh] max-w-md items-center justify-center text-sm text-av-muted">
        Already signed in — redirecting…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-1">
      <div className="rounded-2xl border border-av-border bg-av-panel p-6 shadow-bet sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-av-red/20">
            <span className="text-xl font-black text-av-red">A</span>
          </div>
          <h1 className="text-2xl font-extrabold">Sign in</h1>
          <p className="mt-1 text-sm text-av-muted">
            Virtual practice account — no real money
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              className={`input-field h-12 ${fieldErrors.email ? 'border-av-red/70' : ''}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
              }}
              placeholder="you@example.com"
              disabled={loading}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-av-red">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`input-field h-12 pr-16 ${fieldErrors.password ? 'border-av-red/70' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                }}
                placeholder="Your password"
                disabled={loading}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-av-muted hover:text-white"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-av-red">{fieldErrors.password}</p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-av-red/40 bg-av-red/10 px-3 py-2 text-sm text-[#ff8a9a]"
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3.5" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-av-muted">
          No account?{' '}
          <Link
            href={nextPath !== '/' ? `/register?next=${encodeURIComponent(nextPath)}` : '/register'}
            className="font-semibold text-av-red hover:underline"
          >
            Create one free
          </Link>
        </p>

        <div className="mt-5 border-t border-av-border pt-4">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-av-muted">
            Quick demo accounts
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={loading}
                onClick={() => fillDemo(account)}
                className="rounded-xl border border-av-border bg-black/30 px-3 py-2.5 text-left transition hover:border-av-red/50 hover:bg-white/5"
              >
                <div className="text-sm font-bold text-white">{account.label}</div>
                <div className="truncate text-[11px] text-av-muted">{account.email}</div>
                <div className="mt-0.5 text-[10px] text-white/40">{account.hint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50dvh] max-w-md items-center justify-center text-sm text-av-muted">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
