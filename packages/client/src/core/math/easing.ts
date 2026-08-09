import { clamp01 } from '@core/math/scalar';

/**
 * Easing curves (BL-004).
 *
 * Every curve here is a `(t: number) => number` with `f(0) = 0` and
 * `f(1) = 1`, and `easing.test.ts` asserts both for all of them — a curve that
 * misses its endpoints produces a pop at the start or end of an animation,
 * which is the one artefact easing exists to remove.
 *
 * Input is **not** clamped by the individual curves. Clamping in every curve
 * would cost a branch on a function called per element per frame, and the
 * callers that need it (a UI progress arc, `14`'s gather ring) have the
 * clamped `t` already. {@link applyEasing} clamps for the cases that do not.
 *
 * Values outside `[0, 1]` are meaningful for the overshooting curves: `backOut`
 * and `elasticOut` deliberately exceed 1 mid-flight, and anything that feeds
 * one into a colour or an opacity must clamp the *output*, not the input.
 */
export type EasingFn = (t: number) => number;

export const linear: EasingFn = (t) => t;

export const quadIn: EasingFn = (t) => t * t;
export const quadOut: EasingFn = (t) => t * (2 - t);
export const quadInOut: EasingFn = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export const cubicIn: EasingFn = (t) => t * t * t;
export const cubicOut: EasingFn = (t) => {
  const u = t - 1;
  return u * u * u + 1;
};
export const cubicInOut: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 + (t - 1) * (2 * t - 2) * (2 * t - 2);

export const quartOut: EasingFn = (t) => {
  const u = t - 1;
  return 1 - u * u * u * u;
};

export const sineIn: EasingFn = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const sineOut: EasingFn = (t) => Math.sin((t * Math.PI) / 2);
export const sineInOut: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const expoIn: EasingFn = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const expoOut: EasingFn = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const circOut: EasingFn = (t) => Math.sqrt(1 - (t - 1) * (t - 1));

/**
 * Overshoots past 1 and settles back. `1.70158` is the standard constant,
 * chosen so the overshoot is about 10%.
 */
const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;

export const backOut: EasingFn = (t) => {
  const u = t - 1;
  return 1 + BACK_C3 * u * u * u + BACK_C1 * u * u;
};

export const backIn: EasingFn = (t) => BACK_C3 * t * t * t - BACK_C1 * t * t;

/**
 * A decaying oscillation about 1. The endpoint cases are special-cased because
 * the general expression is `0/0`-ish there, not because of rounding.
 */
export const elasticOut: EasingFn = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** The four-segment parabolic bounce. */
export const bounceOut: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

/**
 * The curves, by name.
 *
 * A named table rather than a bare set of exports so content data can carry a
 * curve *name* — content is data (`packages/shared/src/content/`), and a
 * recipe or a UI transition that wants `'cubicOut'` must be able to say so in
 * a JSON-able field without importing a function. `as const satisfies` per
 * `07` §2.3 gives both the precise `EasingName` union and structural checking.
 */
export const EASINGS = {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  quartOut,
  sineIn,
  sineOut,
  sineInOut,
  expoIn,
  expoOut,
  circOut,
  backIn,
  backOut,
  elasticOut,
  bounceOut,
} as const satisfies Record<string, EasingFn>;

/** The name of any curve in {@link EASINGS} — the type a content field uses. */
export type EasingName = keyof typeof EASINGS;

/**
 * Applies a named curve to a `t` that is clamped to `[0, 1]` first.
 *
 * This is the entry point for content-driven easing, and the clamp lives here
 * rather than in the curves for the reason in this file's header. The output
 * is *not* clamped: `backOut` and `elasticOut` overshoot on purpose.
 */
export function applyEasing(name: EasingName, t: number): number {
  return EASINGS[name](clamp01(t));
}
