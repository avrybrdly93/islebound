/**
 * Scalar maths (BL-004).
 *
 * Every function here is pure and allocation-free: scalars in, a scalar out.
 * `core/math/*` is imported by `sim/`, which `04` §4.2 requires to be
 * deterministic, so nothing here reads a clock, a global, or `Math.random`.
 */

/** τ = 2π. Turns read better than half-turns when the domain is "one rotation". */
export const TAU = Math.PI * 2;

/** Multiply degrees by this to get radians. */
export const DEG_TO_RAD = Math.PI / 180;

/** Multiply radians by this to get degrees. */
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Default tolerance for {@link approximately}: about 4096 ULP at 1.0.
 *
 * Deliberately much looser than `Number.EPSILON`. Comparing two floats that
 * came out of different arithmetic paths at `Number.EPSILON` is a test that
 * fails on a compiler's mood; comparing them at `1e-12` is a test that fails
 * when the maths is wrong.
 */
export const EPSILON = 1e-12;

/** `a` when `t = 0`, `b` when `t = 1`, linear between, extrapolating outside. */
export function lerp(a: number, b: number, t: number): number {
  // a + (b - a) * t rather than (1 - t) * a + t * b: the first is exact at
  // t = 0 and the second is exact at t = 1, and hitting the *start* value
  // exactly matters more here, since t = 0 is the every-frame case for an
  // animation that has not begun.
  return a + (b - a) * t;
}

/**
 * The `t` that would make `lerp(a, b, t)` return `value`.
 *
 * Returns 0 for a degenerate range rather than `NaN` or `Infinity`: a
 * zero-width range means "the whole range is at `a`", and the caller — a
 * progress bar, a gradient stop — wants a usable number. The choice of 0 over
 * 1 is arbitrary and only observable in that degenerate case.
 */
export function inverseLerp(a: number, b: number, value: number): number {
  const span = b - a;
  return span === 0 ? 0 : (value - a) / span;
}

/** `value` restricted to `[min, max]`. Assumes `min <= max`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** `value` restricted to `[0, 1]`. */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Hermite `3t² − 2t³` over `[edge0, edge1]`, clamped outside.
 *
 * Continuous in the first derivative at both ends, which is what makes it the
 * right blend for the cases `12` §islandMask and `13` §triplanar use it for:
 * a linear ramp leaves a visible crease where it meets the flat region.
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Ken Perlin's `6t⁵ − 15t⁴ + 10t³`, continuous in the *second* derivative too.
 *
 * Use where the blend drives something whose acceleration is visible — a
 * camera move, a fog density — and {@link smoothstep} where it drives a
 * texture weight, since the extra continuity costs two multiplies for a
 * difference nobody can see in a blend factor.
 */
export function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Steps `current` towards `target` by at most `maxDelta`, never overshooting.
 *
 * `11` §player-controller specifies this rather than exponential smoothing for
 * acceleration, and the reason is the "never overshooting" clause: the
 * approach is linear and it *arrives*, in a number of ticks the designer can
 * compute. {@link damp} approaches asymptotically and never arrives, which is
 * right for a camera and wrong for a control response.
 *
 * A negative `maxDelta` is treated as zero rather than moving away from the
 * target, which is the only reading that keeps "never overshoots" true.
 */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (delta === 0 || maxDelta <= 0) return current;
  const step = delta > 0 ? Math.min(delta, maxDelta) : Math.max(delta, -maxDelta);
  return current + step;
}

/**
 * Framerate-independent exponential smoothing: the exact solution of
 * `ẋ = λ(target − x)` after `dt`.
 *
 * $$x(t + \Delta t) = \text{target} + (x - \text{target})\,e^{-\lambda\Delta t}$$
 *
 * **This is the function that the naive `x += (target − x) * 0.1` is trying to
 * be, and the difference is not cosmetic.** The naive form's smoothing rate
 * depends on how often it is called, so the same code settles at one speed at
 * 30 Hz and another at 144 Hz — and this project renders at a variable rate
 * over a fixed 30 Hz simulation (`04` §4.1), so *both* rates occur in one
 * build. Because the exponential is exact, `n` steps of `dt` and one step of
 * `n·dt` give the same answer to rounding, which is what `spring.test.ts`
 * asserts for the same reason.
 *
 * `lambda` is a rate in inverse seconds; the value reaches `1 − 1/e ≈ 63%` of
 * the way to the target in `1/lambda` seconds.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Whether two numbers agree to within `tolerance` in absolute terms. */
export function approximately(a: number, b: number, tolerance = EPSILON): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Wraps an angle in radians into `(−π, π]`.
 *
 * The half-open interval is deliberate: an angle of exactly `π` stays `π`
 * rather than flipping to `−π`, so a value that is already wrapped is a fixed
 * point of this function and repeated application cannot make it oscillate.
 */
export function wrapAngle(radians: number): number {
  const wrapped = radians % TAU;
  if (wrapped > Math.PI) return wrapped - TAU;
  if (wrapped <= -Math.PI) return wrapped + TAU;
  return wrapped;
}

/**
 * The shortest signed angular distance from `from` to `to`, in `(−π, π]`.
 *
 * The reason this exists rather than `to - from`: a heading crossing the ±π
 * seam otherwise produces a difference of nearly a full turn, and anything
 * that then interpolates over it spins the long way round.
 */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** {@link lerp} along the shorter arc between two angles, result wrapped. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + angleDelta(from, to) * t);
}
