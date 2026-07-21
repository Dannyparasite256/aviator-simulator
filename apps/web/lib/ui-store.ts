'use client';

import { create } from 'zustand';
import { initSoundFromStorage, isMuted, setMuted as setSoundMuted, unlockAudio } from './sound';

export type FlightVisual = 'orb' | 'plane' | 'rocket';
export type ColorTheme = 'classic' | 'neon' | 'ice' | 'gold';

export interface ToastItem {
  id: string;
  kind: 'win' | 'info' | 'error' | 'crash';
  title: string;
  body?: string;
  createdAt: number;
}

interface UiState {
  muted: boolean;
  /** True after client-only preference load — safe for localStorage-dependent UI */
  soundHydrated: boolean;
  toasts: ToastItem[];
  reconnecting: boolean;

  flightVisual: FlightVisual;
  colorTheme: ColorTheme;
  reducedMotion: boolean;
  focusMode: boolean;
  coachDone: boolean;
  coachStep: number;

  /** Multiplier where player last cashed out (ghost marker) */
  ghostCashOutAt: number | null;
  /** Current win streak (consecutive rounds with at least one cash-out) */
  winStreak: number;
  /** Best cash-out multiplier this session */
  sessionBestCashOut: number;
  /** Show personal-best banner until dismissed */
  personalBestFlash: number | null;
  /** Last round had a cash-out (for streak bookkeeping) */
  cashedThisRound: boolean;

  hydrate: () => void;
  toggleMute: () => void;
  setMuted: (m: boolean) => void;
  pushToast: (t: Omit<ToastItem, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  setReconnecting: (v: boolean) => void;

  setFlightVisual: (v: FlightVisual) => void;
  setColorTheme: (t: ColorTheme) => void;
  setReducedMotion: (v: boolean) => void;
  setFocusMode: (v: boolean) => void;
  setCoachDone: (v: boolean) => void;
  setCoachStep: (n: number) => void;
  advanceCoach: () => void;

  recordCashOut: (multiplier: number) => void;
  onRoundStart: () => void;
  onRoundCrash: (hadActiveBet: boolean) => void;
  clearPersonalBestFlash: () => void;
}

const LS_FLIGHT = 'aviator_flight_visual';
const LS_THEME = 'aviator_color_theme';
const LS_MOTION = 'aviator_reduced_motion';
const LS_COACH = 'aviator_coach_done';
const LS_FOCUS = 'aviator_focus_mode';

function readLs<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  if (v && (allowed as readonly string[]).includes(v)) return v as T;
  return fallback;
}

// Do NOT read localStorage at module init (SSR vs client mismatch).
export const useUiStore = create<UiState>((set, get) => ({
  muted: false,
  soundHydrated: false,
  toasts: [],
  reconnecting: false,

  flightVisual: 'orb',
  colorTheme: 'classic',
  reducedMotion: false,
  focusMode: false,
  coachDone: true,
  coachStep: 0,

  ghostCashOutAt: null,
  winStreak: 0,
  sessionBestCashOut: 0,
  personalBestFlash: null,
  cashedThisRound: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    initSoundFromStorage();
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const storedMotion = localStorage.getItem(LS_MOTION);
    set({
      muted: isMuted(),
      soundHydrated: true,
      flightVisual: readLs(LS_FLIGHT, ['orb', 'plane', 'rocket'] as const, 'orb'),
      colorTheme: readLs(LS_THEME, ['classic', 'neon', 'ice', 'gold'] as const, 'classic'),
      reducedMotion: storedMotion === '1' ? true : storedMotion === '0' ? false : prefersReduced,
      focusMode: localStorage.getItem(LS_FOCUS) === '1',
      coachDone: localStorage.getItem(LS_COACH) === '1',
      coachStep: localStorage.getItem(LS_COACH) === '1' ? 3 : 0,
    });
  },

  toggleMute: () => {
    void unlockAudio();
    const next = !get().muted;
    setSoundMuted(next);
    set({ muted: next, soundHydrated: true });
  },

  setMuted: (m) => {
    setSoundMuted(m);
    set({ muted: m, soundHydrated: true });
  },

  pushToast: (t) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Math.random().toString(36).slice(2)}`;
    const item: ToastItem = {
      ...t,
      id,
      createdAt: typeof Date !== 'undefined' ? Date.now() : 0,
    };
    set((s) => ({ toasts: [item, ...s.toasts].slice(0, 5) }));
    if (typeof window !== 'undefined') {
      window.setTimeout(
        () => get().dismissToast(id),
        t.kind === 'win' ? 4500 : 3200,
      );
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  setReconnecting: (reconnecting) => set({ reconnecting }),

  setFlightVisual: (flightVisual) => {
    if (typeof window !== 'undefined') localStorage.setItem(LS_FLIGHT, flightVisual);
    set({ flightVisual });
  },

  setColorTheme: (colorTheme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_THEME, colorTheme);
      document.documentElement.dataset.theme = colorTheme;
    }
    set({ colorTheme });
  },

  setReducedMotion: (reducedMotion) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_MOTION, reducedMotion ? '1' : '0');
      document.documentElement.classList.toggle('reduce-motion', reducedMotion);
    }
    set({ reducedMotion });
  },

  setFocusMode: (focusMode) => {
    if (typeof window !== 'undefined') localStorage.setItem(LS_FOCUS, focusMode ? '1' : '0');
    set({ focusMode });
  },

  setCoachDone: (coachDone) => {
    if (typeof window !== 'undefined') {
      if (coachDone) localStorage.setItem(LS_COACH, '1');
      else localStorage.removeItem(LS_COACH);
    }
    set({ coachDone, coachStep: coachDone ? 3 : 0 });
  },

  setCoachStep: (coachStep) => set({ coachStep }),

  advanceCoach: () => {
    const next = get().coachStep + 1;
    if (next >= 3) {
      get().setCoachDone(true);
    } else {
      set({ coachStep: next });
    }
  },

  recordCashOut: (multiplier) => {
    const s = get();
    const isPersonalBest = multiplier > s.sessionBestCashOut;
    set({
      ghostCashOutAt: multiplier,
      cashedThisRound: true,
      sessionBestCashOut: isPersonalBest ? multiplier : s.sessionBestCashOut,
      personalBestFlash: isPersonalBest ? multiplier : s.personalBestFlash,
    });
  },

  onRoundStart: () => set({ cashedThisRound: false }),

  onRoundCrash: (hadActiveBet) => {
    const s = get();
    if (s.cashedThisRound) {
      set({ winStreak: s.winStreak + 1 });
    } else if (hadActiveBet) {
      set({ winStreak: 0 });
    }
  },

  clearPersonalBestFlash: () => set({ personalBestFlash: null }),
}));
