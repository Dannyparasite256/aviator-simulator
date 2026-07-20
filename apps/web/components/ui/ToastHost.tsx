'use client';

import { useUiStore } from '@/lib/ui-store';

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[80] flex w-[min(100%-1.5rem,320px)] flex-col gap-2 sm:top-20">
      {toasts.map((t) => {
        const border =
          t.kind === 'win'
            ? 'border-av-green/50 bg-[#0f1a0c]'
            : t.kind === 'crash'
              ? 'border-av-red/50 bg-[#1a0c10]'
              : t.kind === 'error'
                ? 'border-av-red/40 bg-[#1a0c10]'
                : 'border-av-border bg-av-panel';
        const titleColor =
          t.kind === 'win' ? 'text-av-green' : t.kind === 'crash' ? 'text-av-red' : 'text-white';
        return (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto rounded-xl border px-3 py-2.5 shadow-bet ${border}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className={`text-sm font-bold ${titleColor}`}>{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-white/60">{t.body}</div>}
              </div>
              <button
                type="button"
                className="text-xs text-white/40 hover:text-white"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
