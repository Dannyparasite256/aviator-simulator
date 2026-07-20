'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api';

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function passwordScore(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (!password) return { score: 0, label: '', color: 'bg-white/10' };
  if (score <= 1) return { score, label: 'Weak', color: 'bg-av-red' };
  if (score === 2) return { score, label: 'Fair', color: 'bg-av-gold' };
  if (score === 3) return { score, label: 'Good', color: 'bg-emerald-500' };
  return { score, label: 'Strong', color: 'bg-av-green' };
}

function RegisterForm() {
  const register = useAuthStore((s) => s.register);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => safeNextPath(searchParams.get('next')),
    [searchParams],
  );

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const strength = passwordScore(password);

  useEffect(() => {
    if (hydrated && user) {
      router.replace(nextPath);
    }
  }, [hydrated, user, router, nextPath]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const name = displayName.trim();
    const mail = email.trim();

    if (name.length < 2) next.displayName = 'Display name must be at least 2 characters';
    else if (name.length > 40) next.displayName = 'Display name must be at most 40 characters';

    if (!mail) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) next.email = 'Enter a valid email';

    if (password.length < 8) next.password = 'Password must be at least 8 characters';
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      next.password = 'Include at least one letter and one number';
    }

    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match';

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await register(email, password, displayName);
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(err.message || 'Email already registered. Try signing in.');
        } else {
          setError(err.message || 'Registration failed');
        }
      } else {
        setError((err as Error).message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-2xl font-extrabold">Create account</h1>
          <p className="mt-1 text-sm text-av-muted">
            Starts with <span className="font-semibold text-av-gold">10,000</span> virtual credits ·
            no deposits
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="name">
              Display name
            </label>
            <input
              id="name"
              className={`input-field h-12 ${fieldErrors.displayName ? 'border-av-red/70' : ''}`}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (fieldErrors.displayName) {
                  setFieldErrors((f) => {
                    const { displayName: _, ...rest } = f;
                    return rest;
                  });
                }
              }}
              placeholder="Sky Pilot"
              autoComplete="nickname"
              maxLength={40}
              disabled={loading}
            />
            {fieldErrors.displayName && (
              <p className="mt-1 text-xs text-av-red">{fieldErrors.displayName}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              className={`input-field h-12 ${fieldErrors.email ? 'border-av-red/70' : ''}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((f) => {
                    const { email: _, ...rest } = f;
                    return rest;
                  });
                }
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
                autoComplete="new-password"
                className={`input-field h-12 pr-16 ${fieldErrors.password ? 'border-av-red/70' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((f) => {
                      const { password: _, ...rest } = f;
                      return rest;
                    });
                  }
                }}
                placeholder="Min. 8 chars, letter + number"
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
            {password && (
              <div className="mt-2">
                <div className="mb-1 flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i < strength.score ? strength.color : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-av-muted">
                  Strength: <span className="font-semibold text-white/80">{strength.label}</span>
                </p>
              </div>
            )}
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-av-red">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={`input-field h-12 ${fieldErrors.confirmPassword ? 'border-av-red/70' : ''}`}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((f) => {
                    const { confirmPassword: _, ...rest } = f;
                    return rest;
                  });
                }
              }}
              placeholder="Re-enter password"
              disabled={loading}
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-av-red">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-av-red/40 bg-av-red/10 px-3 py-2 text-sm text-[#ff8a9a]"
            >
              {error}
              {error.toLowerCase().includes('already') && (
                <>
                  {' '}
                  <Link href="/login" className="font-semibold underline">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3.5" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account & play'}
          </button>

          <p className="text-center text-[11px] leading-relaxed text-av-muted">
            Educational simulator only. Credits are virtual — no real-money gambling.
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-av-muted">
          Already have an account?{' '}
          <Link
            href={nextPath !== '/' ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'}
            className="font-semibold text-av-red hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50dvh] max-w-md items-center justify-center text-sm text-av-muted">
          Loading…
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
