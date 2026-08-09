import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  QUAT_IDENTITY,
  angleQ,
  conjugate,
  copyQ,
  dotQ,
  equalsApproxQ,
  fromAxisAngle,
  fromEulerYXZ,
  fromYaw,
  identity,
  lengthQ,
  multiply,
  normalizeQ,
  quat,
  rotateVec3,
  setQ,
  slerp,
} from '@core/math/quat';
import { V3_FORWARD, V3_RIGHT, V3_UP, equalsApprox, v3 } from '@core/math/vec3';

const CLOSE = 1e-12;

describe('quat construction', () => {
  it('defaults to the identity and is structuredClone-round-trippable', () => {
    assert.deepEqual(quat(), { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(QUAT_IDENTITY, { x: 0, y: 0, z: 0, w: 1 });
    assert.ok(Object.isFrozen(QUAT_IDENTITY));
    const q = fromYaw(quat(), 0.7);
    assert.deepEqual(structuredClone(q), q);
  });

  it('sets, copies and resets', () => {
    assert.deepEqual(setQ(quat(), 1, 2, 3, 4), { x: 1, y: 2, z: 3, w: 4 });
    assert.deepEqual(copyQ(quat(), setQ(quat(), 1, 2, 3, 4)), { x: 1, y: 2, z: 3, w: 4 });
    assert.deepEqual(identity(setQ(quat(), 1, 2, 3, 4)), { x: 0, y: 0, z: 0, w: 1 });
  });

  it('builds unit quaternions from an axis and angle', () => {
    const q = fromAxisAngle(quat(), V3_UP, Math.PI / 2);
    assert.ok(Math.abs(lengthQ(q) - 1) < CLOSE);
    assert.ok(equalsApproxQ(q, quat(0, Math.SQRT1_2, 0, Math.SQRT1_2), 1e-12));
  });

  it('fromYaw agrees with fromAxisAngle about +Y', () => {
    for (const angle of [-2, -0.3, 0, 0.7, 3]) {
      assert.ok(
        equalsApproxQ(fromYaw(quat(), angle), fromAxisAngle(quat(), V3_UP, angle), 1e-15),
        `yaw ${angle} disagreed`,
      );
    }
  });
});

describe('quat rotation of vectors', () => {
  it('rotates a vector 90° about +Y', () => {
    // Right-handed, +Y up: +X yaws towards −Z.
    const out = rotateVec3(v3(), fromYaw(quat(), Math.PI / 2), V3_RIGHT);
    assert.ok(equalsApprox(out, V3_FORWARD, 1e-12), `got ${JSON.stringify(out)}`);
  });

  it('leaves the rotation axis fixed', () => {
    const out = rotateVec3(v3(), fromYaw(quat(), 1.234), V3_UP);
    assert.ok(equalsApprox(out, V3_UP, 1e-12));
  });

  it('the identity rotates nothing', () => {
    const out = rotateVec3(v3(), QUAT_IDENTITY, v3(1, 2, 3));
    assert.ok(equalsApprox(out, v3(1, 2, 3), CLOSE));
  });

  it('preserves length', () => {
    const q = fromEulerYXZ(quat(), 0.4, -0.9, 1.7);
    const out = rotateVec3(v3(), q, v3(1, 2, 3));
    const before = Math.hypot(1, 2, 3);
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - before) < 1e-12);
  });
});

describe('quat composition', () => {
  it('applies the right operand first', () => {
    // multiply(out, a, b) means "b, then a". Checked by rotating a vector both
    // ways rather than by inspecting components, since the components of a
    // product are exactly where an order convention hides.
    const yaw = fromYaw(quat(), Math.PI / 2);
    const pitch = fromAxisAngle(quat(), V3_RIGHT, Math.PI / 2);

    const composed = multiply(quat(), yaw, pitch);
    const stepwise = rotateVec3(v3(), yaw, rotateVec3(v3(), pitch, V3_UP));
    const direct = rotateVec3(v3(), composed, V3_UP);
    assert.ok(equalsApprox(direct, stepwise, 1e-12));
  });

  it('is alias-safe', () => {
    const a = fromYaw(quat(), 0.5);
    const b = fromYaw(quat(), 0.25);
    const expected = multiply(quat(), a, b);
    multiply(a, a, b);
    assert.ok(equalsApproxQ(a, expected, CLOSE));
  });

  it('composes two half-turns about Y into a full turn', () => {
    const half = fromYaw(quat(), Math.PI);
    const full = multiply(quat(), half, half);
    // A full turn is −identity, which is the same rotation.
    assert.ok(equalsApprox(rotateVec3(v3(), full, V3_RIGHT), V3_RIGHT, 1e-12));
  });

  it('conjugate inverts', () => {
    const q = fromEulerYXZ(quat(), 0.3, 0.6, -0.2);
    const round = multiply(quat(), q, conjugate(quat(), q));
    assert.ok(equalsApproxQ(round, QUAT_IDENTITY, 1e-12));
  });
});

describe('quat normalize', () => {
  it('renormalises a drifted quaternion', () => {
    const q = setQ(quat(), 0.2, 0.4, 0.4, 0.9);
    normalizeQ(q, q);
    assert.ok(Math.abs(lengthQ(q) - 1) < CLOSE);
  });

  it('returns the identity for a zero quaternion rather than NaN', () => {
    assert.deepEqual(normalizeQ(quat(), setQ(quat(), 0, 0, 0, 0)), { x: 0, y: 0, z: 0, w: 1 });
  });
});

describe('quat slerp', () => {
  it('hits both endpoints', () => {
    const a = fromYaw(quat(), 0.2);
    const b = fromYaw(quat(), 1.4);
    assert.ok(equalsApproxQ(slerp(quat(), a, b, 0), a, 1e-12));
    assert.ok(equalsApproxQ(slerp(quat(), a, b, 1), b, 1e-12));
  });

  it('bisects at t = 0.5', () => {
    const a = fromYaw(quat(), 0);
    const b = fromYaw(quat(), 1);
    assert.ok(equalsApproxQ(slerp(quat(), a, b, 0.5), fromYaw(quat(), 0.5), 1e-12));
  });

  it('stays on the unit sphere throughout', () => {
    const a = fromEulerYXZ(quat(), 0.3, -0.9, 0.4);
    const b = fromEulerYXZ(quat(), -2.2, 0.8, -1.1);
    const out = quat();
    for (let i = 0; i <= 20; i++) {
      slerp(out, a, b, i / 20);
      assert.ok(Math.abs(lengthQ(out) - 1) < 1e-12, `off the sphere at t=${i / 20}`);
    }
  });

  it('takes the short way when the inputs have opposite signs', () => {
    // The most commonly omitted line in a hand-written slerp. `-b` is the same
    // rotation as `b`, so interpolating to it must follow the same path — and
    // without the sign flip it spins nearly all the way round instead.
    const a = fromYaw(quat(), 0);
    const b = fromYaw(quat(), 1);
    const negB = setQ(quat(), -b.x, -b.y, -b.z, -b.w);

    const viaB = slerp(quat(), a, b, 0.5);
    const viaNegB = slerp(quat(), a, negB, 0.5);

    // Same rotation, possibly opposite sign — compare by what they do.
    const fromViaB = rotateVec3(v3(), viaB, V3_RIGHT);
    const fromViaNegB = rotateVec3(v3(), viaNegB, V3_RIGHT);
    assert.ok(equalsApprox(fromViaB, fromViaNegB, 1e-12));

    // And it really is the short arc: half of one radian, not half of 2π − 1.
    assert.ok(angleQ(viaB) < 0.6, `midpoint rotated by ${angleQ(viaB)} rad`);
  });

  it('handles nearly identical inputs without dividing by a vanishing sine', () => {
    const a = fromYaw(quat(), 0.5);
    const b = fromYaw(quat(), 0.5 + 1e-9);
    const out = slerp(quat(), a, b, 0.5);
    assert.ok(Number.isFinite(out.w));
    assert.ok(Math.abs(lengthQ(out) - 1) < 1e-12);
  });
});

describe('quat misc', () => {
  it('reports the rotation angle', () => {
    assert.ok(Math.abs(angleQ(QUAT_IDENTITY)) < 1e-12);
    assert.ok(Math.abs(angleQ(fromYaw(quat(), 1)) - 1) < 1e-12);
    // q and −q are the same rotation, so the angle must agree.
    const q = fromYaw(quat(), 1);
    assert.ok(Math.abs(angleQ(setQ(quat(), -q.x, -q.y, -q.z, -q.w)) - 1) < 1e-12);
  });

  it('dots and compares', () => {
    assert.equal(dotQ(QUAT_IDENTITY, QUAT_IDENTITY), 1);
    assert.ok(equalsApproxQ(QUAT_IDENTITY, quat(0, 1e-13, 0, 1)));
    assert.ok(!equalsApproxQ(QUAT_IDENTITY, quat(0, 0.1, 0, 1)));
  });

  it('fromEulerYXZ reduces to fromYaw when pitch and roll are zero', () => {
    for (const yaw of [-1.5, 0, 0.9]) {
      assert.ok(equalsApproxQ(fromEulerYXZ(quat(), yaw, 0, 0), fromYaw(quat(), yaw), 1e-15));
    }
  });

  it('fromEulerYXZ applies yaw, then pitch, then roll', () => {
    const yaw = 0.3;
    const pitch = -0.7;
    const roll = 1.1;
    const expected = multiply(
      quat(),
      multiply(quat(), fromYaw(quat(), yaw), fromAxisAngle(quat(), V3_RIGHT, pitch)),
      fromAxisAngle(quat(), V3_FORWARD, -roll),
    );
    const actual = fromEulerYXZ(quat(), yaw, pitch, roll);
    const probe = v3(0.3, 0.5, -0.8);
    assert.ok(
      equalsApprox(rotateVec3(v3(), actual, probe), rotateVec3(v3(), expected, probe), 1e-12),
    );
  });
});
