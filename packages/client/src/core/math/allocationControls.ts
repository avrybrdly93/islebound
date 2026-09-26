/**
 * The allocating fixtures the allocation tests measure themselves against, and
 * the assertion that the instrument can resolve a *sparse* one (BL-078).
 *
 * ## Why this is a separate module
 *
 * `allocationHarness.ts` sits at 496 of its 500 allowed lines (decision 0034),
 * so BL-078 needed a seam rather than a paragraph. The split is not only a line
 * count, though: the harness is the instrument, and this is the set of known
 * signals used to decide whether the instrument is working. Keeping them apart
 * makes it possible to say which file a failure is about.
 *
 * ## The two controls come from one factory, deliberately
 *
 * {@link createAllocator} produces both the per-call control and the sparse one,
 * differing **only** in `period`. If they were two hand-written closures, a
 * finding like "the sparse one reads much less" would be consistent with the two
 * fixtures allocating different things, and the conclusion drawn from it would
 * be about the fixtures rather than about sparsity. One factory removes that
 * reading.
 *
 * ## What BL-078 established, and the mechanism the harness points here for
 *
 * A stray sample weighs one `samplingInterval`, so `strayAllocationAllowance`'s
 * four intervals are **four samples at any interval**. The reading a sparse
 * allocator produces, in *bytes*, is very nearly independent of the interval —
 * about 18 kB at 1024, 256 and 64 alike on this container, because the sampling
 * profiler's attribution saturates far below true allocated volume. So a finer
 * interval multiplies the sparse allocator's **sample** count while leaving the
 * stray tolerance at four samples. That is what made the interval the right knob
 * and `MAX_STRAY_SAMPLES` the wrong one, and it is why the fix closed BL-078
 * without moving the number BL-074 had established.
 *
 * Measured on this container over 20 runs, at the interval that is now the
 * default (256) against the one that was (1024):
 *
 * | | interval 1024 | interval 256 |
 * |---|---|---|
 * | sparse 1-in-1000, in intervals | 6.3 – 22.0 | 58.9 – 79.1 |
 * | sparse 1-in-1000, min ÷ allowance | 1.6× | 14.7× |
 * | allocation-free | 0 in 20 of 20 | 0 in 20 of 20 |
 * | per-call control, min ÷ allowance | 19.6× | 87.3× |
 * | cost per measurement | 72 ms | 178 ms |
 *
 * **One decade further out is still open**: 1 in 10 000 reads 4.9 – 9.8 intervals
 * at the current default, so it is caught on most runs and not all — the same
 * shape BL-078 closed. Filed as its own backlog item rather than attempted here,
 * because the next factor of four costs 384 ms a measurement (interval 64).
 *
 * `34_DEVELOPMENT_LOG.md` 2026-09-26 carries the rest, including the axis that
 * was measured and rejected.
 */

import { keepAlive } from '@core/math/allocationHarness';

/** Sink for the non-allocating branch, so its arithmetic is not dead code. */
let sink = 0;

/** Reads {@link sink}, so the writes into it are not dead code either. */
export function readSink(): number {
  return sink;
}

/**
 * An operation that allocates one small object every `period` calls and does
 * plain arithmetic otherwise.
 *
 * `period` of 1 is the per-call control the allocation tests have always used;
 * 1000 is the sparse case BL-078 is about. Each call returns a **fresh**
 * closure with its own counter, so two measurements in one run cannot share a
 * phase.
 *
 * The allocated object is three fractional fields, matching what the maths
 * operations return, and it escapes through `keepAlive` — without an escape V8
 * removes it and the control passes for the wrong reason, which
 * `allocationHarness.ts` records as having actually happened.
 *
 * The body is a statement and the closure returns `void`: a returned double
 * crossing a non-inlined call boundary is boxed, which the harness measured at
 * 6.2 bytes/op of pure instrument overhead.
 */
export function createAllocator(period: number): (i: number) => void {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(`createAllocator: period must be a positive integer, got ${String(period)}`);
  }
  let calls = 0;
  return (i: number): void => {
    calls += 1;
    if (calls % period === 0) keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
    else sink += i * 0.5;
  };
}

/** The period the sparse control allocates at: one object per thousand calls, which is BL-078's criterion. */
export const SPARSE_ALLOCATION_PERIOD = 1_000;

/**
 * The factor by which a **sparse** allocator's reading must exceed the
 * allowance for the boundary to be called able to see one.
 *
 * Four. Measured on this container over 20 runs at the default interval: the
 * sparse control reads **58.9 – 79.1** sampling intervals against an allowance
 * of 4, so the true factor is 14.7 – 19.8×. Requiring 4 leaves room for a
 * machine whose profiler attributes less — BL-074's reference container read
 * the same fixture about a quarter as loudly, which scaled to this interval
 * would be 16.4 – 45.6 intervals and a factor of 4.1× — without admitting a
 * reading that has stopped separating from the stray allowance at all.
 *
 * It is deliberately far below `MIN_CONTROL_TO_ALLOWANCE_RATIO`'s 8: a
 * sparse allocator allocates a thousandth as often as the control and **must**
 * read lower. Asking the same factor of both would be asking the sparse case to
 * stop being sparse.
 *
 * **A bound on this constant cannot be asserted against a bare literal, and the
 * tests express it in bytes for that reason.** `MIN_SPARSE_TO_ALLOWANCE_RATIO < 8`
 * is a comparison TypeScript can fold, so the type-aware rule BL-083 wired up
 * rejects it as an unnecessary condition — correctly, since an assertion the
 * compiler can prove says nothing about what could change. Annotating `: number`
 * to widen it is then rejected by `no-inferrable-types`. So
 * `allocationControls.test.ts` asserts the bounds **multiplied by the allowance**,
 * which is both un-foldable and the unit the thresholds are actually applied in.
 */
export const MIN_SPARSE_TO_ALLOWANCE_RATIO = 4;

/**
 * Fails unless the instrument resolves a *sparse* allocator in **this** process
 * — BL-078's first acceptance criterion, as a test rather than as a measurement
 * somebody once took.
 *
 * ## Why this is a second control and not a tightening of the first
 *
 * `assertInstrumentResolvesControl` establishes that a per-call allocator lights
 * up far above the allowance. That says nothing about an operation allocating
 * once per thousand calls, which is still a violation of `CLAUDE.md`'s
 * no-allocation-in-per-frame-paths rule and which the instrument could not
 * reliably see before BL-078: at interval 1024 the sparse reading's floor sat a
 * hair above the allowance, so such an operation was caught on most runs and not
 * all. "Most runs" is indistinguishable from "clean" to the session reading a
 * green suite.
 *
 * The failure this guards is therefore not "the profiler recorded nothing" — the
 * per-call control covers that — but the narrower one of the interval, the
 * warm-up or the iteration count drifting back to a setting where only a gross
 * allocator shows up. That is a plausible future edit, because the finer
 * interval this assertion depends on is the slower one.
 *
 * @param sparseBytes `attributedBytes` from measuring {@link createAllocator} at
 *   {@link SPARSE_ALLOCATION_PERIOD}.
 * @param allowance The allowance from `strayAllocationAllowance`.
 */
export function assertInstrumentResolvesSparseAllocator(
  sparseBytes: number,
  allowance: number,
): void {
  const required = allowance * MIN_SPARSE_TO_ALLOWANCE_RATIO;
  if (!(sparseBytes >= required)) {
    throw new Error(
      `allocationControls: the sparse control allocated one object per ` +
        `${String(SPARSE_ALLOCATION_PERIOD)} calls and the profiler attributed only ` +
        `${String(sparseBytes)} bytes to it, against an allowance of ${String(allowance)} which ` +
        `needs at least ${String(required)} for a rarely-allocating operation to be caught on ` +
        `every run rather than most (BL-078). The boundary still separates a per-call allocator, ` +
        `so the likely cause is a coarser samplingInterval, a shorter measured window, or a ` +
        `longer warmup than the defaults this figure was measured at.`,
    );
  }
}
