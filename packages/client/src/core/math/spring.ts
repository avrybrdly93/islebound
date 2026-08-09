/**
 * Critically damped springs (BL-004).
 *
 * `08` §9 names `core/math/spring.ts` as what smooths the third-person camera's
 * spring arm, and `03` lists "smoothed follow" as a Phase 1 exit criterion.
 * This is that module.
 *
 * ## Why critically damped, and why the *exact* solution
 *
 * A spring-damper `ẍ = −ω²(x − target) − 2ζω ẋ` is critically damped at
 * `ζ = 1`: the fastest approach that does not overshoot. Overshoot in a camera
 * reads as seasickness, so `ζ = 1` is the only setting this module offers —
 * an underdamped camera is a bug, not a tuning choice, and leaving `ζ` open
 * would invite one.
 *
 * At `ζ = 1` the ODE has a closed-form solution, and this module **steps by
 * that solution rather than integrating towards it**:
 *
 * $$x(t) = \text{target} + \bigl(d_0 + (v_0 + \omega d_0)\,t\bigr)e^{-\omega t},
 * \qquad d_0 = x_0 - \text{target},$$
 * $$v(t) = \bigl(v_0 - (v_0 + \omega d_0)\,\omega t\bigr)e^{-\omega t}.$$
 *
 * Three consequences, and they are the reason for the choice:
 *
 * 1. **Framerate independence is exact, not approximate.** `n` steps of `dt`
 *    and one step of `n·dt` produce the same state to rounding — asserted in
 *    `spring.test.ts` at 1e-12 over 30 Hz vs 144 Hz vs a single jump. A
 *    semi-implicit Euler spring is only *approximately* rate-independent, and
 *    the error shows up as the camera lagging differently on a fast machine.
 * 2. **It is unconditionally stable.** Any `dt`, however large, lands closer
 *    to the target and never oscillates. An explicit integrator diverges above
 *    `dt ≈ 2/ω`, which for a snappy `ω = 20` is a 100 ms frame — a hitch, not
 *    a hypothetical.
 * 3. **It is testable against an analytic solution**, which is what BL-004's
 *    third acceptance criterion asks for, because it *is* the analytic
 *    solution.
 *
 * ## Moving targets
 *
 * The closed form assumes the target is constant over the step. A camera
 * target moves every tick, so each step solves a *new* initial-value problem
 * from the current state. That is exactly right at the tick rate — the target
 * really is piecewise constant between ticks — and it means a spring chasing a
 * constant-velocity target settles into the usual constant lag rather than
 * catching up, which is the behaviour a spring arm wants.
 *
 * The state is a plain, `structuredClone`-able object per `07` §2.4, so a
 * spring can live in a component.
 */

/** A one-dimensional critically damped spring's mutable state. */
export interface Spring {
  /** Current value. */
  value: number;
  /** Current rate of change, per second. */
  velocity: number;
}

/** Allocates a spring at rest. Call at construction, never in a tick. */
export function createSpring(value = 0, velocity = 0): Spring {
  return { value, velocity };
}

/**
 * Converts a "time to settle" into the angular frequency `ω` the steppers take.
 *
 * A critically damped spring never *exactly* arrives, so "settle time" needs a
 * threshold: this returns the `ω` for which the remaining displacement is
 * about **1%** of the initial after `seconds`. Solving `(1 + ωt)e^{−ωt} = 0.01`
 * gives `ωt ≈ 6.64`.
 *
 * Designers think in "the camera should catch up in a third of a second"; `ω`
 * is what the maths needs. Keeping the conversion here means the constant is
 * written down once, with its threshold stated, instead of being folded into a
 * magic number at each call site.
 */
export function omegaForSettleTime(seconds: number): number {
  if (!(seconds > 0)) return Infinity;
  return 6.638 / seconds;
}

/**
 * Advances a spring by `dt` seconds towards `target`, in place.
 *
 * `omega` is the angular frequency in rad/s — larger is snappier. See
 * {@link omegaForSettleTime} to get one from a settle time.
 *
 * A non-positive `dt` is a no-op rather than an error: a paused frame, a
 * clamped tab-switch delta (`04` §4.1) and a double-call in one tick all
 * produce one, and none of them is a bug worth throwing over.
 */
export function stepSpring(spring: Spring, target: number, omega: number, dt: number): Spring {
  if (dt <= 0 || omega <= 0) return spring;

  const displacement = spring.value - target;
  const combined = spring.velocity + omega * displacement;
  const decay = Math.exp(-omega * dt);

  spring.value = target + (displacement + combined * dt) * decay;
  spring.velocity = (spring.velocity - combined * omega * dt) * decay;
  return spring;
}

/**
 * The closed-form value of a critically damped spring after `t` seconds.
 *
 * Exported because it is the reference `spring.test.ts` checks {@link stepSpring}
 * against, and a reference that lives only in a test file is a reference the
 * next module cannot reuse. It is the same algebra, evaluated in one jump
 * rather than accumulated — so the test is checking that stepping composes,
 * which is the property that could actually break, rather than checking a
 * formula against itself.
 */
export function springValueAt(
  initialValue: number,
  initialVelocity: number,
  target: number,
  omega: number,
  t: number,
): number {
  const displacement = initialValue - target;
  const combined = initialVelocity + omega * displacement;
  return target + (displacement + combined * t) * Math.exp(-omega * t);
}

/** The closed-form velocity of a critically damped spring after `t` seconds. */
export function springVelocityAt(
  initialValue: number,
  initialVelocity: number,
  target: number,
  omega: number,
  t: number,
): number {
  const displacement = initialValue - target;
  const combined = initialVelocity + omega * displacement;
  return (initialVelocity - combined * omega * t) * Math.exp(-omega * t);
}

/** Three independent springs, for a position or a colour. Plain and serialisable. */
export interface Spring3 {
  x: Spring;
  y: Spring;
  z: Spring;
}

/** Allocates three springs at rest. Call at construction, never in a tick. */
export function createSpring3(x = 0, y = 0, z = 0): Spring3 {
  return { x: createSpring(x), y: createSpring(y), z: createSpring(z) };
}

/**
 * Advances three springs towards a target, in place and without allocating.
 *
 * Per-axis rather than a true 3D spring on the displacement vector: the two
 * agree exactly for a critically damped spring, because the ODE is linear and
 * separable in the axes, so the simpler form is not an approximation. Where
 * they would differ — a spring with a maximum speed, or a rest length — this
 * module has neither.
 */
export function stepSpring3(
  spring: Spring3,
  targetX: number,
  targetY: number,
  targetZ: number,
  omega: number,
  dt: number,
): Spring3 {
  stepSpring(spring.x, targetX, omega, dt);
  stepSpring(spring.y, targetY, omega, dt);
  stepSpring(spring.z, targetZ, omega, dt);
  return spring;
}
