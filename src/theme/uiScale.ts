/** Discrete UI text/button scale steps (FR-15 / NT-9). */
export const UI_SCALE_STEPS = [0.85, 1, 1.15, 1.3] as const;

export type UiScaleStep = (typeof UI_SCALE_STEPS)[number];

export const UI_SCALE_LABELS: Record<UiScaleStep, string> = {
  0.85: 'Small',
  1: 'Default',
  1.15: 'Large',
  1.3: 'Extra large',
};

export const DEFAULT_UI_SCALE: UiScaleStep = 1;

export function clampUiScale(value: number): UiScaleStep {
  let best: UiScaleStep = DEFAULT_UI_SCALE;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const step of UI_SCALE_STEPS) {
    const dist = Math.abs(step - value);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

export function stepUiScale(current: number, delta: -1 | 1): UiScaleStep {
  const clamped = clampUiScale(current);
  const idx = UI_SCALE_STEPS.indexOf(clamped);
  const next = Math.max(0, Math.min(UI_SCALE_STEPS.length - 1, idx + delta));
  return UI_SCALE_STEPS[next]!;
}

/** Round scaled sizes so layout stays crisp on Android. */
export function scaleSize(n: number, scale: number): number {
  return Math.round(n * scale * 10) / 10;
}

export type ScaleFn = (n: number) => number;
