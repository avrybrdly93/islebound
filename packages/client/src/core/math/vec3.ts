import { clamp01, lerp } from '@core/math/scalar';

/**
 * 3D vectors (BL-004), in the plain-object out-parameter style `07` §7 makes
 * binding.
 *
 * **Why not a class with operator-ish methods.** Three reasons, all of them
 * project constraints rather than taste. Components must survive
 * `structuredClone` losslessly (`07` §2.4), which a class instance does not.
 * The per-frame paths must not allocate (`06`, and the CLAUDE.md standing
 * rule), and chained methods (`a.add(b).scale(2)`) allocate a temporary per
 * link. And `sim/` state gets hashed (`04` §4.2); a plain `{x, y, z}` has one
 * obvious canonical serialisation and a class does not.
 *
 * **The out-parameter convention.** Every function that produces a vector
 * takes `out` first and returns it, so results compose (`add(out, a, b)` then
 * `scale(out, out, 2)`) and so `out` may alias any input — each function reads
 * every component it needs into locals before writing any. That aliasing
 * guarantee is what lets a caller accumulate in place with no scratch vector,
 * which is the whole point.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A `Vec3` nothing may write to — the type for shared constants and inputs. */
export type ReadonlyVec3 = Readonly<Vec3>;

/**
 * Allocates a vector.
 *
 * The only allocating function in this module, and named as a noun for that
 * reason: everything else writes into an `out` the caller already owns. Call
 * this at construction time, never inside a tick.
 */
export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** Frozen constants. Frozen so a stray write fails loudly in dev rather than corrupting every reader. */
export const V3_ZERO: ReadonlyVec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const V3_ONE: ReadonlyVec3 = Object.freeze({ x: 1, y: 1, z: 1 });
export const V3_UP: ReadonlyVec3 = Object.freeze({ x: 0, y: 1, z: 0 });
export const V3_RIGHT: ReadonlyVec3 = Object.freeze({ x: 1, y: 0, z: 0 });
export const V3_FORWARD: ReadonlyVec3 = Object.freeze({ x: 0, y: 0, z: -1 });

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: ReadonlyVec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function add(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  return set(out, a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  return set(out, a.x - b.x, a.y - b.y, a.z - b.z);
}

export function mul(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  return set(out, a.x * b.x, a.y * b.y, a.z * b.z);
}

export function scale(out: Vec3, a: ReadonlyVec3, s: number): Vec3 {
  return set(out, a.x * s, a.y * s, a.z * s);
}

/** `out = a + b * s`, the fused step every integrator wants. */
export function addScaled(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, s: number): Vec3 {
  return set(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
}

export function negate(out: Vec3, a: ReadonlyVec3): Vec3 {
  return set(out, -a.x, -a.y, -a.z);
}

export function dot(a: ReadonlyVec3, b: ReadonlyVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Right-handed cross product. Reads all six components first, so `out` may alias either input. */
export function cross(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  return set(out, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

export function lengthSq(a: ReadonlyVec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: ReadonlyVec3): number {
  return Math.sqrt(lengthSq(a));
}

export function distanceSq(a: ReadonlyVec3, b: ReadonlyVec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function distance(a: ReadonlyVec3, b: ReadonlyVec3): number {
  return Math.sqrt(distanceSq(a, b));
}

/**
 * Unit vector in the direction of `a`, or the zero vector when `a` is zero.
 *
 * Returning zero rather than `NaN` is a decision, not a shortcut. The zero
 * input is reached constantly — a movement intent with no keys held, a
 * velocity at rest — and `NaN` propagating out of it would silently poison a
 * transform and, through it, the world hash. A zero direction is the honest
 * answer to "which way is nowhere pointing", and callers that need to tell the
 * two apart check {@link lengthSq} first.
 */
export function normalize(out: Vec3, a: ReadonlyVec3): Vec3 {
  const lenSq = lengthSq(a);
  if (lenSq === 0) return set(out, 0, 0, 0);
  const inv = 1 / Math.sqrt(lenSq);
  return set(out, a.x * inv, a.y * inv, a.z * inv);
}

export function lerpV3(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, t: number): Vec3 {
  return set(out, lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

/** Component-wise minimum. */
export function min(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  return set(out, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
}

/** Component-wise maximum. */
export function max(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  return set(out, Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
}

/**
 * Shortens `a` to at most `maxLength`, leaving shorter vectors untouched.
 *
 * The guard is on the *squared* length so the common no-op case costs no
 * square root — this is called per entity per tick on velocities.
 */
export function clampLength(out: Vec3, a: ReadonlyVec3, maxLength: number): Vec3 {
  const lenSq = lengthSq(a);
  if (lenSq <= maxLength * maxLength || lenSq === 0) return copy(out, a);
  const s = maxLength / Math.sqrt(lenSq);
  return set(out, a.x * s, a.y * s, a.z * s);
}

/**
 * Steps towards `target` by at most `maxDelta`, never overshooting — the
 * vector form of `scalar.moveTowards`, and the same reasoning applies.
 */
export function moveTowardsV3(
  out: Vec3,
  current: ReadonlyVec3,
  target: ReadonlyVec3,
  maxDelta: number,
): Vec3 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq === 0 || maxDelta <= 0) return copy(out, current);
  if (distSq <= maxDelta * maxDelta) return copy(out, target);
  const s = maxDelta / Math.sqrt(distSq);
  return set(out, current.x + dx * s, current.y + dy * s, current.z + dz * s);
}

/**
 * Reflects `a` about a plane with unit normal `n`: `a − 2(a·n)n`.
 *
 * `n` is assumed normalised; passing an unnormalised normal scales the
 * reflected component, which is a silent wrongness rather than an error, so
 * callers normalise first.
 */
export function reflect(out: Vec3, a: ReadonlyVec3, n: ReadonlyVec3): Vec3 {
  const d = 2 * dot(a, n);
  return set(out, a.x - d * n.x, a.y - d * n.y, a.z - d * n.z);
}

/** Whether every component of `a` and `b` agrees to within `tolerance`. */
export function equalsApprox(a: ReadonlyVec3, b: ReadonlyVec3, tolerance = 1e-12): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance
  );
}

/** Whether every component is finite — the guard before a value enters the world state. */
export function isFinite3(a: ReadonlyVec3): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
}

/**
 * Spherical-ish interpolation of *directions*, falling back to
 * {@link lerpV3} plus a renormalise when the two are nearly parallel.
 *
 * Both inputs must be unit vectors. The fallback threshold is where the sine
 * in the slerp denominator loses precision; below it the arc and the chord
 * differ by less than the renormalise corrects for anyway.
 */
export function slerpDirection(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, t: number): Vec3 {
  const cosine = Math.max(-1, Math.min(1, dot(a, b)));
  if (cosine > 0.9995 || cosine < -0.9995) {
    lerpV3(out, a, b, clamp01(t));
    return normalize(out, out);
  }
  const theta = Math.acos(cosine);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return set(out, a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}
