'use client';

import { useEffect, useRef } from 'react';
import { LiveBetFeedItem, PracticeBetState, SOCKET_EVENTS } from '@aviator/shared';
import { getGameSocket } from '@/lib/socket';
import { useAuthStore } from '@/lib/auth-store';
import { useGameStore, HistoryItem } from '@/lib/game-store';
import { useUiStore } from '@/lib/ui-store';
import { onPhaseChange, playSfx } from '@/lib/sound';
import { api } from '@/lib/api';

export function useGameSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const prevPhase = useRef<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const socket = getGameSocket(accessToken);
    const ui = useUiStore.getState();

    const resyncBets = () => {
      const u = userRef.current;
      if (!u) return;
      void api<PracticeBetState[]>('/practice/bets')
        .then((bets) => useGameStore.getState().setBets(bets))
        .catch(() => undefined);
      void api<typeof u>('/users/me')
        .then((me) => setUser(me))
        .catch(() => undefined);
    };

    const onConnect = () => {
      useGameStore.getState().setConnected(true);
      ui.setReconnecting(false);
      // Full resync after (re)connect
      resyncBets();
    };

    const onDisconnect = () => {
      useGameStore.getState().setConnected(false);
      ui.setReconnecting(true);
    };

    const onReconnect = () => {
      ui.pushToast({
        kind: 'info',
        title: 'Reconnected',
        body: 'Live feed restored',
      });
      resyncBets();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect', onReconnect);
    if (socket.connected) onConnect();

    socket.on(SOCKET_EVENTS.ROUND_STATE, (s: Record<string, unknown>) => {
      const phase = String(s.phase ?? '');
      if (phase === 'WAITING' && prevPhase.current !== 'WAITING') {
        useUiStore.getState().onRoundStart();
      }
      onPhaseChange(phase, prevPhase.current);
      prevPhase.current = phase;
      useGameStore.getState().applyState(s);
    });

    socket.on(
      SOCKET_EVENTS.ROUND_TICK,
      (t: Parameters<ReturnType<typeof useGameStore.getState>['applyTick']>[0]) => {
        if (t.phase !== prevPhase.current) {
          onPhaseChange(t.phase, prevPhase.current);
          prevPhase.current = t.phase;
        }
        useGameStore.getState().applyTick(t);
      },
    );

    socket.on(
      SOCKET_EVENTS.ROUND_CRASH,
      (c: {
        crashPoint: number;
        serverSeed: string;
        serverSeedHash: string;
        clientSeed: string;
        nonce: number;
        roundId: string;
        roundNumber: number;
      }) => {
        onPhaseChange('CRASHED', prevPhase.current);
        prevPhase.current = 'CRASHED';
        const gs = useGameStore.getState();
        const ui = useUiStore.getState();
        const involved =
          ui.cashedThisRound ||
          !!(gs.bets[1] && (gs.bets[1].status === 'ACTIVE' || gs.bets[1].cashedOut)) ||
          !!(gs.bets[2] && (gs.bets[2].status === 'ACTIVE' || gs.bets[2].cashedOut));
        ui.onRoundCrash(involved);
        gs.applyCrash(c);
        ui.pushToast({
          kind: 'crash',
          title: `Flew away @ ${c.crashPoint.toFixed(2)}x`,
          body: 'Tap Fairness to verify this round',
        });
        // Refresh balance + open bets after round settles
        setTimeout(() => resyncBets(), 150);
        setTimeout(() => resyncBets(), 800);
      },
    );

    socket.on(SOCKET_EVENTS.ROUND_HISTORY, (h: HistoryItem[]) => {
      useGameStore.getState().setHistory(h);
    });

    socket.on(SOCKET_EVENTS.LIVE_FEED, (a: LiveBetFeedItem) => {
      // Feed still updates for all players/bots — no popups for others
      useGameStore.getState().pushLive(a);
    });

    socket.on(
      SOCKET_EVENTS.SIM_PLAYER_ACTION,
      (a: {
        playerId: string;
        name: string;
        avatarHue: number;
        type: 'BET' | 'CASH_OUT' | 'BUST';
        amount: number;
        multiplier: number | null;
      }) => {
        useGameStore.getState().pushLive({
          id: `${a.playerId}-${Date.now()}`,
          kind: 'bot',
          displayName: a.name,
          avatarHue: a.avatarHue,
          amount: a.amount,
          type: a.type === 'CASH_OUT' ? 'CASH_OUT' : a.type === 'BUST' ? 'BUST' : 'BET',
          multiplier: a.multiplier,
          at: Date.now(),
        });
      },
    );

    socket.on(SOCKET_EVENTS.PRACTICE_BET_OK, (r: PracticeBetState & { virtualCredits?: number }) => {
      if (r.slot) useGameStore.getState().setBet(r.slot, r);
      useGameStore.getState().setLastError(null);
      playSfx('bet');
      const u = userRef.current;
      if (u && r.virtualCredits != null) {
        setUser({ ...u, virtualCredits: r.virtualCredits });
      }
    });

    socket.on(SOCKET_EVENTS.PRACTICE_BET_ERROR, (e: { message: string }) => {
      useGameStore.getState().setLastError(e.message);
    });

    socket.on(
      SOCKET_EVENTS.PRACTICE_CASHOUT_OK,
      (r: PracticeBetState & { virtualCredits?: number; slot?: 1 | 2; profit?: number }) => {
        const slot = r.slot ?? 1;
        useGameStore.getState().setBet(slot, {
          ...r,
          slot,
          remainingAmount: r.remainingAmount ?? 0,
          status: r.cashedOut ? 'CASHED_OUT' : 'ACTIVE',
          partialProfit: r.partialProfit ?? 0,
          queued: false,
        });
        playSfx('cashout');
        const u = userRef.current;
        if (u && r.virtualCredits != null) {
          setUser({ ...u, virtualCredits: r.virtualCredits });
        }
        if (r.cashedOut && r.cashOutMultiplier != null) {
          useUiStore.getState().recordCashOut(Number(r.cashOutMultiplier));
          useUiStore.getState().pushToast({
            kind: 'win',
            title: `You cashed out @ ${Number(r.cashOutMultiplier).toFixed(2)}x`,
            body:
              r.profit != null
                ? `${r.profit >= 0 ? '+' : ''}${Number(r.profit).toFixed(2)} vc`
                : undefined,
          });
        }
      },
    );

    socket.on(SOCKET_EVENTS.PRACTICE_CASHOUT_ERROR, (e: { message: string }) => {
      useGameStore.getState().setLastError(e.message);
      resyncBets();
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onReconnect);
      socket.off(SOCKET_EVENTS.ROUND_STATE);
      socket.off(SOCKET_EVENTS.ROUND_TICK);
      socket.off(SOCKET_EVENTS.ROUND_CRASH);
      socket.off(SOCKET_EVENTS.ROUND_HISTORY);
      socket.off(SOCKET_EVENTS.LIVE_FEED);
      socket.off(SOCKET_EVENTS.SIM_PLAYER_ACTION);
      socket.off(SOCKET_EVENTS.PRACTICE_BET_OK);
      socket.off(SOCKET_EVENTS.PRACTICE_BET_ERROR);
      socket.off(SOCKET_EVENTS.PRACTICE_CASHOUT_OK);
      socket.off(SOCKET_EVENTS.PRACTICE_CASHOUT_ERROR);
    };
  }, [accessToken, setUser]);
}
