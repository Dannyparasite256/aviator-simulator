'use client';

/**
 * Auth + UI stores hydrate inside TopBar (and pages) after mount.
 * Keep Providers free of localStorage so layout SSR stays stable.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
