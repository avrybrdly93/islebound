import type { ReadonlyVec3, Vec3 } from '@core/math/vec3';
import { set as setV3 } from '@core/math/vec3';

/**
 * Axis-aligned bounding boxes (BL-004).
 *
 * Stored as min/max corners rather than centre/extents. Both are one
 * subtraction apart, but min/max makes the two operations this project does
 * most — overlap tests and merging — branch-free and exact, where
 * centre/extents needs an add and a subtract per axis first and loses a bit of
 * precision doing it. {@link toCenter} and {@link toExtents} convert for the
 * cases that want the other form.
 *
 * An AABB is **inclusive** on both bounds: a point exactly on a face is
 * inside, and two boxes that share a face touch. The alternative (half-open)
 * would make a structure placed flush against another not count as adjacent,
 * which is the wrong answer for `17`'s socket queries.
 */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** An `AABB` nothing may write to, including through its corners. */
export interface ReadonlyAABB {
  readonly min: ReadonlyVec3;
  readonly max: ReadonlyVec3;
}

/** Allocates a box (two vectors). Call outside the tick. */
export function aabb(minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0): AABB {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/**
 * The empty box: `min = +∞`, `max = −∞`.
 *
 * This is the identity for {@link expandByPoint} and {@link union}, which is
 * what makes "start empty and grow" work without a `first ?` branch in the
 * loop. It is also why {@link isEmpty} tests `min > max` rather than
 * `min === max`: a box around a single point has `min === max` and is *not*
 * empty.
 */
export function setEmpty(out: AABB): AABB {
  setV3(out.min, Infinity, Infinity, Infinity);
  setV3(out.max, -Infinity, -Infinity, -Infinity);
  return out;
}

export function copyAABB(out: AABB, a: ReadonlyAABB): AABB {
  setV3(out.min, a.min.x, a.min.y, a.min.z);
  setV3(out.max, a.max.x, a.max.y, a.max.z);
  return out;
}

/** Writes a box spanning the two corners, in either order. */
export function setFromCorners(out: AABB, a: ReadonlyVec3, b: ReadonlyVec3): AABB {
  setV3(out.min, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
  setV3(out.max, Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
  return out;
}

/** Writes a box from a centre and **half**-extents. */
export function setFromCenterExtents(out: AABB, center: ReadonlyVec3, extents: ReadonlyVec3): AABB {
  setV3(out.min, center.x - extents.x, center.y - extents.y, center.z - extents.z);
  setV3(out.max, center.x + extents.x, center.y + extents.y, center.z + extents.z);
  return out;
}

/** Whether the box is degenerate in any axis (`min > max`), i.e. contains nothing. */
export function isEmpty(a: ReadonlyAABB): boolean {
  return a.min.x > a.max.x || a.min.y > a.max.y || a.min.z > a.max.z;
}

export function toCenter(out: Vec3, a: ReadonlyAABB): Vec3 {
  return setV3(
    out,
    (a.min.x + a.max.x) * 0.5,
    (a.min.y + a.max.y) * 0.5,
    (a.min.z + a.max.z) * 0.5,
  );
}

/** Half-extents. */
export function toExtents(out: Vec3, a: ReadonlyAABB): Vec3 {
  return setV3(
    out,
    (a.max.x - a.min.x) * 0.5,
    (a.max.y - a.min.y) * 0.5,
    (a.max.z - a.min.z) * 0.5,
  );
}

/** Full width per axis. */
export function toSize(out: Vec3, a: ReadonlyAABB): Vec3 {
  return setV3(out, a.max.x - a.min.x, a.max.y - a.min.y, a.max.z - a.min.z);
}

/** Grows the box to include a point. Correct on an empty box, which is the point of {@link setEmpty}. */
export function expandByPoint(out: AABB, p: ReadonlyVec3): AABB {
  if (p.x < out.min.x) out.min.x = p.x;
  if (p.y < out.min.y) out.min.y = p.y;
  if (p.z < out.min.z) out.min.z = p.z;
  if (p.x > out.max.x) out.max.x = p.x;
  if (p.y > out.max.y) out.max.y = p.y;
  if (p.z > out.max.z) out.max.z = p.z;
  return out;
}

/** Grows (or, with a negative margin, shrinks) the box by a uniform margin on every face. */
export function expandByScalar(out: AABB, a: ReadonlyAABB, margin: number): AABB {
  setV3(out.min, a.min.x - margin, a.min.y - margin, a.min.z - margin);
  setV3(out.max, a.max.x + margin, a.max.y + margin, a.max.z + margin);
  return out;
}

/** The smallest box containing both. Alias-safe. */
export function union(out: AABB, a: ReadonlyAABB, b: ReadonlyAABB): AABB {
  const minX = Math.min(a.min.x, b.min.x);
  const minY = Math.min(a.min.y, b.min.y);
  const minZ = Math.min(a.min.z, b.min.z);
  const maxX = Math.max(a.max.x, b.max.x);
  const maxY = Math.max(a.max.y, b.max.y);
  const maxZ = Math.max(a.max.z, b.max.z);
  setV3(out.min, minX, minY, minZ);
  setV3(out.max, maxX, maxY, maxZ);
  return out;
}

/**
 * The overlap of two boxes, which is **empty when they do not overlap** —
 * `min > max` on the separating axis, exactly the state {@link isEmpty}
 * reports. Callers test `isEmpty(out)` rather than getting `null`, so the
 * result is still a box the caller already owns and nothing allocates.
 */
export function intersection(out: AABB, a: ReadonlyAABB, b: ReadonlyAABB): AABB {
  const minX = Math.max(a.min.x, b.min.x);
  const minY = Math.max(a.min.y, b.min.y);
  const minZ = Math.max(a.min.z, b.min.z);
  const maxX = Math.min(a.max.x, b.max.x);
  const maxY = Math.min(a.max.y, b.max.y);
  const maxZ = Math.min(a.max.z, b.max.z);
  setV3(out.min, minX, minY, minZ);
  setV3(out.max, maxX, maxY, maxZ);
  return out;
}

export function containsPoint(a: ReadonlyAABB, p: ReadonlyVec3): boolean {
  return (
    p.x >= a.min.x &&
    p.x <= a.max.x &&
    p.y >= a.min.y &&
    p.y <= a.max.y &&
    p.z >= a.min.z &&
    p.z <= a.max.z
  );
}

/** Whether `inner` lies entirely within `outer`, touching faces included. */
export function containsAABB(outer: ReadonlyAABB, inner: ReadonlyAABB): boolean {
  return (
    inner.min.x >= outer.min.x &&
    inner.max.x <= outer.max.x &&
    inner.min.y >= outer.min.y &&
    inner.max.y <= outer.max.y &&
    inner.min.z >= outer.min.z &&
    inner.max.z <= outer.max.z
  );
}

/** Whether the two boxes overlap or touch. */
export function intersects(a: ReadonlyAABB, b: ReadonlyAABB): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/** The point of the box closest to `p` — `p` itself when it is inside. */
export function closestPoint(out: Vec3, a: ReadonlyAABB, p: ReadonlyVec3): Vec3 {
  return setV3(
    out,
    p.x < a.min.x ? a.min.x : p.x > a.max.x ? a.max.x : p.x,
    p.y < a.min.y ? a.min.y : p.y > a.max.y ? a.max.y : p.y,
    p.z < a.min.z ? a.min.z : p.z > a.max.z ? a.max.z : p.z,
  );
}

/** Squared distance from a point to the box; zero inside. No square root, no allocation. */
export function distanceSqToPoint(a: ReadonlyAABB, p: ReadonlyVec3): number {
  const dx = p.x < a.min.x ? a.min.x - p.x : p.x > a.max.x ? p.x - a.max.x : 0;
  const dy = p.y < a.min.y ? a.min.y - p.y : p.y > a.max.y ? p.y - a.max.y : 0;
  const dz = p.z < a.min.z ? a.min.z - p.z : p.z > a.max.z ? p.z - a.max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

/** Volume; zero for an empty or flat box. */
export function volume(a: ReadonlyAABB): number {
  if (isEmpty(a)) return 0;
  return (a.max.x - a.min.x) * (a.max.y - a.min.y) * (a.max.z - a.min.z);
}
