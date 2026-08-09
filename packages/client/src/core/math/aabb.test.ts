import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aabb,
  closestPoint,
  containsAABB,
  containsPoint,
  copyAABB,
  distanceSqToPoint,
  expandByPoint,
  expandByScalar,
  intersection,
  intersects,
  isEmpty,
  setEmpty,
  setFromCenterExtents,
  setFromCorners,
  toCenter,
  toExtents,
  toSize,
  union,
  volume,
} from '@core/math/aabb';
import { equalsApprox, v3 } from '@core/math/vec3';

const CLOSE = 1e-12;

/** The unit cube centred on the origin, rebuilt per test so mutation cannot leak. */
const unit = (): ReturnType<typeof aabb> => aabb(-1, -1, -1, 1, 1, 1);

describe('aabb construction', () => {
  it('defaults to a degenerate box at the origin', () => {
    const box = aabb();
    assert.deepEqual(box.min, { x: 0, y: 0, z: 0 });
    assert.deepEqual(box.max, { x: 0, y: 0, z: 0 });
    // Degenerate is not empty: a box around a single point contains that point.
    assert.ok(!isEmpty(box));
    assert.ok(containsPoint(box, v3(0, 0, 0)));
  });

  it('is structuredClone-round-trippable', () => {
    const box = unit();
    assert.deepEqual(structuredClone(box), box);
  });

  it('copies and builds from corners in either order', () => {
    assert.deepEqual(copyAABB(aabb(), unit()), unit());
    const a = setFromCorners(aabb(), v3(3, -1, 5), v3(-2, 4, 0));
    assert.deepEqual(a.min, { x: -2, y: -1, z: 0 });
    assert.deepEqual(a.max, { x: 3, y: 4, z: 5 });
  });

  it('builds from a centre and half-extents', () => {
    const box = setFromCenterExtents(aabb(), v3(1, 2, 3), v3(0.5, 1, 1.5));
    assert.deepEqual(box.min, { x: 0.5, y: 1, z: 1.5 });
    assert.deepEqual(box.max, { x: 1.5, y: 3, z: 4.5 });
  });
});

describe('the empty box', () => {
  it('reports empty and contains nothing', () => {
    const box = setEmpty(aabb());
    assert.ok(isEmpty(box));
    assert.ok(!containsPoint(box, v3(0, 0, 0)));
    assert.equal(volume(box), 0);
  });

  it('is the identity for expandByPoint, which is what makes "start empty and grow" work', () => {
    const box = setEmpty(aabb());
    expandByPoint(box, v3(1, 2, 3));
    assert.deepEqual(box.min, { x: 1, y: 2, z: 3 });
    assert.deepEqual(box.max, { x: 1, y: 2, z: 3 });
    expandByPoint(box, v3(-4, 0, 9));
    assert.deepEqual(box.min, { x: -4, y: 0, z: 3 });
    assert.deepEqual(box.max, { x: 1, y: 2, z: 9 });
  });

  it('reports empty when only one axis is degenerate', () => {
    assert.ok(isEmpty(aabb(0, 5, 0, 1, 1, 1)));
    assert.ok(!isEmpty(aabb(0, 0, 0, 1, 0, 1)));
  });
});

describe('aabb derived quantities', () => {
  it('reports centre, half-extents and size', () => {
    const box = aabb(-1, 0, 2, 3, 4, 8);
    assert.ok(equalsApprox(toCenter(v3(), box), v3(1, 2, 5), CLOSE));
    assert.ok(equalsApprox(toExtents(v3(), box), v3(2, 2, 3), CLOSE));
    assert.ok(equalsApprox(toSize(v3(), box), v3(4, 4, 6), CLOSE));
  });

  it('round-trips centre/extents through setFromCenterExtents', () => {
    const box = aabb(-1, 0, 2, 3, 4, 8);
    const rebuilt = setFromCenterExtents(aabb(), toCenter(v3(), box), toExtents(v3(), box));
    assert.ok(equalsApprox(rebuilt.min, box.min, CLOSE));
    assert.ok(equalsApprox(rebuilt.max, box.max, CLOSE));
  });

  it('computes volume', () => {
    assert.equal(volume(unit()), 8);
    assert.equal(volume(aabb(0, 0, 0, 1, 0, 1)), 0);
  });
});

describe('aabb containment', () => {
  it('includes points on a face, edge and corner', () => {
    // Inclusive bounds are a decision, not an accident: a structure placed
    // flush against another must count as adjacent for `17`'s socket queries.
    const box = unit();
    assert.ok(containsPoint(box, v3(0, 0, 0)));
    assert.ok(containsPoint(box, v3(1, 0, 0)));
    assert.ok(containsPoint(box, v3(1, 1, 0)));
    assert.ok(containsPoint(box, v3(1, 1, 1)));
    assert.ok(!containsPoint(box, v3(1.0001, 0, 0)));
  });

  it('contains a smaller box, including one that touches its faces', () => {
    assert.ok(containsAABB(unit(), aabb(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5)));
    assert.ok(containsAABB(unit(), unit()));
    assert.ok(!containsAABB(unit(), aabb(-2, 0, 0, 0, 0, 0)));
  });
});

describe('aabb overlap', () => {
  it('detects overlap, touching and separation on each axis', () => {
    assert.ok(intersects(unit(), aabb(0, 0, 0, 2, 2, 2)));
    assert.ok(intersects(unit(), aabb(1, 0, 0, 2, 2, 2)), 'touching faces must count');
    assert.ok(!intersects(unit(), aabb(1.5, 0, 0, 2, 2, 2)));
    assert.ok(!intersects(unit(), aabb(0, 9, 0, 1, 10, 1)));
    assert.ok(!intersects(unit(), aabb(0, 0, -9, 1, 1, -2)));
  });

  it('is symmetric', () => {
    const a = unit();
    const b = aabb(0.5, 0.5, 0.5, 3, 3, 3);
    assert.equal(intersects(a, b), intersects(b, a));
  });
});

describe('aabb union and intersection', () => {
  it('unions to the smallest containing box, alias-safe', () => {
    const out = union(aabb(), unit(), aabb(0, 0, 0, 4, 1, 1));
    assert.deepEqual(out.min, { x: -1, y: -1, z: -1 });
    assert.deepEqual(out.max, { x: 4, y: 1, z: 1 });

    const a = unit();
    union(a, a, aabb(0, 0, 0, 4, 1, 1));
    assert.deepEqual(a.max, { x: 4, y: 1, z: 1 });
  });

  it('intersects to the overlap', () => {
    const out = intersection(aabb(), unit(), aabb(0, 0, 0, 4, 4, 4));
    assert.deepEqual(out.min, { x: 0, y: 0, z: 0 });
    assert.deepEqual(out.max, { x: 1, y: 1, z: 1 });
    assert.ok(!isEmpty(out));
  });

  it('reports a non-overlap as an empty box rather than null', () => {
    // The no-allocation contract: the caller keeps the box it owns and tests
    // isEmpty, instead of the function returning a nullable.
    const out = intersection(aabb(), unit(), aabb(5, 0, 0, 6, 1, 1));
    assert.ok(isEmpty(out));
  });

  it('expands and shrinks by a scalar margin', () => {
    const grown = expandByScalar(aabb(), unit(), 0.5);
    assert.deepEqual(grown.min, { x: -1.5, y: -1.5, z: -1.5 });
    const shrunk = expandByScalar(aabb(), unit(), -0.25);
    assert.deepEqual(shrunk.max, { x: 0.75, y: 0.75, z: 0.75 });
    // Shrinking past the middle produces an empty box, which is the honest
    // answer rather than an inside-out one.
    assert.ok(isEmpty(expandByScalar(aabb(), unit(), -2)));
  });
});

describe('aabb closest point and distance', () => {
  it('returns the point itself when inside, and zero distance', () => {
    assert.ok(
      equalsApprox(closestPoint(v3(), unit(), v3(0.5, -0.25, 0)), v3(0.5, -0.25, 0), CLOSE),
    );
    assert.equal(distanceSqToPoint(unit(), v3(0.5, -0.25, 0)), 0);
  });

  it('clamps to the nearest face, edge or corner', () => {
    assert.ok(equalsApprox(closestPoint(v3(), unit(), v3(5, 0, 0)), v3(1, 0, 0), CLOSE));
    assert.ok(equalsApprox(closestPoint(v3(), unit(), v3(5, 5, 0)), v3(1, 1, 0), CLOSE));
    assert.ok(equalsApprox(closestPoint(v3(), unit(), v3(-5, -5, -5)), v3(-1, -1, -1), CLOSE));
  });

  it('agrees with the distance to the closest point', () => {
    for (const p of [v3(5, 0, 0), v3(5, 5, 0), v3(-3, 2, 7), v3(0, 0, 0)]) {
      const nearest = closestPoint(v3(), unit(), p);
      const expected = (p.x - nearest.x) ** 2 + (p.y - nearest.y) ** 2 + (p.z - nearest.z) ** 2;
      assert.ok(Math.abs(distanceSqToPoint(unit(), p) - expected) < CLOSE);
    }
  });
});
