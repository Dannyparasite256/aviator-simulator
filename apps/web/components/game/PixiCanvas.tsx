'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game-store';

export function PixiCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const countdownRemainingMs = useGameStore((s) => s.countdownRemainingMs);
  const crashPoint = useGameStore((s) => s.crashPoint);

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
        scene.setState({
          phase: useGameStore.getState().phase,
          multiplier: useGameStore.getState().multiplier,
          countdownRemainingMs: useGameStore.getState().countdownRemainingMs,
          crashPoint: useGameStore.getState().crashPoint,
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
    });
  }, [phase, multiplier, countdownRemainingMs, crashPoint]);

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
