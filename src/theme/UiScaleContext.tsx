import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import {
  clampUiScale,
  DEFAULT_UI_SCALE,
  scaleSize,
  stepUiScale,
  UI_SCALE_LABELS,
  type ScaleFn,
  type UiScaleStep,
} from '@/theme/uiScale';
import { loadUiScale, saveUiScale } from '@/services/settings';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

type UiScaleContextValue = {
  scale: UiScaleStep;
  label: string;
  s: ScaleFn;
  canDecrease: boolean;
  canIncrease: boolean;
  decrease: () => void;
  increase: () => void;
  setScale: (next: UiScaleStep) => void;
  ready: boolean;
};

const SCALE_STYLE_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'minHeight',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
]);

const UiScaleContext = createContext<UiScaleContextValue | null>(null);

function scaleFlatStyle(
  style: Record<string, unknown>,
  scale: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...style };
  for (const key of SCALE_STYLE_KEYS) {
    const value = next[key];
    if (typeof value === 'number') {
      next[key] = scaleSize(value, scale);
    }
  }
  return next;
}

export function UiScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<UiScaleStep>(DEFAULT_UI_SCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadUiScale();
        if (!cancelled) setScaleState(stored);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: UiScaleStep) => {
    setScaleState(next);
    void saveUiScale(next);
  }, []);

  const value = useMemo<UiScaleContextValue>(() => {
    const s: ScaleFn = (n) => scaleSize(n, scale);
    return {
      scale,
      label: UI_SCALE_LABELS[scale],
      s,
      canDecrease: scale > 0.85,
      canIncrease: scale < 1.3,
      decrease: () => persist(stepUiScale(scale, -1)),
      increase: () => persist(stepUiScale(scale, 1)),
      setScale: (next) => persist(clampUiScale(next)),
      ready,
    };
  }, [persist, ready, scale]);

  return <UiScaleContext.Provider value={value}>{children}</UiScaleContext.Provider>;
}

export function useUiScale(): UiScaleContextValue {
  const ctx = useContext(UiScaleContext);
  if (!ctx) {
    throw new Error('useUiScale must be used within UiScaleProvider');
  }
  return ctx;
}

/**
 * Build StyleSheet values that react to the current UI scale.
 * Pass a stable factory (module-level function) that receives `s`.
 */
export function useScaledStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (s: ScaleFn) => T,
): T {
  const { s, scale } = useUiScale();
  return useMemo(() => StyleSheet.create(factory(s)) as T, [factory, s, scale]);
}

/**
 * Re-scale font/button-related keys from an existing StyleSheet.create result.
 * Keeps screen diffs small: `const styles = useAutoScaledStyles(baseStyles)`.
 */
export function useAutoScaledStyles<T extends Record<string, unknown>>(sheet: T): T {
  const { scale } = useUiScale();
  return useMemo(() => {
    if (scale === 1) return sheet;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(sheet)) {
      const flat = StyleSheet.flatten(sheet[key] as object);
      if (!flat || typeof flat !== 'object') {
        out[key] = flat;
        continue;
      }
      out[key] = scaleFlatStyle(flat as Record<string, unknown>, scale);
    }
    return out as T;
  }, [sheet, scale]);
}
