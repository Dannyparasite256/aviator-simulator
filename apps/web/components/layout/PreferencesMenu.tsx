'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ColorTheme,
  FlightVisual,
  useUiStore,
} from '@/lib/ui-store';

const VISUALS: { id: FlightVisual; label: string; emoji: string }[] = [
  { id: 'orb', label: 'Orb', emoji: '◉' },
  { id: 'plane', label: 'Plane', emoji: '✈' },
  { id: 'rocket', label: 'Rocket', emoji: '🚀' },
];

const THEMES: { id: ColorTheme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'neon', label: 'Neon' },
  { id: 'ice', label: 'Ice' },
  { id: 'gold', label: 'Gold' },
];

export function PreferencesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const flightVisual = useUiStore((s) => s.flightVisual);
  const setFlightVisual = useUiStore((s) => s.setFlightVisual);
  const colorTheme = useUiStore((s) => s.colorTheme);
  const setColorTheme = useUiStore((s) => s.setColorTheme);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const setCoachDone = useUiStore((s) => s.setCoachDone);
  const setCoachStep = useUiStore((s) => s.setCoachStep);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Display preferences"
        title="Display preferences"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-av-border bg-av-panel text-sm text-white/80 hover:bg-white/5 active:scale-95"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-[60] w-64 rounded-xl border border-av-border bg-av-panel p-3 shadow-glass">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-av-muted">
            Flight style
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {VISUALS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setFlightVisual(v.id)}
                className={`rounded-lg border py-2 text-center text-[11px] font-bold transition active:scale-95 ${
                  flightVisual === v.id
                    ? 'border-av-red bg-av-red/20 text-white'
                    : 'border-av-border bg-black/30 text-white/70 hover:bg-white/5'
                }`}
              >
                <div className="text-base leading-none">{v.emoji}</div>
                <div className="mt-1">{v.label}</div>
              </button>
            ))}
          </div>

          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-av-muted">
            Color theme
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setColorTheme(t.id)}
                className={`rounded-lg border py-1.5 text-[11px] font-bold transition active:scale-95 ${
                  colorTheme === t.id
                    ? 'border-av-gold bg-av-gold/15 text-av-gold'
                    : 'border-av-border bg-black/30 text-white/70 hover:bg-white/5'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-av-border bg-black/20 px-2.5 py-2 text-xs">
            <span className="font-semibold text-white/80">Reduced motion</span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="h-4 w-4 accent-av-red"
            />
          </label>

          <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-av-border bg-black/20 px-2.5 py-2 text-xs">
            <span className="font-semibold text-white/80">Focus mode</span>
            <input
              type="checkbox"
              checked={focusMode}
              onChange={(e) => setFocusMode(e.target.checked)}
              className="h-4 w-4 accent-av-red"
            />
          </label>

          <button
            type="button"
            className="btn-secondary w-full !py-2 text-xs"
            onClick={() => {
              if (typeof window !== 'undefined') localStorage.removeItem('aviator_coach_done');
              setCoachDone(false);
              setCoachStep(0);
              setOpen(false);
            }}
          >
            Replay tutorial
          </button>
        </div>
      )}
    </div>
  );
}
