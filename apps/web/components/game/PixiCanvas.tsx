'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game-store';
import { useUiStore } from '@/lib/ui-store';

export function PixiCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const countdownRemainingMs = useGameStore((s) => s.countdownRemainingMs);
  const crashPoint = useGameStore((s) => s.crashPoint);
  const bets = useGameStore((s) => s.bets);
  const flightVisual = useUiStore((s) => s.flightVisual);
  const colorTheme = useUiStore((s) => s.colorTheme);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const ghostCashOutAt = useUiStore((s) => s.ghostCashOutAt);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void (async () => {
      try {
        const { GameScene } = await import('@/lib/pixi/game-scene');
        if (cancelled) return;
        const scene = new GameScene();
        sceneRef.current = scene;
        await scene.mount(host, 144);
        if (cancelled) {
          scene.unmount();
          return;
        }
        const gs = useGameStore.getState();
        const us = useUiStore.getState();
        scene.setState({
          phase: gs.phase,
          multiplier: gs.multiplier,
          countdownRemainingMs: gs.countdownRemainingMs,
          crashPoint: gs.crashPoint,
          flightVisual: us.flightVisual,
          colorTheme: us.colorTheme,
          reducedMotion: us.reducedMotion,
          ghostCashOutAt: us.ghostCashOutAt,
          autoMarkers: autoMarkersFromBets(gs.bets),
        });
      } catch (err) {
        console.error('Pixi mount failed', err);
        setError((err as Error).message || 'Canvas failed');
      }
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.unmount();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setState({
      phase,
      multiplier,
      countdownRemainingMs,
      crashPoint,
      flightVisual,
      colorTheme,
      reducedMotion,
      ghostCashOutAt,
      autoMarkers: autoMarkersFromBets(bets),
    });
  }, [
    phase,
    multiplier,
    countdownRemainingMs,
    crashPoint,
    flightVisual,
    colorTheme,
    reducedMotion,
    ghostCashOutAt,
    bets,
  ]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      aria-label="Flight canvas"
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-av-stage">
          <div className="text-center text-av-muted text-xs">GPU canvas unavailable</div>
        </div>
      )}
    </div>
  );
}

function autoMarkersFromBets(
  bets: Record<1 | 2, { autoCashOutAt?: number | null; status?: string; cashedOut?: boolean } | null>,
): number[] {
  const out: number[] = [];
  for (const slot of [1, 2] as const) {
    const b = bets[slot];
    if (
      b &&
      b.autoCashOutAt != null &&
      b.autoCashOutAt > 1 &&
      (b.status === 'ACTIVE' || b.status === 'QUEUED') &&
      !b.cashedOut
    ) {
      out.push(Number(b.autoCashOutAt));
    }
  }
  return out;
}
