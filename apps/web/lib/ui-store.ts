'use client';

import { create } from 'zustand';
import { initSoundFromStorage, isMuted, setMuted as setSoundMuted, unlockAudio } from './sound';

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
  hydrate: () => void;
  toggleMute: () => void;
  setMuted: (m: boolean) => void;
  pushToast: (t: Omit<ToastItem, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  setReconnecting: (v: boolean) => void;
}

// Do NOT read localStorage at module init (SSR vs client mismatch).
export const useUiStore = create<UiState>((set, get) => ({
  muted: false,
  soundHydrated: false,
  toasts: [],
  reconnecting: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    initSoundFromStorage();
    set({ muted: isMuted(), soundHydrated: true });
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
    // Stable enough id without Date.now on SSR (toasts only mount client-side)
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
}));
