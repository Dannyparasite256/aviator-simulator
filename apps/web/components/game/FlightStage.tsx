'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PixiCanvas } from '@/components/game/PixiCanvas';
import { useGameStore } from '@/lib/game-store';
import { useUiStore } from '@/lib/ui-store';
import Link from 'next/link';
import { playSfx } from '@/lib/sound';

const PHASE_LABEL: Record<string, string> = {
  WAITING: 'Betting open',
  COUNTDOWN: 'Starting',
  FLYING: 'In flight',
  CRASHED: 'Crashed',
};

export function FlightStage({ compact = false }: { compact?: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const predicted = useGameStore((s) => s.predictedMultiplier);
  const countdownRemainingMs = useGameStore((s) => s.countdownRemainingMs);
  const serverSeed = useGameStore((s) => s.serverSeed);
  const debugMode = useGameStore((s) => s.debugMode);
  const crashPoint = useGameStore((s) => s.crashPoint);
  const connected = useGameStore((s) => s.connected);
  const reconnecting = useUiStore((s) => s.reconnecting);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const colorTheme = useUiStore((s) => s.colorTheme);

  const [displayMult, setDisplayMult] = useState(1);
  const [flyAwayPulse, setFlyAwayPulse] = useState(false);
  const [seedPulse, setSeedPulse] = useState(false);
  const [shakeCss, setShakeCss] = useState(false);
  const prevCdSec = useRef<number | null>(null);
  const smoothRef = useRef(1);

  // Smooth multiplier display (eases between server ticks)
  useEffect(() => {
    if (phase !== 'FLYING') {
      smoothRef.current = multiplier;
      setDisplayMult(multiplier);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const target = predicted();
      const k = reducedMotion ? 18 : 12;
      const t = 1 - Math.exp(-k * (dt / 1000));
      smoothRef.current = smoothRef.current + (target - smoothRef.current) * t;
      setDisplayMult(smoothRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, predicted, multiplier, reducedMotion]);

  useEffect(() => {
    if (phase === 'CRASHED') {
      setFlyAwayPulse(true);
      setSeedPulse(true);
      if (!reducedMotion) setShakeCss(true);
      const t = setTimeout(() => setFlyAwayPulse(false), 900);
      const t2 = setTimeout(() => setShakeCss(false), 320);
      const t3 = setTimeout(() => setSeedPulse(false), 2400);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [phase, crashPoint, reducedMotion]);

  useEffect(() => {
    if (phase !== 'COUNTDOWN') {
      prevCdSec.current = null;
      return;
    }
    const sec = Math.ceil(countdownRemainingMs / 1000);
    if (prevCdSec.current != null && sec !== prevCdSec.current && sec > 0 && sec <= 5) {
      playSfx('countdown');
    }
    prevCdSec.current = sec;
  }, [phase, countdownRemainingMs]);

  const shown = phase === 'FLYING' ? displayMult : multiplier;
  const cdSec = Math.ceil(countdownRemainingMs / 1000);
  const showBigCd = phase === 'COUNTDOWN' && cdSec >= 1 && cdSec <= 5;

  const multColor = useMemo(() => {
    if (phase === 'CRASHED') return 'text-av-red';
    if (phase !== 'FLYING') return 'text-white/90';
    if (shown >= 10) return 'text-av-red';
    if (shown >= 5) return 'text-av-gold';
    if (shown >= 2) return 'text-av-pink';
    return 'text-white';
  }, [phase, shown]);

  const multScale =
    phase === 'FLYING'
      ? 1 + Math.min(0.1, Math.log(Math.max(1, shown)) * 0.035)
      : phase === 'CRASHED'
        ? 1.04
        : 1;

  const glowClass =
    phase === 'FLYING'
      ? shown >= 10
        ? 'drop-shadow-[0_0_28px_rgba(227,28,61,0.55)]'
        : shown >= 5
          ? 'drop-shadow-[0_0_24px_rgba(245,166,35,0.45)]'
          : shown >= 2
            ? 'drop-shadow-[0_0_20px_rgba(255,45,85,0.4)]'
            : 'drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]'
      : 'drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]';

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-av-border stage-shell theme-${colorTheme} ${
        shakeCss ? 'stage-shake' : ''
      }`}
      data-coach="stage"
    >
      <div
        className={`relative min-h-0 flex-1 ${
          compact ? '' : 'min-h-[240px] sm:min-h-[300px] md:min-h-[380px]'
        }`}
      >
        <PixiCanvas />

        {phase === 'CRASHED' && (
          <>
            <div
              className={`pointer-events-none absolute inset-0 z-10 bg-av-red/20 transition-opacity duration-500 ${
                flyAwayPulse ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              className={`pointer-events-none absolute inset-0 z-10 crash-vignette transition-opacity duration-500 ${
                flyAwayPulse ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        )}

        <div className="absolute left-1/2 top-1.5 z-30 -translate-x-1/2 sm:top-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-md sm:px-2.5 sm:py-1 sm:text-[10px] ${
              phase === 'FLYING'
                ? 'border-av-pink/40 bg-av-pink/15 text-av-pink'
                : phase === 'CRASHED'
                  ? 'border-av-red/40 bg-av-red/15 text-av-red'
                  : phase === 'COUNTDOWN'
                    ? 'border-av-gold/40 bg-av-gold/15 text-av-gold'
                    : 'border-av-green/40 bg-av-green/15 text-av-green'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                phase === 'FLYING'
                  ? 'animate-pulse bg-av-pink'
                  : phase === 'CRASHED'
                    ? 'bg-av-red'
                    : phase === 'COUNTDOWN'
                      ? 'animate-pulse bg-av-gold'
                      : 'bg-av-green'
              }`}
            />
            {PHASE_LABEL[phase] ?? phase}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          {showBigCd && (
            <div
              key={cdSec}
              className={`mb-0.5 font-mono text-5xl font-black tabular-nums text-white/90 sm:text-6xl md:text-7xl ${
                reducedMotion ? '' : 'countdown-pop'
              }`}
            >
              {cdSec}
            </div>
          )}

          {phase === 'COUNTDOWN' && !showBigCd && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-av-muted sm:text-sm">
              Starting soon…
            </div>
          )}
          {phase === 'WAITING' && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-av-muted sm:text-sm">
              Place your bets
            </div>
          )}
          {phase === 'CRASHED' && (
            <div
              className={`mb-0.5 text-sm font-extrabold uppercase tracking-[0.2em] text-av-red sm:text-base ${
                flyAwayPulse && !reducedMotion ? 'scale-110' : 'scale-100'
              } transition-transform duration-300`}
            >
              Flew away!
            </div>
          )}

          <div
            className={`font-mono text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl ${multColor} ${glowClass}`}
            style={{
              transform: `scale(${multScale})`,
              transition: reducedMotion ? undefined : 'transform 80ms linear',
            }}
          >
            {shown.toFixed(2)}x
          </div>

          {phase === 'FLYING' && (
            <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
              <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10 sm:w-28">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-av-pink to-av-red" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-av-pink/90 sm:text-[10px]">
                Live
              </span>
            </div>
          )}
        </div>

        <div className="absolute left-1.5 top-1.5 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur sm:left-2 sm:top-2 sm:px-2 sm:py-1 sm:text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-av-green' : reconnecting ? 'animate-pulse bg-av-gold' : 'bg-av-red'
            }`}
          />
          <span className="text-white/70">
            {connected ? 'OK' : reconnecting ? '…' : 'Off'}
          </span>
        </div>

        {debugMode && crashPoint != null && phase !== 'CRASHED' && (
          <div className="absolute right-2 top-2 z-30 rounded-md bg-av-gold/20 px-2 py-1 text-[10px] font-bold text-av-gold">
            DBG {crashPoint.toFixed(2)}x
          </div>
        )}
      </div>

      {phase === 'CRASHED' && serverSeed && (
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-t border-av-border bg-black/40 px-2 py-1 text-[10px] text-av-muted sm:px-3 sm:text-[11px] ${
            seedPulse ? 'fairness-unlock' : ''
          }`}
        >
          <span className="flex min-w-0 items-center gap-1 truncate font-mono">
            <span className={seedPulse ? 'seed-lock-pulse' : ''}>🔓</span>
            @{multiplier.toFixed(2)}x · seed
          </span>
          <Link href="/verify" className="shrink-0 font-semibold text-av-pink hover:underline">
            Verify
          </Link>
        </div>
      )}
    </div>
  );
}
