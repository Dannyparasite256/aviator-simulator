'use client';

import { useEffect, useState } from 'react';
import { useUiStore } from '@/lib/ui-store';

/** Lightweight DOM confetti for cash-out wins */
export function ConfettiBurst() {
  const toasts = useUiStore((s) => s.toasts);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const [pieces, setPieces] = useState<
    Array<{ id: string; left: number; delay: number; color: string; rot: number }>
  >([]);

  useEffect(() => {
    if (reducedMotion) return;
    const win = toasts.find((t) => t.kind === 'win');
    if (!win) return;
    const colors = ['#28a909', '#f5a623', '#ff2d55', '#7dd3fc', '#ffffff'];
    const next = Array.from({ length: 28 }, (_, i) => ({
      id: `${win.id}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      color: colors[i % colors.length],
      rot: Math.random() * 360,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 1600);
    return () => clearTimeout(t);
  }, [toasts, reducedMotion]);

  if (!pieces.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[75] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
