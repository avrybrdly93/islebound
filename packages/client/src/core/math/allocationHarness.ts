/**
 * The counter-instrumented allocation harness BL-004's first acceptance
 * criterion asks for.
 *
 * ## What it counts
 *
 * `heapUsed`, sampled periodically through the loop, accumulating only the
 * **increases**. A rise between two samples is memory the operation allocated;
 * a fall is the collector reclaiming it. Summing the rises therefore
 * approximates total bytes allocated, which is the quantity the rule is about,
 * and divides out to bytes per operation.
 *
 * ## Two harnesses that did not work, recorded so they are not retried
 *
 * **A single before/after `heapUsed` delta measures retention, not garbage.**
 * The collector runs *during* the loop and reclaims everything the operation
 * dropped, so 200,000 short-lived objects finish with the heap barely larger
 * than it started. Written that way first, this harness reported 7 bytes/op
 * for an operation that allocates a 47-byte object per call — an under-report
 * of six sevenths, in the direction that makes a broken rule look kept.
 *
 * **Counting garbage collections via `PerformanceObserver` on `'gc'` does not
 * work on this runtime.** It is the obvious fix to the above and it reports
 * zero collections for a loop that provably allocates 200,000 objects (Node
 * v22.22.2, both `entryTypes: ['gc']` and `type: 'gc'`, callback and
 * `takeRecords()`). The entries simply never arrive. A harness whose signal is
 * always zero would have passed every case in `allocation.test.ts` — including
 * the control, which is how this was caught.
 *
 * ## Accuracy, stated rather than implied
 *
 * Measured on the reference machine: a loop allocating one `{x, y, z}` per call
 * reports **≈ 47 bytes/op**, reproducibly to two decimal places across runs;
 * a loop writing into a caller-owned object reports **≈ 0.20 bytes/op**. That
 * floor is the harness's own cost — `process.memoryUsage()` returns a fresh
 * object per sample, 200 samples over 200,000 iterations — and it is why the
 * threshold in the tests is a small positive number rather than zero. The gap
 * between the two figures is a factor of 200, so nothing that allocates an
 * object per call can hide under any threshold in between.
 *
 * ## The control case is the point
 *
 * A harness that reports "no allocation" for everything is worse than no
 * harness: it makes the criterion look verified. `allocation.test.ts`
 * therefore measures a deliberate allocator alongside the real operations and
 * **fails if the harness does not catch it**. Both dead ends above were found
 * by that control and by nothing else.
 *
 * ## Two things the caller must get right, both measured
 *
 * **`op` returns `void`, and that is load-bearing.** A closure written
 * `(i) => lerp(0, 10, t)` returns a double, and a double crossing a
 * non-inlined call boundary as a value is boxed into a heap number — **6.2
 * bytes/op**, measured, for an operation that allocates nothing. That is the
 * harness's own overhead attributed to the operation. Writing the body as a
 * statement (`(i) => { lerp(0, 10, t); }`) removes it entirely, which is why
 * the signature forbids a return rather than merely ignoring one.
 *
 * **Scratch objects must hold doubles, not integers.** V8 gives an object's
 * fields a representation from the values first stored in them, and writing a
 * double into a field that began as a small integer costs a boxed heap number.
 * Measured on the reference machine: the identical `normalize(out, a)` call
 * reports **6.1 bytes/op** with `out` created as `{x: 0, y: 0, z: 0}` and
 * **0.3 bytes/op** with `out` created as `{x: 0.5, y: 0.5, z: 0.5}`. Neither
 * number is a property of `normalize`; both are a property of the caller's
 * object. Tests here construct scratch with fractional values so they measure
 * the operation. See BL-050, which is about whether the engine's own scratch
 * and component defaults should do the same.
 *
 * ## Why the reported figure is a minimum over repeats
 *
 * A single pass is not reproducible. Run the same suite twice and a different
 * handful of allocation-free operations report 3–34 bytes/op each time: the
 * optimiser tiering up mid-loop, another test's garbage being promoted, the
 * runner's own bookkeeping. All of that noise is **additive** — the counter
 * only ever sums *rises* — so it can inflate a reading but never deflate one.
 * The minimum over several passes is therefore the closest available estimate
 * of the operation's own cost, and a genuine per-call allocation shows up in
 * every pass, so the minimum does not hide it. Measured: the control's minimum
 * over three passes is still ~47 bytes/op, while the allocation-free
 * operations settle at their ~0.2–0.4 floor.
 *
 * ## One honest caveat
 *
 * An allocation V8 removes by escape analysis reads as no allocation. That is
 * the right answer for this criterion — the rule exists to keep garbage off the
 * per-frame path, and an object that never reaches the heap is not garbage —
 * but it means this measures *observed heap behaviour*, not source-level object
 * creation. It is also why {@link keepAlive} stores into a ring that
 * {@link readRing} actually reads: an unread ring is dead code, V8 removes the
 * store and then the object, and the control silently measures nothing. That
 * happened too.
 */

/** Result of one measurement. */
export interface AllocationMeasurement {
  /** Approximate heap bytes allocated per call. */
  readonly bytesPerOp: number;
  /** Iterations run, echoed back so a failure message can state the sample size. */
  readonly iterations: number;
}

/**
 * A ring of live references, so anything stored here genuinely escapes.
 *
 * 1024 wide: large enough that the optimiser cannot prove a stored object
 * dead, small enough that the ring itself is not what fills the heap.
 */
const RING_SIZE = 1024;
const ring: unknown[] = new Array<unknown>(RING_SIZE).fill(null);
let ringIndex = 0;

/**
 * Publishes a value so the expression producing it cannot be optimised away.
 *
 * Used by the control case in the tests. Real operations under measurement do
 * not need it — they write into an `out` the caller holds, which is already an
 * escape — and calling it on them would add the ring store to their cost.
 */
export function keepAlive(value: unknown): void {
  ring[ringIndex] = value;
  ringIndex = (ringIndex + 1) & (RING_SIZE - 1);
}

/**
 * Reads the ring, so the stores into it are not dead code.
 *
 * The control case calls this and asserts on the result. Without a reader V8
 * eliminates the whole chain and the control measures nothing while appearing
 * to pass.
 */
export function readRing(): number {
  let sum = 0;
  for (const value of ring) {
    if (value !== null && typeof value === 'object' && 'x' in value) {
      const x = value.x;
      if (typeof x === 'number') sum += x;
    }
  }
  return sum;
}

/** `global.gc`, present only under `--expose-gc`. */
type GcFn = () => void;

function gcOrThrow(): GcFn {
  const gc = (globalThis as { gc?: GcFn }).gc;
  if (typeof gc !== 'function') {
    throw new Error(
      'allocationHarness: global.gc is unavailable. Run node with --expose-gc; without it ' +
        'the measurement starts from whatever the previous test left on the heap, and the ' +
        "first sample attributes its predecessor's garbage to this operation.",
    );
  }
  return gc;
}

/**
 * Approximate heap bytes allocated per call of `op`.
 *
 * `op` receives the iteration index so a caller can vary its inputs and keep
 * the optimiser from hoisting the loop out.
 *
 * @param op          The operation under measurement.
 * @param iterations  How many times to run it.
 * @param sampleEvery How many iterations between `heapUsed` readings. Must
 *                    divide the young generation into several samples — too
 *                    coarse and a collection between two samples hides the
 *                    rise that preceded it; too fine and the sampling's own
 *                    cost dominates the floor.
 */
export function measureAllocation(
  op: (i: number) => void,
  iterations = 100_000,
  sampleEvery = 1_000,
  repeats = 3,
): AllocationMeasurement {
  const gc = gcOrThrow();

  // Warm-up: compile the function and create any hidden classes before the
  // measured passes, so their one-off cost is not attributed to the operation.
  for (let i = 0; i < 2_000; i++) op(i);

  const pass = makePass(op, iterations, sampleEvery);

  let best = Infinity;
  for (let i = 0; i < repeats; i++) {
    gc();
    gc();
    best = Math.min(best, pass());
  }

  return { bytesPerOp: best, iterations };
}

/**
 * Builds a fresh measuring loop closed over one operation.
 *
 * **A factory, not a shared function, and that is the fix for the largest
 * source of false positives here.** A single top-level loop called with thirty
 * different closures makes its `op(i)` call site megamorphic; V8 then compiles
 * a generic call for it, and several operations that allocate nothing reported
 * a stable, reproducible **47.04 bytes/op** — exactly one small object per
 * call, and exactly the control's figure. Reproducible, so not noise, and
 * nothing to do with the operation: it was the harness's own call site.
 *
 * Each measurement now gets its own closure, its own feedback vector and
 * therefore its own monomorphic call to `op`.
 */
function makePass(op: (i: number) => void, iterations: number, sampleEvery: number): () => number {
  return function pass(): number {
    let allocated = 0;
    let previous = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      op(i);
      if (i % sampleEvery === 0) {
        const current = process.memoryUsage().heapUsed;
        if (current > previous) allocated += current - previous;
        previous = current;
      }
    }

    const final = process.memoryUsage().heapUsed;
    if (final > previous) allocated += final - previous;

    return allocated / iterations;
  };
}
