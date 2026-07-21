'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

const links = [
  { href: '/', label: 'Simulator' },
  { href: '/lab', label: 'Lab' },
  { href: '/verify', label: 'Verify' },
  { href: '/stats', label: 'Stats' },
  { href: '/history', label: 'History' },
  { href: '/admin', label: 'Admin', admin: true },
];

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-sky-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-red to-accent-gold text-sm font-black shadow-lg">
            A
          </span>
          <div>
            <div className="text-sm font-bold tracking-tight group-hover:text-white">
              Aviator Sim
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">
              Educational · Virtual only
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            if (l.admin && user?.role !== 'ADMIN') return null;
            const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium">{user.displayName}</div>
                <div className="font-mono text-[11px] text-accent-gold">
                  {Math.round(Number(user.virtualCredits) || 0).toLocaleString()} UGX
                  {user.sessionProfit !== 0 && (
                    <span className={user.sessionProfit >= 0 ? ' text-accent-lime' : ' text-accent-red'}>
                      {' '}
                      ({user.sessionProfit >= 0 ? '+' : ''}
                      {user.sessionProfit.toFixed(0)})
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => logout()}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary !px-3 !py-1.5 text-sm">
                Log in
              </Link>
              <Link href="/register" className="btn-primary !px-3 !py-1.5 text-sm">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
        {links.map((l) => {
          if (l.admin && user?.role !== 'ADMIN') return null;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-lg bg-white/5 px-3 py-1 text-xs text-white/70"
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
