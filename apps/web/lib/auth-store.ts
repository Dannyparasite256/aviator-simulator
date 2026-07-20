'use client';

import { create } from 'zustand';
import { PublicUser, AuthResponse } from '@aviator/shared';
import { api, setTokens, clearTokens, refreshAccessToken } from './api';
import { reconnectWithToken, disconnectGameSocket } from './socket';

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  hydrated: boolean;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: PublicUser) => void;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    set({ accessToken, hydrated: true });

    if (!accessToken && !refreshToken) return;

    void (async () => {
      try {
        // Ensure we have a usable access token
        let token = accessToken;
        if (!token && refreshToken) {
          token = await refreshAccessToken();
        }
        if (!token) {
          clearTokens();
          set({ user: null, accessToken: null });
          return;
        }
        set({ accessToken: token });
        await get().refreshUser();
        reconnectWithToken(token);
      } catch {
        // Try one refresh then give up
        const token = await refreshAccessToken();
        if (!token) {
          clearTokens();
          set({ user: null, accessToken: null });
          return;
        }
        try {
          set({ accessToken: token });
          await get().refreshUser();
          reconnectWithToken(token);
        } catch {
          clearTokens();
          set({ user: null, accessToken: null });
        }
      }
    })();
  },

  login: async (email, password) => {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizeEmail(email), password }),
      auth: false,
    });
    setTokens(res.tokens);
    set({ user: res.user, accessToken: res.tokens.accessToken });
    reconnectWithToken(res.tokens.accessToken);
  },

  register: async (email, password, displayName) => {
    const res = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizeEmail(email),
        password,
        displayName: displayName.trim(),
      }),
      auth: false,
    });
    setTokens(res.tokens);
    set({ user: res.user, accessToken: res.tokens.accessToken });
    reconnectWithToken(res.tokens.accessToken);
  },

  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore network / already logged out */
    }
    clearTokens();
    disconnectGameSocket();
    set({ user: null, accessToken: null });
  },

  refreshUser: async () => {
    const user = await api<PublicUser>('/users/me');
    set({ user });
  },

  setUser: (user) => set({ user }),
}));
