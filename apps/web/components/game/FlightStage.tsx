'use client';

import { useEffect, useState } from 'react';
import { PixiCanvas } from '@/components/game/PixiCanvas';
import { useGameStore } from '@/lib/game-store';
import { useUiStore } from '@/lib/ui-store';
import Link from 'next/link';

export function FlightStage() {
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const predicted = useGameStore((s) => s.predictedMultiplier);
  const countdownRemainingMs = useGameStore((s) => s.countdownRemainingMs);
  const serverSeed = useGameStore((s) => s.serverSeed);
  const debugMode = useGameStore((s) => s.debugMode);
  const crashPoint = useGameStore((s) => s.crashPoint);
  const connected = useGameStore((s) => s.connected);
  const reconnecting = useUiStore((s) => s.reconnecting);
  const [displayMult, setDisplayMult] = useState(1);
  const [flyAwayPulse, setFlyAwayPulse] = useState(false);

  // Smooth client-side multiplier interpolation while flying
  useEffect(() => {
    if (phase !== 'FLYING') {
      setDisplayMult(multiplier);
      return;
    }
    let raf = 0;
    const loop = () => {
      setDisplayMult(predicted());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, predicted, multiplier]);

  useEffect(() => {
    if (phase === 'CRASHED') {
      setFlyAwayPulse(true);
      const t = setTimeout(() => setFlyAwayPulse(false), 900);
      return () => clearTimeout(t);
    }
  }, [phase, crashPoint]);

  const shown = phase === 'FLYING' ? displayMult : multiplier;
  const multColor =
    phase === 'CRASHED'
      ? 'text-av-red'
      : phase === 'FLYING'
        ? 'text-white'
        : 'text-white/90';

  return (
    <div className="relative overflow-hidden rounded-xl border border-av-border stage-shell">
      <div className="relative min-h-[240px] sm:min-h-[300px] md:min-h-[380px] lg:min-h-[420px]">
        <PixiCanvas />

        {/* Crash flash overlay */}
        {phase === 'CRASHED' && (
          <div
            className={`pointer-events-none absolute inset-0 z-10 bg-av-red/20 transition-opacity duration-500 ${
              flyAwayPulse ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          {phase === 'COUNTDOWN' && (
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-av-muted">
              Starting in{' '}
              <span className="font-mono text-white">
                {Math.ceil(countdownRemainingMs / 1000)}
              </span>
              s
            </div>
          )}
          {phase === 'WAITING' && (
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-av-muted">
              Place your bets
            </div>
          )}
          {phase === 'CRASHED' && (
            <div
              className={`mb-1 text-base font-extrabold uppercase tracking-[0.2em] text-av-red sm:text-lg ${
                flyAwayPulse ? 'scale-110' : 'scale-100'
              } transition-transform duration-300`}
            >
              Flew away!
            </div>
          )}
          <div
            className={`font-mono text-5xl font-extrabold tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] transition-transform duration-150 sm:text-6xl md:text-7xl ${multColor} ${
              phase === 'FLYING' ? 'scale-100' : phase === 'CRASHED' ? 'scale-105' : ''
            }`}
          >
            {shown.toFixed(2)}x
          </div>
          {phase === 'FLYING' && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/4 animate-pulse rounded-full bg-gradient-to-r from-av-pink to-av-red" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-av-pink/90">
                In flight
              </span>
            </div>
          )}
        </div>

        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold backdrop-blur sm:left-3 sm:top-3">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-av-green' : reconnecting ? 'animate-pulse bg-av-gold' : 'bg-av-red'
            }`}
          />
          <span className="text-white/70">
            {connected ? 'Network OK' : reconnecting ? 'Reconnecting…' : 'Offline'}
          </span>
        </div>

        {debugMode && crashPoint != null && phase !== 'CRASHED' && (
          <div className="absolute right-2 top-2 z-30 rounded-md bg-av-gold/20 px-2 py-1 text-[10px] font-bold text-av-gold">
            DBG {crashPoint.toFixed(2)}x
          </div>
        )}
      </div>

      {phase === 'CRASHED' && serverSeed && (
        <div className="flex items-center justify-between gap-2 border-t border-av-border bg-black/40 px-3 py-1.5 text-[11px] text-av-muted">
          <span className="truncate font-mono">Crashed @ {multiplier.toFixed(2)}x · seed revealed</span>
          <Link href="/verify" className="shrink-0 font-semibold text-av-pink hover:underline">
            Verify fairness
          </Link>
        </div>
      )}
    </div>
  );
}
