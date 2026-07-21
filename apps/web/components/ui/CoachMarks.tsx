'use client';

import { useUiStore } from '@/lib/ui-store';

const STEPS = [
  {
    title: 'Place a bet',
    body: 'Pick an amount on Bet 1 or Bet 2 while the round is open. You can queue for the next flight too.',
    hint: 'Step 1 of 3',
  },
  {
    title: 'Watch the orb',
    body: 'The multiplier climbs as the flight continues. Colors heat up as risk rises — cash out anytime.',
    hint: 'Step 2 of 3',
  },
  {
    title: 'Cash out in time',
    body: 'Hit Cash Out before it flies away. Use Auto for a target multiplier, or Focus mode for fewer distractions.',
    hint: 'Step 3 of 3',
  },
];

export function CoachMarks() {
  const coachDone = useUiStore((s) => s.coachDone);
  const coachStep = useUiStore((s) => s.coachStep);
  const advanceCoach = useUiStore((s) => s.advanceCoach);
  const setCoachDone = useUiStore((s) => s.setCoachDone);
  const soundHydrated = useUiStore((s) => s.soundHydrated);

  if (!soundHydrated || coachDone || coachStep >= 3) return null;

  const step = STEPS[coachStep] ?? STEPS[0];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-4 sm:items-center">
      <div className="coach-card w-full max-w-md rounded-2xl border border-av-border bg-av-panel p-5 shadow-glass">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-av-muted">
          {step.hint}
        </div>
        <h2 className="text-lg font-extrabold text-white">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{step.body}</p>
        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i === coachStep ? 'bg-av-red' : i < coachStep ? 'bg-av-green' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1 !py-2.5 text-sm"
            onClick={() => setCoachDone(true)}
          >
            Skip
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !py-2.5 text-sm"
            onClick={() => advanceCoach()}
          >
            {coachStep >= 2 ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
