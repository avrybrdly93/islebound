import type { ReadonlyVec3, Vec3 } from '@core/math/vec3';
import { set as setV3 } from '@core/math/vec3';

/**
 * Unit quaternions (BL-004): rotation, in the one representation that
 * interpolates without gimbal lock and composes without matrix bookkeeping.
 *
 * Same contract as the vectors: plain object, out-parameter first, alias-safe,
 * `structuredClone`-able. Conversion to `THREE.Quaternion` happens in
 * `render/` only (`07` §7); nothing in `sim/` ever holds a three.js object.
 *
 * **Convention.** `(x, y, z, w)` with `w` the scalar part, right-handed,
 * and composition read right-to-left: `multiply(out, a, b)` applies `b`
 * first, then `a`, matching how the same expression reads for matrices.
 */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** A `Quat` nothing may write to. */
export type ReadonlyQuat = Readonly<Quat>;

/** Allocates a quaternion, identity by default. Call outside the tick. */
export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w };
}

/** The identity rotation. Frozen, so a stray write fails rather than silently rotating the world. */
export const QUAT_IDENTITY: ReadonlyQuat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function setQ(out: Quat, x: number, y: number, z: number, w: number): Quat {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

export function copyQ(out: Quat, a: ReadonlyQuat): Quat {
  return setQ(out, a.x, a.y, a.z, a.w);
}

export function identity(out: Quat): Quat {
  return setQ(out, 0, 0, 0, 1);
}

/** Rotation of `radians` about a **unit** `axis`. An unnormalised axis produces a non-unit quaternion. */
export function fromAxisAngle(out: Quat, axis: ReadonlyVec3, radians: number): Quat {
  const half = radians * 0.5;
  const s = Math.sin(half);
  return setQ(out, axis.x * s, axis.y * s, axis.z * s, Math.cos(half));
}

/** Rotation about +Y — the common one, since the player and most props only yaw. */
export function fromYaw(out: Quat, radians: number): Quat {
  const half = radians * 0.5;
  return setQ(out, 0, Math.sin(half), 0, Math.cos(half));
}

/**
 * Intrinsic **YXZ** Euler angles (yaw, then pitch, then roll) in radians.
 *
 * YXZ rather than XYZ because it is the order a character controller and a
 * third-person camera both want: yaw is the free axis, pitch is clamped, and
 * roll is usually zero. In this order gimbal lock arrives at pitch = ±90°,
 * which the camera clamps short of anyway (`11`).
 */
export function fromEulerYXZ(out: Quat, yaw: number, pitch: number, roll: number): Quat {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);
  return setQ(
    out,
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  );
}

/** Hamilton product: `out = a ∘ b`, i.e. apply `b` first. Alias-safe. */
export function multiply(out: Quat, a: ReadonlyQuat, b: ReadonlyQuat): Quat {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  return setQ(
    out,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

/** The inverse rotation, for unit quaternions. */
export function conjugate(out: Quat, a: ReadonlyQuat): Quat {
  return setQ(out, -a.x, -a.y, -a.z, a.w);
}

export function dotQ(a: ReadonlyQuat, b: ReadonlyQuat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function lengthQ(a: ReadonlyQuat): number {
  return Math.sqrt(dotQ(a, a));
}

/**
 * Renormalises. A zero quaternion becomes the identity rather than `NaN`, for
 * the same reason `vec3.normalize` returns zero: a poisoned rotation
 * propagates into every child transform and then into the world hash.
 *
 * Worth calling after a run of {@link multiply}s: unit quaternions drift off
 * the unit sphere by rounding, slowly but without bound.
 */
export function normalizeQ(out: Quat, a: ReadonlyQuat): Quat {
  const lenSq = dotQ(a, a);
  if (lenSq === 0) return identity(out);
  const inv = 1 / Math.sqrt(lenSq);
  return setQ(out, a.x * inv, a.y * inv, a.z * inv, a.w * inv);
}

/**
 * Rotates a vector by a unit quaternion, `v' = q v q*`, via the two-cross-product
 * form — no temporary quaternion, no allocation.
 */
export function rotateVec3(out: Vec3, q: ReadonlyQuat, v: ReadonlyVec3): Vec3 {
  const vx = v.x;
  const vy = v.y;
  const vz = v.z;
  // t = 2 * (q.xyz × v)
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  // v' = v + q.w * t + q.xyz × t
  return setV3(
    out,
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  );
}

/**
 * Spherical linear interpolation along the **shorter** arc.
 *
 * `q` and `−q` are the same rotation, so a naive slerp between two
 * quaternions that happen to have opposite signs takes the long way round —
 * a 350° spin where 10° was meant. The `cosine < 0` branch flips one input to
 * prevent exactly that; it is the single most commonly omitted line in a
 * hand-written slerp and the bug it causes looks like a physics glitch rather
 * than a maths error.
 *
 * Falls back to normalised lerp when the two are nearly parallel, where the
 * `sin θ` denominator loses precision and the two curves differ by less than
 * the renormalise.
 */
export function slerp(out: Quat, a: ReadonlyQuat, b: ReadonlyQuat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let cosine = dotQ(a, b);

  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let wa: number;
  let wb: number;
  if (cosine > 0.9995) {
    wa = 1 - t;
    wb = t;
  } else {
    const theta = Math.acos(cosine);
    const sinTheta = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sinTheta;
    wb = Math.sin(t * theta) / sinTheta;
  }

  setQ(out, a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
  return normalizeQ(out, out);
}

/** The angle of the rotation, in radians, in `[0, π]`. */
export function angleQ(a: ReadonlyQuat): number {
  return 2 * Math.acos(Math.min(1, Math.abs(a.w)));
}

/** Whether two quaternions agree componentwise. Note `q` and `−q` are *not* equal by this test. */
export function equalsApproxQ(a: ReadonlyQuat, b: ReadonlyQuat, tolerance = 1e-12): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance &&
    Math.abs(a.w - b.w) <= tolerance
  );
}
