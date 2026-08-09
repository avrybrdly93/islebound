import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createSpring,
  createSpring3,
  omegaForSettleTime,
  springValueAt,
  springVelocityAt,
  stepSpring,
  stepSpring3,
} from '@core/math/spring';

/**
 * BL-004 acceptance criterion 3: **the spring implementation is
 * framerate-independent at fixed dt, verified against an analytic solution.**
 *
 * Both halves are checked here, and the second is what gives the first its
 * teeth. "Framerate-independent" alone is satisfiable by a broken integrator
 * that is consistently broken; agreeing with the closed form as well is what
 * says the shared answer is the *right* one.
 */

const OMEGA = 12;

/** Runs `steps` fixed steps of `dt` and returns the state. */
function run(
  value: number,
  velocity: number,
  target: number,
  dt: number,
  steps: number,
): { value: number; velocity: number } {
  const spring = createSpring(value, velocity);
  for (let i = 0; i < steps; i++) stepSpring(spring, target, OMEGA, dt);
  return spring;
}

describe('stepSpring is framerate-independent', () => {
  it('agrees across 30 Hz, 60 Hz, 144 Hz and a single jump over the same second', () => {
    // The four ways a real build reaches t = 1 s: the fixed simulation rate,
    // and three render-side rates a smoothed follow could be driven at.
    const rates = [30, 60, 144];
    const single = run(10, 0, 0, 1, 1);

    for (const hz of rates) {
      const stepped = run(10, 0, 0, 1 / hz, hz);
      assert.ok(
        Math.abs(stepped.value - single.value) < 1e-12,
        `at ${hz} Hz the value was ${stepped.value}, against ${single.value} in one step`,
      );
      assert.ok(
        Math.abs(stepped.velocity - single.velocity) < 1e-12,
        `at ${hz} Hz the velocity was ${stepped.velocity}, against ${single.velocity}`,
      );
    }
  });

  it('holds from a non-zero starting velocity, which is the harder case', () => {
    // A spring already moving is where an integrator that fudges the velocity
    // update diverges first: the position error is second order in dt and easy
    // to miss, the velocity error is first order.
    const single = run(4, -7, 1, 0.5, 1);
    const stepped = run(4, -7, 1, 0.5 / 90, 90);
    assert.ok(Math.abs(stepped.value - single.value) < 1e-12);
    assert.ok(Math.abs(stepped.velocity - single.velocity) < 1e-12);
  });

  it('is unconditionally stable at a step far beyond an explicit scheme s limit', () => {
    // An explicit integrator diverges above dt ≈ 2/ω; at ω = 12 that is 0.17 s,
    // which a single dropped frame exceeds. One 10-second step must still land
    // on the target rather than exploding.
    const spring = createSpring(100, 500);
    stepSpring(spring, 0, OMEGA, 10);
    assert.ok(Number.isFinite(spring.value));
    assert.ok(Math.abs(spring.value) < 1e-6, `value blew up to ${spring.value}`);
  });
});

describe('stepSpring matches the analytic solution', () => {
  it('reproduces x(t) = target + (d₀ + (v₀ + ω d₀)t)e^{-ωt} at several times', () => {
    for (const t of [0.05, 0.25, 1, 3]) {
      const stepped = run(10, -3, 2, 1 / 120, Math.round(t * 120));
      const analyticValue = springValueAt(10, -3, 2, OMEGA, t);
      const analyticVelocity = springVelocityAt(10, -3, 2, OMEGA, t);
      assert.ok(
        Math.abs(stepped.value - analyticValue) < 1e-12,
        `at t=${t}s stepping gave ${stepped.value}, the closed form ${analyticValue}`,
      );
      assert.ok(Math.abs(stepped.velocity - analyticVelocity) < 1e-12);
    }
  });

  it('never overshoots, which is what critical damping buys', () => {
    // From 10 towards 0 with no initial velocity, the value must decrease
    // monotonically and never cross. An underdamped spring fails here, and an
    // underdamped camera is the artefact this module exists to rule out.
    const spring = createSpring(10, 0);
    let previous = spring.value;
    for (let i = 0; i < 300; i++) {
      stepSpring(spring, 0, OMEGA, 1 / 30);
      assert.ok(spring.value >= 0, `crossed the target to ${spring.value} at step ${i}`);
      assert.ok(spring.value <= previous, `rose from ${previous} to ${spring.value}`);
      previous = spring.value;
    }
  });

  it('holds a spring already at rest on its target exactly still', () => {
    const spring = createSpring(5, 0);
    for (let i = 0; i < 100; i++) stepSpring(spring, 5, OMEGA, 1 / 30);
    assert.equal(spring.value, 5);
    assert.equal(spring.velocity, 0);
  });
});

describe('stepSpring edge cases', () => {
  it('treats a non-positive dt as a no-op', () => {
    const spring = createSpring(3, 1);
    stepSpring(spring, 0, OMEGA, 0);
    stepSpring(spring, 0, OMEGA, -1);
    assert.equal(spring.value, 3);
    assert.equal(spring.velocity, 1);
  });

  it('treats a non-positive omega as a no-op rather than dividing by it', () => {
    const spring = createSpring(3, 1);
    stepSpring(spring, 0, 0, 1 / 30);
    assert.equal(spring.value, 3);
  });

  it('returns the same object it was given, so callers can chain', () => {
    const spring = createSpring(1);
    assert.equal(stepSpring(spring, 0, OMEGA, 1 / 30), spring);
  });
});

describe('omegaForSettleTime', () => {
  it('leaves about 1% of the displacement after the requested time', () => {
    for (const seconds of [0.1, 0.33, 1, 2.5]) {
      const omega = omegaForSettleTime(seconds);
      const remaining = Math.abs(springValueAt(1, 0, 0, omega, seconds));
      assert.ok(
        remaining > 0.008 && remaining < 0.012,
        `after ${seconds}s, ${(remaining * 100).toFixed(2)}% remained, not about 1%`,
      );
    }
  });

  it('returns Infinity for a non-positive settle time', () => {
    assert.equal(omegaForSettleTime(0), Infinity);
    assert.equal(omegaForSettleTime(-1), Infinity);
  });
});

describe('stepSpring3', () => {
  it('is exactly three independent stepSpring calls', () => {
    // Asserted rather than assumed, because "per-axis equals a 3D spring" is
    // only true while the system stays linear — a future max-speed clamp would
    // break it, and this is the test that would notice.
    const three = createSpring3(1, -2, 3.5);
    const x = createSpring(1);
    const y = createSpring(-2);
    const z = createSpring(3.5);

    for (let i = 0; i < 50; i++) {
      stepSpring3(three, 0, 4, -1, OMEGA, 1 / 30);
      stepSpring(x, 0, OMEGA, 1 / 30);
      stepSpring(y, 4, OMEGA, 1 / 30);
      stepSpring(z, -1, OMEGA, 1 / 30);
    }

    assert.equal(three.x.value, x.value);
    assert.equal(three.y.value, y.value);
    assert.equal(three.z.value, z.value);
  });

  it('returns the same object it was given', () => {
    const three = createSpring3();
    assert.equal(stepSpring3(three, 0, 0, 0, OMEGA, 1 / 30), three);
  });
});
