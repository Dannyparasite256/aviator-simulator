'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/lib/ui-store';

export function PersonalBestBanner() {
  const flash = useUiStore((s) => s.personalBestFlash);
  const clear = useUiStore((s) => s.clearPersonalBestFlash);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  useEffect(() => {
    if (flash == null) return;
    const t = setTimeout(() => clear(), 4200);
    return () => clearTimeout(t);
  }, [flash, clear]);

  if (flash == null) return null;

  return (
    <div
      className={`fixed left-1/2 top-20 z-[85] -translate-x-1/2 rounded-2xl border border-av-gold/50 bg-gradient-to-r from-[#2a1a08] to-[#1a1208] px-5 py-3 shadow-glass ${
        reducedMotion ? '' : 'pb-banner-in'
      }`}
      role="status"
    >
      <div className="text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-av-gold">
          Personal best
        </div>
        <div className="mt-0.5 font-mono text-2xl font-black text-white">
          {flash.toFixed(2)}x
        </div>
        <button
          type="button"
          className="mt-1 text-[10px] font-semibold text-white/40 hover:text-white/70"
          onClick={() => clear()}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
