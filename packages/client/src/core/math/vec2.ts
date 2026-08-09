import { lerp } from '@core/math/scalar';

/**
 * 2D vectors (BL-004). Same plain-object, out-parameter, alias-safe contract
 * as `vec3.ts` — see that file's header for why the shape is what it is.
 *
 * `Vec2` is the type of a move intent (`07` §2.2's `{ type: 'move'; dir: Vec2 }`),
 * a tile coordinate and a UI point. It is deliberately *not* used for a
 * horizontal slice of a world position: mixing "xz on the ground plane" into
 * the same type as "xy on screen" is how an axis gets swapped, so ground-plane
 * work stays in {@link Vec3} with `y` fixed.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/** A `Vec2` nothing may write to. */
export type ReadonlyVec2 = Readonly<Vec2>;

/** Allocates a vector. The only allocating function here; call it outside the tick. */
export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export const V2_ZERO: ReadonlyVec2 = Object.freeze({ x: 0, y: 0 });
export const V2_ONE: ReadonlyVec2 = Object.freeze({ x: 1, y: 1 });

export function set2(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function copy2(out: Vec2, a: ReadonlyVec2): Vec2 {
  out.x = a.x;
  out.y = a.y;
  return out;
}

export function add2(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  return set2(out, a.x + b.x, a.y + b.y);
}

export function sub2(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  return set2(out, a.x - b.x, a.y - b.y);
}

export function scale2(out: Vec2, a: ReadonlyVec2, s: number): Vec2 {
  return set2(out, a.x * s, a.y * s);
}

export function addScaled2(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2, s: number): Vec2 {
  return set2(out, a.x + b.x * s, a.y + b.y * s);
}

export function negate2(out: Vec2, a: ReadonlyVec2): Vec2 {
  return set2(out, -a.x, -a.y);
}

export function dot2(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return a.x * b.x + a.y * b.y;
}

/** The z component of the 3D cross product — signed area, and the sign of a turn. */
export function cross2(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return a.x * b.y - a.y * b.x;
}

export function lengthSq2(a: ReadonlyVec2): number {
  return a.x * a.x + a.y * a.y;
}

export function length2(a: ReadonlyVec2): number {
  return Math.sqrt(lengthSq2(a));
}

export function distanceSq2(a: ReadonlyVec2, b: ReadonlyVec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance2(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return Math.sqrt(distanceSq2(a, b));
}

/** Unit vector, or zero for a zero input — see `vec3.normalize` for why zero and not `NaN`. */
export function normalize2(out: Vec2, a: ReadonlyVec2): Vec2 {
  const lenSq = lengthSq2(a);
  if (lenSq === 0) return set2(out, 0, 0);
  const inv = 1 / Math.sqrt(lenSq);
  return set2(out, a.x * inv, a.y * inv);
}

export function lerpV2(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2, t: number): Vec2 {
  return set2(out, lerp(a.x, b.x, t), lerp(a.y, b.y, t));
}

/** Rotates counter-clockwise by `radians`. Alias-safe: both components are read first. */
export function rotate2(out: Vec2, a: ReadonlyVec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const ax = a.x;
  const ay = a.y;
  return set2(out, ax * c - ay * s, ax * s + ay * c);
}

/** Left-hand perpendicular: a quarter turn counter-clockwise. Alias-safe. */
export function perp2(out: Vec2, a: ReadonlyVec2): Vec2 {
  const ax = a.x;
  return set2(out, -a.y, ax);
}

/** Shortens to at most `maxLength`; shorter vectors pass through untouched. */
export function clampLength2(out: Vec2, a: ReadonlyVec2, maxLength: number): Vec2 {
  const lenSq = lengthSq2(a);
  if (lenSq <= maxLength * maxLength || lenSq === 0) return copy2(out, a);
  const s = maxLength / Math.sqrt(lenSq);
  return set2(out, a.x * s, a.y * s);
}

/** Steps towards `target` by at most `maxDelta`, never overshooting. */
export function moveTowardsV2(
  out: Vec2,
  current: ReadonlyVec2,
  target: ReadonlyVec2,
  maxDelta: number,
): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0 || maxDelta <= 0) return copy2(out, current);
  if (distSq <= maxDelta * maxDelta) return copy2(out, target);
  const s = maxDelta / Math.sqrt(distSq);
  return set2(out, current.x + dx * s, current.y + dy * s);
}

export function equalsApprox2(a: ReadonlyVec2, b: ReadonlyVec2, tolerance = 1e-12): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function isFinite2(a: ReadonlyVec2): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y);
}
