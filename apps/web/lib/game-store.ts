'use client';

import { create } from 'zustand';
import {
  RoundPhase,
  PracticeBetState,
  LiveBetFeedItem,
  BetSlot,
} from '@aviator/shared';

export interface HistoryItem {
  id: string;
  roundNumber: number;
  crashPoint: number | null;
  serverSeedHash: string;
  createdAt: string;
}

interface GameState {
  connected: boolean;
  roundId: string | null;
  roundNumber: number;
  phase: RoundPhase;
  multiplier: number;
  countdownRemainingMs: number;
  crashPoint: number | null;
  serverSeedHash: string | null;
  serverSeed: string | null;
  clientSeed: string | null;
  nonce: number | null;
  flyStartedAt: number | null;
  growthRate: number;
  serverTimeOffset: number;
  history: HistoryItem[];
  liveFeed: LiveBetFeedItem[];
  bets: Record<BetSlot, PracticeBetState | null>;
  lastError: string | null;
  debugMode: boolean;
  minBet: number;
  maxBet: number;
  allowPartialCashOut: boolean;
  houseEdgeBps: number;
  setConnected: (v: boolean) => void;
  applyState: (s: Record<string, unknown>) => void;
  applyTick: (t: {
    phase: RoundPhase;
    multiplier: number;
    countdownRemainingMs?: number;
    roundId: string;
    roundNumber: number;
    flyStartedAt?: number | null;
    serverTime?: number;
    growthRate?: number;
  }) => void;
  applyCrash: (c: {
    crashPoint: number;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    roundId: string;
    roundNumber: number;
  }) => void;
  setHistory: (h: HistoryItem[]) => void;
  pushLive: (a: LiveBetFeedItem) => void;
  setBet: (slot: BetSlot, bet: PracticeBetState | null) => void;
  setBets: (bets: PracticeBetState[]) => void;
  setLastError: (e: string | null) => void;
  /** Client-side interpolated multiplier using server clock */
  predictedMultiplier: () => number;
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  roundId: null,
  roundNumber: 0,
  phase: 'WAITING',
  multiplier: 1,
  countdownRemainingMs: 0,
  crashPoint: null,
  serverSeedHash: null,
  serverSeed: null,
  clientSeed: null,
  nonce: null,
  flyStartedAt: null,
  growthRate: 0.06,
  serverTimeOffset: 0,
  history: [],
  liveFeed: [],
  bets: { 1: null, 2: null },
  lastError: null,
  debugMode: false,
  minBet: 1,
  maxBet: 100000,
  allowPartialCashOut: true,
  houseEdgeBps: 300,

  setConnected: (connected) => set({ connected }),

  applyState: (s) =>
    set((prev) => {
      const phase = (s.phase as RoundPhase) ?? 'WAITING';
      const nextRound = (s.roundNumber as number) ?? 0;
      const isNewRound = nextRound !== prev.roundNumber && phase === 'WAITING';
      const settings = (s.settings as Record<string, unknown>) || {};
      return {
        roundId: (s.id as string) ?? null,
        roundNumber: nextRound,
        phase,
        multiplier: (s.multiplier as number) ?? 1,
        crashPoint: (s.crashPoint as number | null) ?? null,
        serverSeedHash: (s.serverSeedHash as string) ?? null,
        serverSeed: (s.serverSeed as string | null) ?? null,
        clientSeed: (s.clientSeed as string) ?? null,
        nonce: (s.nonce as number) ?? null,
        flyStartedAt: (s.flyStartedAt as number | null) ?? null,
        growthRate: (s.growthRate as number) ?? (settings.growthRate as number) ?? 0.06,
        debugMode: Boolean(settings.debugMode),
        minBet: Number(settings.minBet ?? prev.minBet),
        maxBet: Number(settings.maxBet ?? prev.maxBet),
        allowPartialCashOut: Boolean(settings.allowPartialCashOut ?? prev.allowPartialCashOut),
        houseEdgeBps: Number(settings.houseEdgeBps ?? prev.houseEdgeBps),
        serverTimeOffset: s.serverTime
          ? (s.serverTime as number) - Date.now()
          : prev.serverTimeOffset,
        ...(isNewRound
          ? {
              liveFeed: [],
              bets: {
                1: prev.bets[1]?.queued ? prev.bets[1] : null,
                2: prev.bets[2]?.queued ? prev.bets[2] : null,
              },
            }
          : {}),
      };
    }),

  applyTick: (t) =>
    set((prev) => ({
      phase: t.phase,
      multiplier: t.multiplier,
      countdownRemainingMs: t.countdownRemainingMs ?? 0,
      roundId: t.roundId,
      roundNumber: t.roundNumber,
      flyStartedAt: t.flyStartedAt !== undefined ? t.flyStartedAt : prev.flyStartedAt,
      growthRate: t.growthRate ?? prev.growthRate,
      serverTimeOffset:
        t.serverTime != null ? t.serverTime - Date.now() : prev.serverTimeOffset,
    })),

  applyCrash: (c) =>
    set((state) => {
      const settle = (b: PracticeBetState | null): PracticeBetState | null => {
        if (!b) return null;
        // Keep queued bets for next round; clear active flying bets
        if (b.status === 'QUEUED' || b.queued) return b;
        if (b.status === 'ACTIVE' && !b.cashedOut) return null;
        if (b.cashedOut || b.status === 'CASHED_OUT') return b;
        return null;
      };
      return {
        phase: 'CRASHED' as const,
        multiplier: c.crashPoint,
        crashPoint: c.crashPoint,
        serverSeed: c.serverSeed,
        serverSeedHash: c.serverSeedHash,
        clientSeed: c.clientSeed,
        nonce: c.nonce,
        bets: {
          1: settle(state.bets[1]),
          2: settle(state.bets[2]),
        },
        history: [
          {
            id: c.roundId,
            roundNumber: c.roundNumber,
            crashPoint: c.crashPoint,
            serverSeedHash: c.serverSeedHash,
            createdAt: new Date().toISOString(),
          },
          ...state.history,
        ].slice(0, 40),
      };
    }),

  setHistory: (history) => set({ history }),

  pushLive: (a) =>
    set((state) => ({
      liveFeed: [a, ...state.liveFeed].slice(0, 60),
    })),

  setBet: (slot, bet) =>
    set((state) => ({
      bets: { ...state.bets, [slot]: bet },
    })),

  setBets: (bets) =>
    set(() => {
      const map: Record<BetSlot, PracticeBetState | null> = { 1: null, 2: null };
      for (const b of bets) {
        map[b.slot] = b;
      }
      return { bets: map };
    }),

  setLastError: (lastError) => set({ lastError }),

  predictedMultiplier: () => {
    const s = get();
    if (s.phase !== 'FLYING' || !s.flyStartedAt) return s.multiplier;
    const serverNow = Date.now() + s.serverTimeOffset;
    const elapsed = Math.max(0, serverNow - s.flyStartedAt);
    const t = elapsed / 1000;
    const m = Math.exp(s.growthRate * t);
    return Math.max(1, Math.floor(m * 100) / 100);
  },
}));
