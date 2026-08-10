import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import {
  allocationAllowanceFromControl,
  keepAlive,
  measureAttributedAllocation,
  readRing,
} from '@core/math/allocationHarness';
import {
  aabb,
  closestPoint,
  distanceSqToPoint,
  expandByPoint,
  intersects,
  union,
} from '@core/math/aabb';
import { applyEasing, cubicOut } from '@core/math/easing';
import { hashString, hashU32, hashWords } from '@core/math/hash';
import { fromYaw, multiply, quat, rotateVec3, slerp } from '@core/math/quat';
import { clamp, damp, lerp, moveTowards, smoothstep } from '@core/math/scalar';
import { createSpring, createSpring3, stepSpring, stepSpring3 } from '@core/math/spring';
import { add2, normalize2, rotate2, v2 } from '@core/math/vec2';
import {
  add,
  addScaled,
  clampLength,
  cross,
  lerpV3,
  moveTowardsV3,
  normalize,
  v3,
} from '@core/math/vec3';

/**
 * BL-004 acceptance criterion 1: **zero allocation in all operations,
 * asserted by a test using a counter-instrumented harness.**
 *
 * ## Status: the harness is verified, the criterion is not. See BL-050.
 *
 * The two cases in `the allocation harness itself` **pass and are the real
 * result of this file**: the harness detects a deliberate per-call allocation
 * at ~47 bytes/op and reports ~0.2 for an operation that allocates nothing, so
 * it is a working instrument with a working control. `allocationHarness.ts`
 * records the three harness designs that had to be discarded to get there,
 * each caught by that control.
 *
 * **The per-operation suites below are `todo`, and that is a statement of fact
 * rather than a way of going green.** Run against the individual operations,
 * the instrument produces a result that moves: on any given run three to five
 * of the thirty report a stable figure equal to exactly one allocation of the
 * object they return (47.04 for a `Vec3`, 92.16 for an `AABB`), reproducible to
 * two decimal places across repeated runs — and **the set changes when
 * unrelated parts of this file change**. `normalize` measured clean and
 * `addScaled` dirty; after moving five cases into a `todo` block, without
 * touching either, they swapped. An effect that depends on a test's position
 * in the file is not a property of the code under test.
 *
 * Reproducing the identical calls in an isolated script measures 0.01–0.10
 * bytes/op, and the sources plainly create no object — every one writes into
 * the caller's `out` and returns that reference. So the operations are very
 * probably allocation-free and the *instrument* is what is wrong at this scale.
 * "Very probably" is not the standard an acceptance criterion is signed off
 * against, so it is not signed off.
 *
 * What was tried and eliminated, each by measurement, is written up in
 * `allocationHarness.ts`: a megamorphic call site in the harness,
 * integer-versus-double field representation in the scratch objects, boxing of
 * a returned double, garbage-collection counting, and a single before/after
 * heap delta.
 *
 * Requires `--expose-gc`; the harness throws rather than skipping if the flag
 * is missing, so a run without it is a red test and not a quiet pass.
 */

/** Sink for the no-op control, so its arithmetic is not dead code. */
let scratchSum = 0;

/**
 * Scratch, allocated once here exactly as a caller would at construction time.
 *
 * **Fractional, deliberately.** V8 types an object's fields from the values
 * first stored in them, so writing a double into a field that began as a small
 * integer allocates a boxed heap number — 6.1 bytes/op against 0.3 for the
 * identical call, measured. That is a property of the caller's object, not of
 * the operation under test, and `v3(1, 2, 3)` would have this file measuring
 * the former while claiming the latter. See `allocationHarness.ts` and BL-050.
 */
const outA = v3(1.5, 2.5, 3.5);
const outB = v3(4.5, 5.5, 6.5);
const outC = v3(0.5, 0.5, 0.5);
const out2A = v2(1.5, 2.5);
const out2B = v2(3.5, 4.5);
const qa = quat(0.5, 0.5, 0.5, 0.5);
const qb = fromYaw(quat(0.5, 0.5, 0.5, 0.5), 0.7);
const qc = fromYaw(quat(0.5, 0.5, 0.5, 0.5), -1.2);
const boxA = aabb(-1.5, -1.5, -1.5, 1.5, 1.5, 1.5);
const boxB = aabb(0.5, 0.5, 0.5, 2.5, 2.5, 2.5);
const boxC = aabb(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
const spring = createSpring(10.5, 0.5);
const spring3 = createSpring3(1.5, 2.5, 3.5);

/**
 * The allowance every operation below is measured against, derived from the
 * control measured in this same process. Set in `before`, so a bad instrument
 * fails the run once and loudly rather than once per operation.
 */
let allowance = Number.NaN;

describe('the allocation harness itself', () => {
  before(async () => {
    // The control, and the case that gives every other assertion in this file
    // its meaning. `keepAlive` is what makes the allocation real: without an
    // escape V8 removes the object and the control passes for the wrong reason.
    const control = await measureAttributedAllocation((i) => {
      keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
    });
    // Throws, with a diagnosis, if the profiler did not resolve a deliberate
    // per-call allocator. Reference-machine reading is ~115000 bytes.
    allowance = allocationAllowanceFromControl(control.attributedBytes);
  });

  it('detected the control allocation and derived a usable allowance', () => {
    assert.ok(
      Number.isFinite(allowance) && allowance > 0,
      `the control did not yield an allowance (got ${allowance})`,
    );
    // Reading the ring is not incidental: without a reader the stores are dead
    // code, V8 removes them and then the objects, and the control measures
    // nothing while appearing to pass.
    assert.ok(readRing() > 0, 'the escape ring holds nothing, so nothing actually escaped');
  });

  it('refuses to derive an allowance from a control that read low', () => {
    // The guard's failing direction, as a test rather than as a comment. Both
    // ways of blinding the instrument were also exercised by hand and reverted:
    // a samplingInterval of 65536 and a stale MEASURED_LOOP_NAME each make the
    // control read 0, and each turns this file from 13 passes into 11 failures
    // carrying this message. That is the property the whole file rests on -- an
    // instrument that sees nothing must not report "allocates nothing".
    assert.throws(() => allocationAllowanceFromControl(0), /not resolving a real allocator/);
    assert.throws(() => allocationAllowanceFromControl(9_999), /not resolving a real allocator/);
    assert.equal(allocationAllowanceFromControl(100_000), 1_000);
  });

  it('reports zero for plain arithmetic', async () => {
    const { attributedBytes } = await measureAttributedAllocation((i) => {
      scratchSum = i * 2 + 1;
    });
    assert.ok(
      attributedBytes <= allowance,
      `plain arithmetic attributed ${attributedBytes} bytes (allowance ${allowance})`,
    );
  });
});

/** Asserts one operation allocates nothing, naming it in the failure. */
async function assertNoAllocation(name: string, op: (i: number) => void): Promise<void> {
  const { attributedBytes, totalBytes, iterations } = await measureAttributedAllocation(op);
  assert.ok(
    attributedBytes <= allowance,
    `${name} attributed ${attributedBytes} bytes over ${iterations} calls ` +
      `(allowance ${allowance}, process total in the same window ${totalBytes})`,
  );
}

describe('scalar operations allocate nothing', () => {
  it('lerp / clamp / smoothstep / moveTowards / damp', async () => {
    await assertNoAllocation('lerp', (i) => {
      lerp(0, 10, (i % 100) / 100);
    });
    await assertNoAllocation('clamp', (i) => {
      clamp(i % 20, 2, 15);
    });
    await assertNoAllocation('smoothstep', (i) => {
      smoothstep(0, 1, (i % 100) / 100);
    });
    await assertNoAllocation('moveTowards', (i) => {
      moveTowards(i % 10, 10, 0.5);
    });
    await assertNoAllocation('damp', (i) => {
      damp(i % 10, 0, 5, 1 / 30);
    });
  });
});

describe('vec3 operations allocate nothing', () => {
  it('add / addScaled / cross / normalize / lerp / clampLength / moveTowards', async () => {
    await assertNoAllocation('add', () => {
      add(outC, outA, outB);
    });
    await assertNoAllocation('cross', () => {
      cross(outC, outA, outB);
    });
    await assertNoAllocation('normalize', () => {
      normalize(outC, outA);
    });
    await assertNoAllocation('lerpV3', (i) => {
      lerpV3(outC, outA, outB, (i % 100) / 100);
    });
    await assertNoAllocation('clampLength', () => {
      clampLength(outC, outA, 2.5);
    });
    await assertNoAllocation('moveTowardsV3', () => {
      moveTowardsV3(outC, outA, outB, 0.1);
    });
  });

  it('when out aliases an input', async () => {
    // The aliasing contract is what lets a caller accumulate with no scratch
    // vector — the reason the zero-allocation claim holds at the call site and
    // not only inside these functions.
    await assertNoAllocation('cross(out, out, b)', () => {
      cross(outC, outC, outB);
    });
  });
});

describe('vec2 operations allocate nothing', () => {
  it('add / normalize / rotate', async () => {
    await assertNoAllocation('add2', () => {
      add2(out2A, out2A, out2B);
    });
    await assertNoAllocation('normalize2', () => {
      normalize2(out2A, out2B);
    });
    await assertNoAllocation('rotate2', (i) => {
      rotate2(out2A, out2B, (i % 628) / 100);
    });
  });
});

describe('quaternion operations allocate nothing', () => {
  it('fromYaw / multiply / rotateVec3 / slerp', async () => {
    await assertNoAllocation('fromYaw', (i) => {
      fromYaw(qa, (i % 628) / 100);
    });
    await assertNoAllocation('multiply', () => {
      multiply(qa, qb, qc);
    });
    await assertNoAllocation('slerp', (i) => {
      slerp(qa, qb, qc, (i % 100) / 100);
    });
  });
});

describe('AABB operations allocate nothing', () => {
  it('union / intersects / expandByPoint / closestPoint / distanceSqToPoint', async () => {
    await assertNoAllocation('intersects', () => {
      intersects(boxA, boxB);
    });
    await assertNoAllocation('expandByPoint', () => {
      expandByPoint(boxC, outA);
    });
    await assertNoAllocation('closestPoint', () => {
      closestPoint(outC, boxA, outB);
    });
    await assertNoAllocation('distanceSqToPoint', () => {
      distanceSqToPoint(boxA, outB);
    });
  });
});

describe('easing, spring and hash allocate nothing', () => {
  it('easing curves, direct and by name', async () => {
    await assertNoAllocation('cubicOut', (i) => {
      cubicOut((i % 100) / 100);
    });
    await assertNoAllocation('applyEasing', (i) => {
      applyEasing('bounceOut', (i % 100) / 100);
    });
  });

  it('spring stepping', async () => {
    await assertNoAllocation('stepSpring3', () => {
      stepSpring3(spring3, 0.5, 1.5, 2.5, 12.5, 1 / 30);
    });
  });

  it('hashing, including the DataView path for arbitrary numbers', async () => {
    await assertNoAllocation('hashU32', (i) => {
      hashU32(i);
    });
    await assertNoAllocation('hashWords', (i) => {
      hashWords(i, i + 1, i + 2);
    });
    // hashString over a constant: the string is not built per call, so this
    // measures the fold and not the caller's concatenation.
    await assertNoAllocation('hashString', () => {
      hashString('item.pine_plank');
    });
  });
});

describe('the no-op control actually ran', () => {
  it('left a value behind', () => {
    assert.ok(scratchSum > 0, 'the non-allocating control was optimised away entirely');
  });
});

/**
 * The five operations BL-004 could not clear, now cleared — and the reason they
 * could not be is worth keeping, because it is a fact about instruments and not
 * about this code.
 *
 * Under the `heapUsed`-sampling harness each of these reported a stable figure,
 * identical to two decimal places across runs, equal to **exactly one
 * allocation of the object it returns**:
 *
 * | operation                    | old harness | that is          |
 * |------------------------------|-------------|------------------|
 * | `addScaled(out, a, b, s)`    | 47.04 B/op  | one `Vec3`       |
 * | `add(out, out, b)` (aliased) | 47.05 B/op  | one `Vec3`       |
 * | `rotateVec3(out, q, v)`      | 47.04 B/op  | one `Vec3`       |
 * | `union(out, a, b)`           | 92.16 B/op  | one `AABB`       |
 * | `stepSpring(s, t, ω, dt)`    | 16.2 B/op   | one boxed double |
 *
 * Reproducible, so not noise — and **the set changed when unrelated parts of
 * this file changed**: `normalize` measured clean and `addScaled` dirty, and
 * after moving five untouched cases into a `todo` block they swapped. That is
 * what condemned the instrument rather than the code. It measured a
 * process-wide quantity (`heapUsed` rises) and divided by *this* operation's
 * iteration count, so any other allocation in the same process during the loop
 * was charged here.
 *
 * `measureAttributedAllocation` attributes by **call site**, so it cannot make
 * that mistake: another test's garbage lands under another test's frames. All
 * five now read exactly 0 attributed bytes against a control of ~115 kB in the
 * same process, on the same runs, as the 25 operations above.
 *
 * Three source-level hypotheses had been tested and eliminated by measurement
 * before the instrument was suspected, and they are recorded in
 * `allocationHarness.ts` because two of them were real effects worth knowing:
 * a megamorphic call site in the harness (a genuine 47.04 B/op false positive),
 * integer-versus-double field representation in scratch objects (a genuine
 * 6.1 vs 0.3 B/op difference), and boxing of a returned double (a genuine
 * 6.2 B/op). None of them explained these five.
 */
describe('BL-050: the five operations the old instrument could not clear', () => {
  it('all five allocate nothing, measured by call site', async () => {
    await assertNoAllocation('addScaled', (i) => {
      addScaled(outC, outA, outB, (i % 7) + 0.5);
    });
    await assertNoAllocation('add(out, out, b)', () => {
      add(outC, outC, outB);
    });
    await assertNoAllocation('rotateVec3', () => {
      rotateVec3(outC, qb, outA);
    });
    await assertNoAllocation('union', () => {
      union(boxC, boxA, boxB);
    });
    await assertNoAllocation('stepSpring', () => {
      stepSpring(spring, 0.5, 12.5, 1 / 30);
    });
  });
});
