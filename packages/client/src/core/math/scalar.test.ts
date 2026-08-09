import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEG_TO_RAD,
  RAD_TO_DEG,
  TAU,
  angleDelta,
  approximately,
  clamp,
  clamp01,
  damp,
  inverseLerp,
  lerp,
  lerpAngle,
  moveTowards,
  smootherstep,
  smoothstep,
  wrapAngle,
} from '@core/math/scalar';

const CLOSE = 1e-12;

describe('lerp and inverseLerp', () => {
  it('hits both endpoints exactly', () => {
    // Exactly, not approximately: an animation that starts at 0.0000001 of the
    // way in is a pop, and `a + (b - a) * t` is exact at t = 0 by construction.
    assert.equal(lerp(3, 9, 0), 3);
    assert.equal(lerp(3, 9, 1), 9);
  });

  it('interpolates and extrapolates', () => {
    assert.equal(lerp(0, 10, 0.25), 2.5);
    assert.equal(lerp(0, 10, 2), 20);
    assert.equal(lerp(0, 10, -1), -10);
  });

  it('inverts lerp', () => {
    assert.equal(inverseLerp(3, 9, 6), 0.5);
    assert.equal(inverseLerp(3, 9, 3), 0);
    assert.equal(inverseLerp(3, 9, 9), 1);
  });

  it('returns 0 rather than NaN for a zero-width range', () => {
    // The degenerate case is reached by real callers (a progress bar whose
    // total is still zero), and NaN there propagates into a transform.
    assert.equal(inverseLerp(5, 5, 5), 0);
    assert.equal(inverseLerp(5, 5, 99), 0);
  });
});

describe('clamp', () => {
  it('bounds on both sides and passes the interior through', () => {
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(4, 0, 10), 4);
    assert.equal(clamp01(-0.5), 0);
    assert.equal(clamp01(1.5), 1);
    assert.equal(clamp01(0.25), 0.25);
  });

  it('leaves the bounds themselves untouched', () => {
    assert.equal(clamp(0, 0, 10), 0);
    assert.equal(clamp(10, 0, 10), 10);
  });
});

describe('smoothstep and smootherstep', () => {
  it('are 0 and 1 at the edges and 0.5 in the middle', () => {
    for (const f of [smoothstep, smootherstep]) {
      assert.equal(f(0, 1, 0), 0);
      assert.equal(f(0, 1, 1), 1);
      assert.ok(approximately(f(0, 1, 0.5), 0.5, CLOSE));
    }
  });

  it('clamp outside the edges', () => {
    assert.equal(smoothstep(2, 4, 1), 0);
    assert.equal(smoothstep(2, 4, 9), 1);
    assert.equal(smootherstep(2, 4, 1), 0);
    assert.equal(smootherstep(2, 4, 9), 1);
  });

  it('are monotonic', () => {
    let previousSmooth = -1;
    let previousSmoother = -1;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const a = smoothstep(0, 1, t);
      const b = smootherstep(0, 1, t);
      assert.ok(a >= previousSmooth, `smoothstep fell at t=${t}`);
      assert.ok(b >= previousSmoother, `smootherstep fell at t=${t}`);
      previousSmooth = a;
      previousSmoother = b;
    }
  });

  it('have zero slope at both edges, which is the point of using them', () => {
    const h = 1e-6;
    assert.ok(smoothstep(0, 1, h) / h < 0.01, 'smoothstep starts with a visible slope');
    assert.ok((1 - smoothstep(0, 1, 1 - h)) / h < 0.01, 'smoothstep ends with a visible slope');
  });
});

describe('moveTowards', () => {
  it('never overshoots in either direction', () => {
    assert.equal(moveTowards(0, 10, 3), 3);
    assert.equal(moveTowards(0, 10, 30), 10);
    assert.equal(moveTowards(10, 0, 30), 0);
    assert.equal(moveTowards(10, 0, 3), 7);
  });

  it('arrives, unlike an asymptotic approach', () => {
    let value = 0;
    for (let i = 0; i < 5; i++) value = moveTowards(value, 1, 0.25);
    assert.equal(value, 1);
  });

  it('treats a non-positive maxDelta as "do not move"', () => {
    // Not "move away": the never-overshoots contract is only coherent if a
    // negative budget means no movement.
    assert.equal(moveTowards(4, 10, 0), 4);
    assert.equal(moveTowards(4, 10, -5), 4);
  });

  it('is a no-op when already at the target', () => {
    assert.equal(moveTowards(7, 7, 100), 7);
  });
});

describe('damp', () => {
  it('is framerate-independent: n small steps equal one big one', () => {
    // The property the naive `x += (target - x) * k` does not have, and the
    // reason this function exists at all.
    const single = damp(10, 0, 3, 1);
    let stepped = 10;
    for (let i = 0; i < 144; i++) stepped = damp(stepped, 0, 3, 1 / 144);
    assert.ok(
      Math.abs(stepped - single) < 1e-12,
      `144 steps gave ${stepped}, one step gave ${single}`,
    );
  });

  it('reaches 1 - 1/e of the way in one time constant', () => {
    const value = damp(1, 0, 1, 1);
    assert.ok(approximately(value, 1 / Math.E, 1e-12));
  });

  it('does not move at dt = 0 and lands on the target as dt grows', () => {
    assert.equal(damp(5, 0, 3, 0), 5);
    assert.ok(Math.abs(damp(5, 0, 3, 100)) < 1e-100);
  });
});

describe('angles', () => {
  it('wrap into (-π, π]', () => {
    assert.ok(approximately(wrapAngle(0), 0, CLOSE));
    assert.ok(approximately(wrapAngle(TAU), 0, CLOSE));
    assert.ok(approximately(wrapAngle(Math.PI), Math.PI, CLOSE));
    assert.ok(approximately(wrapAngle(-Math.PI), Math.PI, CLOSE));
    assert.ok(approximately(wrapAngle(Math.PI + 0.1 - TAU), -Math.PI + 0.1, CLOSE));
  });

  it('are a fixed point once wrapped, so repeated wrapping cannot oscillate', () => {
    for (const a of [-3, -1, 0, 1, 3, Math.PI]) {
      assert.equal(wrapAngle(wrapAngle(a)), wrapAngle(a));
    }
  });

  it('take the short way across the seam', () => {
    // The case that motivates the function: 179° to -179° is 2°, not -358°.
    const from = (179 * Math.PI) / 180;
    const to = (-179 * Math.PI) / 180;
    assert.ok(approximately(angleDelta(from, to), (2 * Math.PI) / 180, 1e-12));
  });

  it('lerp along the short arc', () => {
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const mid = lerpAngle(from, to, 0.5);
    assert.ok(approximately(Math.abs(mid), Math.PI, 1e-12), `midpoint was ${mid}`);
  });

  it('convert between degrees and radians', () => {
    assert.ok(approximately(180 * DEG_TO_RAD, Math.PI, CLOSE));
    assert.ok(approximately(Math.PI * RAD_TO_DEG, 180, 1e-12));
  });
});

describe('approximately', () => {
  it('uses an absolute tolerance, defaulting to a loose one', () => {
    assert.ok(approximately(1, 1 + 1e-13));
    assert.ok(!approximately(1, 1.001));
    assert.ok(approximately(1, 1.001, 0.01));
  });
});
