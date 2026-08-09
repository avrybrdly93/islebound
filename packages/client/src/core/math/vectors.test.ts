import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  V2_ONE,
  V2_ZERO,
  add2,
  addScaled2,
  clampLength2,
  copy2,
  cross2,
  distance2,
  distanceSq2,
  dot2,
  equalsApprox2,
  isFinite2,
  length2,
  lengthSq2,
  lerpV2,
  moveTowardsV2,
  negate2,
  normalize2,
  perp2,
  rotate2,
  scale2,
  set2,
  sub2,
  v2,
} from '@core/math/vec2';
import {
  V3_FORWARD,
  V3_ONE,
  V3_RIGHT,
  V3_UP,
  V3_ZERO,
  add,
  addScaled,
  clampLength,
  copy,
  cross,
  distance,
  distanceSq,
  dot,
  equalsApprox,
  isFinite3,
  length,
  lengthSq,
  lerpV3,
  max,
  min,
  moveTowardsV3,
  mul,
  negate,
  normalize,
  reflect,
  scale,
  set,
  slerpDirection,
  sub,
  v3,
} from '@core/math/vec3';

const CLOSE = 1e-12;

describe('vec3 basics', () => {
  it('constructs, sets and copies', () => {
    assert.deepEqual(v3(), { x: 0, y: 0, z: 0 });
    assert.deepEqual(v3(1, 2, 3), { x: 1, y: 2, z: 3 });
    assert.deepEqual(set(v3(), 4, 5, 6), { x: 4, y: 5, z: 6 });
    assert.deepEqual(copy(v3(), v3(7, 8, 9)), { x: 7, y: 8, z: 9 });
  });

  it('is structuredClone-round-trippable, which components require', () => {
    // `07` §2.4: if structuredClone loses information, the type is wrong for a
    // component. A class-based vector would fail this.
    const original = v3(1.5, -2.5, 3.5);
    assert.deepEqual(structuredClone(original), original);
  });

  it('exposes frozen constants', () => {
    assert.deepEqual(V3_ZERO, { x: 0, y: 0, z: 0 });
    assert.deepEqual(V3_ONE, { x: 1, y: 1, z: 1 });
    assert.deepEqual(V3_UP, { x: 0, y: 1, z: 0 });
    assert.deepEqual(V3_RIGHT, { x: 1, y: 0, z: 0 });
    assert.deepEqual(V3_FORWARD, { x: 0, y: 0, z: -1 });
    assert.ok(Object.isFrozen(V3_ZERO));
  });

  it('adds, subtracts, multiplies, scales and negates', () => {
    const a = v3(1, 2, 3);
    const b = v3(10, 20, 30);
    assert.deepEqual(add(v3(), a, b), { x: 11, y: 22, z: 33 });
    assert.deepEqual(sub(v3(), b, a), { x: 9, y: 18, z: 27 });
    assert.deepEqual(mul(v3(), a, b), { x: 10, y: 40, z: 90 });
    assert.deepEqual(scale(v3(), a, 2), { x: 2, y: 4, z: 6 });
    assert.deepEqual(negate(v3(), a), { x: -1, y: -2, z: -3 });
    assert.deepEqual(addScaled(v3(), a, b, 0.5), { x: 6, y: 12, z: 18 });
  });

  it('returns the out parameter, so results compose', () => {
    const out = v3();
    assert.equal(add(out, v3(1, 1, 1), v3(2, 2, 2)), out);
    assert.deepEqual(scale(out, out, 2), { x: 6, y: 6, z: 6 });
  });
});

describe('vec3 aliasing', () => {
  it('is correct when out is also an input', () => {
    // The contract that lets a caller accumulate without scratch. `cross` is
    // the one that breaks if a component is written before all six are read.
    const a = v3(1, 2, 3);
    add(a, a, v3(1, 1, 1));
    assert.deepEqual(a, { x: 2, y: 3, z: 4 });

    const b = v3(1, 0, 0);
    cross(b, b, v3(0, 1, 0));
    assert.deepEqual(b, { x: 0, y: 0, z: 1 });

    const c = v3(1, 2, 2);
    normalize(c, c);
    assert.ok(equalsApprox(c, v3(1 / 3, 2 / 3, 2 / 3), CLOSE));
  });
});

describe('vec3 products and lengths', () => {
  it('dots', () => {
    assert.equal(dot(v3(1, 2, 3), v3(4, 5, 6)), 32);
    assert.equal(dot(V3_UP, V3_RIGHT), 0);
  });

  it('crosses right-handed', () => {
    assert.deepEqual(cross(v3(), V3_RIGHT, V3_UP), { x: 0, y: 0, z: 1 });
    assert.deepEqual(cross(v3(), V3_UP, V3_RIGHT), { x: 0, y: 0, z: -1 });
  });

  it('measures length and distance', () => {
    assert.equal(lengthSq(v3(3, 4, 0)), 25);
    assert.equal(length(v3(3, 4, 0)), 5);
    assert.equal(distanceSq(v3(1, 1, 1), v3(4, 5, 1)), 25);
    assert.equal(distance(v3(1, 1, 1), v3(4, 5, 1)), 5);
  });
});

describe('vec3 normalize', () => {
  it('produces a unit vector', () => {
    const out = normalize(v3(), v3(3, 4, 0));
    assert.ok(equalsApprox(out, v3(0.6, 0.8, 0), CLOSE));
    assert.ok(Math.abs(length(out) - 1) < CLOSE);
  });

  it('returns zero for a zero input rather than NaN', () => {
    // Reached constantly — a movement intent with no keys held — and NaN there
    // would poison a transform and the world hash with it.
    assert.deepEqual(normalize(v3(), V3_ZERO), { x: 0, y: 0, z: 0 });
  });
});

describe('vec3 lerp, min, max, clampLength, moveTowards, reflect', () => {
  it('lerps componentwise and hits both ends', () => {
    assert.deepEqual(lerpV3(v3(), v3(0, 0, 0), v3(2, 4, 6), 0), { x: 0, y: 0, z: 0 });
    assert.deepEqual(lerpV3(v3(), v3(0, 0, 0), v3(2, 4, 6), 1), { x: 2, y: 4, z: 6 });
    assert.deepEqual(lerpV3(v3(), v3(0, 0, 0), v3(2, 4, 6), 0.5), { x: 1, y: 2, z: 3 });
  });

  it('takes componentwise min and max', () => {
    assert.deepEqual(min(v3(), v3(1, 5, 3), v3(4, 2, 6)), { x: 1, y: 2, z: 3 });
    assert.deepEqual(max(v3(), v3(1, 5, 3), v3(4, 2, 6)), { x: 4, y: 5, z: 6 });
  });

  it('clamps length only when over', () => {
    assert.ok(equalsApprox(clampLength(v3(), v3(3, 4, 0), 2.5), v3(1.5, 2, 0), CLOSE));
    assert.deepEqual(clampLength(v3(), v3(1, 0, 0), 5), { x: 1, y: 0, z: 0 });
    assert.deepEqual(clampLength(v3(), V3_ZERO, 5), { x: 0, y: 0, z: 0 });
  });

  it('moves towards without overshooting', () => {
    assert.ok(equalsApprox(moveTowardsV3(v3(), V3_ZERO, v3(10, 0, 0), 3), v3(3, 0, 0), CLOSE));
    assert.deepEqual(moveTowardsV3(v3(), V3_ZERO, v3(10, 0, 0), 30), { x: 10, y: 0, z: 0 });
    assert.deepEqual(moveTowardsV3(v3(), v3(1, 2, 3), v3(1, 2, 3), 5), { x: 1, y: 2, z: 3 });
    assert.deepEqual(moveTowardsV3(v3(), v3(1, 2, 3), v3(9, 9, 9), 0), { x: 1, y: 2, z: 3 });
  });

  it('reflects about a plane', () => {
    assert.ok(equalsApprox(reflect(v3(), v3(1, -1, 0), V3_UP), v3(1, 1, 0), CLOSE));
  });
});

describe('vec3 slerpDirection', () => {
  it('stays on the unit sphere and hits both ends', () => {
    const out = v3();
    assert.ok(equalsApprox(slerpDirection(out, V3_RIGHT, V3_UP, 0), V3_RIGHT, 1e-9));
    assert.ok(equalsApprox(slerpDirection(out, V3_RIGHT, V3_UP, 1), V3_UP, 1e-9));
    for (const t of [0.25, 0.5, 0.75]) {
      slerpDirection(out, V3_RIGHT, V3_UP, t);
      assert.ok(Math.abs(length(out) - 1) < 1e-12, `off the sphere at t=${t}`);
    }
  });

  it('bisects a right angle at t = 0.5', () => {
    const out = slerpDirection(v3(), V3_RIGHT, V3_UP, 0.5);
    const half = Math.SQRT1_2;
    assert.ok(equalsApprox(out, v3(half, half, 0), 1e-12));
  });

  it('falls back gracefully for nearly parallel and nearly opposite inputs', () => {
    const out = v3();
    assert.ok(equalsApprox(slerpDirection(out, V3_UP, V3_UP, 0.5), V3_UP, 1e-9));
    slerpDirection(out, V3_UP, negate(v3(), V3_UP), 0.25);
    assert.ok(isFinite3(out), 'antiparallel slerp produced a non-finite result');
  });
});

describe('vec3 predicates', () => {
  it('compares approximately and detects non-finite components', () => {
    assert.ok(equalsApprox(v3(1, 2, 3), v3(1 + 1e-13, 2, 3)));
    assert.ok(!equalsApprox(v3(1, 2, 3), v3(1.01, 2, 3)));
    assert.ok(isFinite3(v3(1, 2, 3)));
    assert.ok(!isFinite3(v3(1, NaN, 3)));
    assert.ok(!isFinite3(v3(Infinity, 0, 0)));
  });
});

describe('vec2', () => {
  it('constructs, sets, copies and exposes frozen constants', () => {
    assert.deepEqual(v2(), { x: 0, y: 0 });
    assert.deepEqual(set2(v2(), 3, 4), { x: 3, y: 4 });
    assert.deepEqual(copy2(v2(), v2(5, 6)), { x: 5, y: 6 });
    assert.deepEqual(V2_ZERO, { x: 0, y: 0 });
    assert.deepEqual(V2_ONE, { x: 1, y: 1 });
    assert.ok(Object.isFrozen(V2_ONE));
  });

  it('does arithmetic', () => {
    assert.deepEqual(add2(v2(), v2(1, 2), v2(3, 4)), { x: 4, y: 6 });
    assert.deepEqual(sub2(v2(), v2(3, 4), v2(1, 2)), { x: 2, y: 2 });
    assert.deepEqual(scale2(v2(), v2(1, 2), 3), { x: 3, y: 6 });
    assert.deepEqual(negate2(v2(), v2(1, -2)), { x: -1, y: 2 });
    assert.deepEqual(addScaled2(v2(), v2(1, 1), v2(2, 4), 0.5), { x: 2, y: 3 });
  });

  it('dots, crosses and measures', () => {
    assert.equal(dot2(v2(1, 2), v2(3, 4)), 11);
    assert.equal(cross2(v2(1, 0), v2(0, 1)), 1);
    assert.equal(cross2(v2(0, 1), v2(1, 0)), -1);
    assert.equal(lengthSq2(v2(3, 4)), 25);
    assert.equal(length2(v2(3, 4)), 5);
    assert.equal(distanceSq2(v2(0, 0), v2(3, 4)), 25);
    assert.equal(distance2(v2(0, 0), v2(3, 4)), 5);
  });

  it('normalizes, returning zero for a zero input', () => {
    assert.ok(equalsApprox2(normalize2(v2(), v2(3, 4)), v2(0.6, 0.8), CLOSE));
    assert.deepEqual(normalize2(v2(), V2_ZERO), { x: 0, y: 0 });
  });

  it('lerps, clamps length and moves towards', () => {
    assert.deepEqual(lerpV2(v2(), v2(0, 0), v2(4, 8), 0.25), { x: 1, y: 2 });
    assert.ok(equalsApprox2(clampLength2(v2(), v2(3, 4), 2.5), v2(1.5, 2), CLOSE));
    assert.deepEqual(clampLength2(v2(), v2(1, 0), 5), { x: 1, y: 0 });
    assert.deepEqual(clampLength2(v2(), V2_ZERO, 5), { x: 0, y: 0 });
    assert.ok(equalsApprox2(moveTowardsV2(v2(), V2_ZERO, v2(10, 0), 3), v2(3, 0), CLOSE));
    assert.deepEqual(moveTowardsV2(v2(), V2_ZERO, v2(10, 0), 30), { x: 10, y: 0 });
    assert.deepEqual(moveTowardsV2(v2(), v2(2, 2), v2(2, 2), 5), { x: 2, y: 2 });
    assert.deepEqual(moveTowardsV2(v2(), v2(2, 2), v2(9, 9), 0), { x: 2, y: 2 });
  });

  it('rotates counter-clockwise, alias-safe', () => {
    const out = rotate2(v2(), v2(1, 0), Math.PI / 2);
    assert.ok(equalsApprox2(out, v2(0, 1), 1e-12));
    const a = v2(1, 0);
    rotate2(a, a, Math.PI);
    assert.ok(equalsApprox2(a, v2(-1, 0), 1e-12));
  });

  it('takes a left perpendicular, alias-safe', () => {
    // `equalsApprox2`, not `deepEqual`: negating a zero component gives `-0`,
    // and strict deep equality separates `-0` from `0`. Worth knowing rather
    // than papering over — `hash.hashNumberInto` hashes IEEE bits, so a `-0`
    // that reaches world state hashes differently from a `0` that looks
    // identical in a debugger. Filed as BL-051.
    assert.ok(equalsApprox2(perp2(v2(), v2(1, 0)), v2(0, 1), CLOSE));
    const a = v2(0, 1);
    perp2(a, a);
    assert.ok(equalsApprox2(a, v2(-1, 0), CLOSE));
  });

  it('compares approximately and detects non-finite components', () => {
    assert.ok(equalsApprox2(v2(1, 2), v2(1 + 1e-13, 2)));
    assert.ok(!equalsApprox2(v2(1, 2), v2(1.01, 2)));
    assert.ok(isFinite2(v2(1, 2)));
    assert.ok(!isFinite2(v2(1, NaN)));
  });
});
