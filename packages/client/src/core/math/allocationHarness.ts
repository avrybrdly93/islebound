/**
 * The counter-instrumented allocation harness BL-004's first acceptance
 * criterion asks for.
 *
 * ## What it counts
 *
 * {@link measureAttributedAllocation} is the instrument. It runs the operation
 * under V8's **sampling heap profiler**, which records a stack trace at sampled
 * allocations, and reports the bytes attributed to the measuring loop and
 * everything it called — the operation and nothing else. Read its own doc for
 * what the figure is and is not.
 *
 * ## THE REST OF THIS COMMENT IS HISTORY, AND IS KEPT ON PURPOSE
 *
 * Everything below describes instruments that were built, measured, and
 * discarded. It is retained because each was discarded *by a measurement* that
 * a later session would otherwise have to repeat, and two of the effects are
 * real properties of V8 that a caller writing a new measurement will meet
 * again. The `heapUsed`-sampling harness these sections describe was deleted
 * when BL-050 replaced it; the reasoning is what survives.
 *
 * ## Three harnesses that did not work, recorded so they are not retried
 *
 * **The `heapUsed`-rise harness worked at whole-process resolution and failed
 * at per-operation resolution.** It sampled `process.memoryUsage().heapUsed`
 * through the loop and summed the increases, which is a process-wide quantity
 * divided by *one* operation's iteration count — so any other allocation in the
 * same process during the loop was charged to the operation. Under the test
 * runner three to five of thirty allocation-free operations reported exactly one
 * returned object's worth of bytes, reproducibly, **and the set changed when
 * unrelated parts of the test file changed**. That is BL-050. Its control case
 * always worked (~47 bytes/op for a deliberate allocator, ~0.20 for a clean
 * operation), which is why the instrument looked sound for as long as it did.
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

// ---------------------------------------------------------------------------
// BL-050: the call-site-attributed instrument that replaced the one above
// ---------------------------------------------------------------------------

/**
 * Result of one attributed measurement.
 *
 * The figure that matters is {@link attributedBytes}, and it is deliberately
 * **not** called "bytes per op": see {@link measureAttributedAllocation} for
 * what it is and what it is not.
 */
export interface AttributedAllocation {
  /**
   * Bytes the sampling heap profiler attributed to the measuring loop and
   * everything it called — which is the operation and nothing else.
   *
   * The **minimum** over {@link AttributedAllocationOptions.repeats} passes —
   * zero, exactly, for every allocation-free operation measured so far, and
   * ~115 kB for a control that allocates one small object per call.
   */
  readonly attributedBytes: number;
  /**
   * Bytes attributed anywhere in the process during the measured window,
   * including the profiler's own bookkeeping and any other test's garbage.
   *
   * Reported so a reading can be sanity-checked: an `attributedBytes` of zero
   * against a `totalBytes` of zero means the profiler recorded nothing at all
   * and the measurement is void, not clean. {@link assertInstrumentWorks}
   * exists so that distinction is a test rather than a caller's discipline.
   */
  readonly totalBytes: number;
  readonly iterations: number;
}

/** Options for {@link measureAttributedAllocation}. */
export interface AttributedAllocationOptions {
  readonly iterations?: number;
  /**
   * Bytes between profiler samples. Default 1024.
   *
   * **Both directions of getting this wrong were measured**, which is why it is
   * documented rather than merely defaulted. At 65536 the control itself reads
   * zero — the interval is coarser than the whole measured window's sampled
   * allocation, so the instrument reports "clean" for a deliberate allocator,
   * the exact failure mode this harness exists to prevent. At 16 the noise
   * leaks in the other direction: an allocation-free operation read 904 bytes
   * where 64–8192 all read exactly 0. Reference-machine readings for the
   * control against an allocation-free operation, 200k iterations:
   *
   * | interval | control | allocation-free |
   * |---|---|---|
   * | 16 | 344 | 904 |
   * | 64 | 112976 | 0 |
   * | 256 | 121608 | 0 |
   * | 1024 | 90144 | 0 |
   * | 8192 | 65952 | 0 |
   * | 65536 | 0 | 0 |
   */
  readonly samplingInterval?: number;
  /**
   * Iterations run before the profiler starts. Default 50000.
   *
   * **Both too short and too long were measured, and too long is the dangerous
   * one.** V8 tiers the operation up *during* the measured window if the warm-up
   * is short, and compiling optimised code allocates — attributed, correctly but
   * unhelpfully, to the frames being compiled. At 5000 that shows up as a
   * 3–10 kB reading in the first of three passes for operations that allocate
   * nothing. At 50000 every allocation-free operation measured reads exactly 0 in
   * every pass.
   *
   * At 200000 the **control** read 0 in one pass of three, which is the failure
   * that matters: a warm-up long enough to leave the operation's allocation
   * unsampled makes a real allocator look clean.
   * {@link allocationAllowanceFromControl} is what turns that into a loud
   * failure instead of a green run.
   */
  readonly warmup?: number;
  /**
   * Measurement passes; the **minimum** is reported. Default 3.
   *
   * The minimum, not the mean, because every source of error here is additive:
   * sampled bytes are never negative, and tier-up, another test's frames
   * inlined into these, and the profiler's own bookkeeping can only add. A
   * genuine per-call allocation is present in every pass — the control's minimum
   * over three passes is still ~115 kB — so taking the minimum does not hide
   * one.
   */
  readonly repeats?: number;
}

/**
 * Approximate heap bytes allocated by `op`, attributed by **call site** rather
 * than inferred from the heap's size over time.
 *
 * ## Why this replaced the `heapUsed`-sampling harness above
 *
 * That harness measured a process-wide quantity and divided it by this
 * operation's iteration count, so anything else allocating in the same process
 * during the loop was charged to the operation. Under the test runner that is
 * not a hypothetical: three to five of thirty allocation-free operations
 * reported exactly one returned object's worth of bytes, reproducibly to two
 * decimal places, **and the set changed when unrelated parts of the test file
 * changed** — `normalize` measured clean and `addScaled` dirty; after moving
 * five unrelated cases into a `todo` block, touching neither, they swapped.
 * That is BL-050, and it is a property of the instrument, not of the code.
 *
 * `HeapProfiler.startSampling` does not have that failure mode by
 * construction. It records a **stack trace** at sampled allocations, so every
 * byte is attributed to the code that allocated it; another test's garbage
 * lands under another test's frames and cannot reach this reading. The
 * measurement is also independent of when the collector runs, which is what
 * defeated the before/after delta.
 *
 * ## What the number is, and what it is not
 *
 * It is **not** bytes per operation, and calling it that would be the kind of
 * plausible-looking figure that is worse than no figure. The sampling profiler
 * under-reports absolute volume by roughly two orders of magnitude here: 200k
 * iterations of an operation allocating a ~47-byte object should total ~9.4 MB
 * and the profiler attributes ~90 KB. V8 samples allocation slow paths, and
 * young-generation allocation from optimised code mostly takes a bump-pointer
 * fast path, so most allocations are never sampled.
 *
 * That does not weaken the test, because the criterion is not a byte budget —
 * it is **allocates, or does not**. An operation that creates one object per
 * call is sampled hundreds of times over the window and reads tens of
 * thousands of bytes; one that creates none reads exactly zero. The measured
 * separation is total, not marginal, so the assertion has no threshold to tune:
 * see {@link assertInstrumentWorks} for how the tests calibrate against the
 * control in the same process rather than against a constant.
 *
 * ## The caveat carried over from the old harness, unchanged
 *
 * An allocation V8 removes by escape analysis reads as no allocation. That is
 * the right answer for this rule — an object that never reaches the heap is not
 * garbage on the per-frame path — but it means this measures observed heap
 * behaviour rather than source-level object creation. {@link keepAlive} and
 * {@link readRing} are still how the control makes its allocation genuinely
 * escape.
 */
export async function measureAttributedAllocation(
  op: (i: number) => void,
  options: AttributedAllocationOptions = {},
): Promise<AttributedAllocation> {
  const iterations = options.iterations ?? 200_000;
  const samplingInterval = options.samplingInterval ?? 1_024;
  const warmup = options.warmup ?? 50_000;
  const repeats = options.repeats ?? 3;

  const { Session } = await import('node:inspector');
  const session = new Session();
  session.connect();

  const post = <T>(method: string, params?: Record<string, unknown>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      // The typings for `Session.post` do not cover arbitrary domains, and
      // narrowing them here would be inventing a contract for a protocol this
      // module reads one field of.
      (session.post as (m: string, p: unknown, cb: (e: Error | null, r: T) => void) => void)(
        method,
        params ?? {},
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

  // Warm up outside the profiler, so compiling the operation and tiering it up
  // is not attributed to it. See `warmup` for what happens at either extreme.
  for (let i = 0; i < warmup; i++) op(i);

  await post('HeapProfiler.enable');

  let attributedBytes = Number.POSITIVE_INFINITY;
  let totalBytes = Number.POSITIVE_INFINITY;
  for (let pass = 0; pass < repeats; pass++) {
    await post('HeapProfiler.startSampling', { samplingInterval });
    runMeasuredLoop(op, iterations);
    const { profile } = await post<{ profile: { head: SamplingProfileNode } }>(
      'HeapProfiler.stopSampling',
    );

    let total = 0;
    let attributed = 0;
    const walk = (node: SamplingProfileNode, insideLoop: boolean): void => {
      const inside = insideLoop || node.callFrame.functionName === MEASURED_LOOP_NAME;
      const self = node.selfSize ?? 0;
      total += self;
      if (inside) attributed += self;
      for (const child of node.children ?? []) walk(child, inside);
    };
    walk(profile.head, false);

    // The two minima are taken independently and deliberately: `totalBytes` is a
    // sanity figure about the process, not a component of the reading, so
    // pairing it with the pass that happened to minimise `attributed` would
    // report a total that never co-occurred with anything.
    if (attributed < attributedBytes) attributedBytes = attributed;
    if (total < totalBytes) totalBytes = total;
  }

  await post('HeapProfiler.disable');
  session.disconnect();

  return { attributedBytes, totalBytes, iterations };
}

/** The shape of `HeapProfiler.stopSampling`'s call tree that this module reads. */
interface SamplingProfileNode {
  readonly callFrame: { readonly functionName?: string };
  readonly selfSize?: number;
  readonly children?: readonly SamplingProfileNode[];
}

/**
 * The name attribution keys on. A named function declaration rather than an
 * inline loop, so the frame is findable in the profile and cannot be renamed by
 * accident without this constant going stale — which
 * {@link assertInstrumentWorks} would catch, since the control's allocations
 * would then attribute to nothing.
 */
const MEASURED_LOOP_NAME = 'runMeasuredLoop';

function runMeasuredLoop(op: (i: number) => void, iterations: number): void {
  for (let i = 0; i < iterations; i++) op(i);
}

/**
 * Fails unless the instrument demonstrably works in *this* process, and returns
 * the allowance an operation must come in under.
 *
 * ## Why the tests calibrate instead of comparing against a constant
 *
 * The absolute figures move with the machine, the Node version and how much V8
 * chose to inline, and BL-050's first dead end was a harness whose signal was
 * always zero — which passes every case, including the ones that should fail.
 * A constant threshold cannot tell "this operation allocates nothing" from "the
 * profiler recorded nothing". So the control is measured **in the same process,
 * in the same run**, and the allowance is derived from it.
 *
 * Two things are asserted here rather than assumed:
 *
 * 1. the control's attributed bytes are large — if a deliberate per-call
 *    allocator does not light up, nothing downstream means anything;
 * 2. the allowance is a hundredth of that, so an operation allocating one
 *    object per call cannot come in under it. The measured separation is total
 *    (control tens of thousands of bytes, allocation-free operations exactly
 *    zero), so a factor of 100 is not a tuned threshold sitting between two
 *    close numbers — it is slack in the middle of a two-order-of-magnitude gap,
 *    there so a single stray sample landing in an operation's frames is not a
 *    failure.
 *
 * @param controlBytes `attributedBytes` from measuring a deliberate allocator.
 * @returns The maximum `attributedBytes` an allocation-free operation may report.
 */
export function allocationAllowanceFromControl(controlBytes: number): number {
  if (!(controlBytes >= 10_000)) {
    throw new Error(
      `allocationHarness: the control allocated one object per call and the profiler attributed ` +
        `only ${String(controlBytes)} bytes to it. Below ~10000 the instrument is not resolving a real ` +
        `allocator, so every "allocates nothing" result in this run would be meaningless. ` +
        `Check samplingInterval (65536 is too coarse and reports 0 for the control) and that ` +
        `MEASURED_LOOP_NAME still matches the loop function's name.`,
    );
  }
  return controlBytes / 100;
}
