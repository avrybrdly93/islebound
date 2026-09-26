import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import {
  assertInstrumentResolvesSparseAllocator,
  createAllocator,
  MIN_SPARSE_TO_ALLOWANCE_RATIO,
  readSink,
  SPARSE_ALLOCATION_PERIOD,
} from '@core/math/allocationControls';
import {
  DEFAULT_SAMPLING_INTERVAL,
  MAX_STRAY_SAMPLES,
  measureAttributedAllocation,
  readRing,
  strayAllocationAllowance,
} from '@core/math/allocationHarness';

/**
 * BL-078: **the allocation boundary can now see an operation that allocates
 * rarely, and this file is what says so on every run.**
 *
 * BL-074 left the boundary able to separate "allocates once per call" from "one
 * stray sample landed in these frames" and *not* able to separate "once per
 * call" from "once per thousand calls": at the old sampling interval of 1024
 * that case read 4224–11 648 bytes against an allowance of 4096, so it was
 * caught on most runs and not all. An operation allocating that rarely still
 * violates `CLAUDE.md`'s no-allocation-in-per-frame-paths rule, and "most runs"
 * is indistinguishable from "clean" to whoever reads the green suite.
 *
 * **What this file is not.** It is not a re-measurement of BL-078's tables —
 * those are in `allocationControls.ts`'s header and in
 * `34_DEVELOPMENT_LOG.md` 2026-09-26. It is the assertion that the instrument
 * *in this process, in this run* still resolves a sparse allocator, which is
 * the repository's standing lesson that a rule stated and not checked is the
 * defect it keeps producing (BL-077 through BL-084).
 */

const allowance = strayAllocationAllowance();

/** One object per 1000 calls: BL-078's criterion, measured once for the whole file. */
let sparseBytes = Number.NaN;
/** The same factory at period 1 — the per-call control, for the ordering case below. */
let perCallBytes = Number.NaN;
/** An operation that allocates nothing, so BL-074's direction is checked at the new interval. */
let cleanBytes = Number.NaN;

let scratchSum = 0;

describe('BL-078: the boundary sees a sparse allocator', () => {
  before(async () => {
    sparseBytes = (await measureAttributedAllocation(createAllocator(SPARSE_ALLOCATION_PERIOD)))
      .attributedBytes;
    perCallBytes = (await measureAttributedAllocation(createAllocator(1))).attributedBytes;
    cleanBytes = (
      await measureAttributedAllocation((i) => {
        scratchSum = i * 2 + 1;
      })
    ).attributedBytes;
  });

  it('catches one allocation per thousand calls, well clear of the stray allowance', () => {
    // Criterion 1. The margin, not merely the sign: a reading one interval above
    // the allowance would pass this on the run that measured it and fail on the
    // next, which is the state BL-078 was filed to end.
    assertInstrumentResolvesSparseAllocator(sparseBytes, allowance);
    assert.ok(
      sparseBytes >= allowance * MIN_SPARSE_TO_ALLOWANCE_RATIO,
      `the sparse control attributed ${sparseBytes} bytes against an allowance of ${allowance}; ` +
        `BL-078 needs at least ${allowance * MIN_SPARSE_TO_ALLOWANCE_RATIO}`,
    );
  });

  it('still reports an allocation-free operation as clean, which is BL-074', () => {
    // Criterion 2, and the risk this change carries: the interval got finer, and
    // a finer interval is the direction in which noise leaks in — at 16 an
    // allocation-free operation read 904 bytes. This asserts the new default is
    // not in that regime.
    assert.ok(
      cleanBytes <= allowance,
      `plain arithmetic attributed ${cleanBytes} bytes at interval ` +
        `${DEFAULT_SAMPLING_INTERVAL} (allowance ${allowance}); BL-074's failure is back`,
    );
  });

  it('still resolves a per-call allocator far above the sparse one, which is criterion 3', () => {
    // The ordering is the point, and it is why both controls come from ONE
    // factory differing only in period: if the sparse fixture were separate code,
    // "it reads lower" would be consistent with the two allocating different
    // things, and this suite would be measuring its own fixtures.
    assert.ok(
      perCallBytes > sparseBytes,
      `the per-call control (${perCallBytes}) did not read above the sparse one ` +
        `(${sparseBytes}); the factory is not resolving sparsity at all`,
    );
    assert.ok(
      perCallBytes >= allowance * 8,
      `the per-call control read ${perCallBytes} against an allowance of ${allowance}`,
    );
  });

  it('refuses to proceed from a sparse control that read low', () => {
    // The guard's failing direction as a test rather than as a comment, the
    // standard `assertInstrumentResolvesControl` is already held to. The failure
    // it guards is a later edit coarsening the interval back for speed: that is
    // the plausible one, because the setting BL-078 depends on is the slow one.
    const required = allowance * MIN_SPARSE_TO_ALLOWANCE_RATIO;
    assert.throws(() => {
      assertInstrumentResolvesSparseAllocator(0, allowance);
    }, /every run rather than most/);
    assert.throws(() => {
      assertInstrumentResolvesSparseAllocator(required - 1, allowance);
    }, /every run rather than most/);
    assert.doesNotThrow(() => {
      assertInstrumentResolvesSparseAllocator(required, allowance);
    });
  });

  it('asks less of the sparse control than of the per-call one, deliberately', () => {
    // A sparse allocator allocates a thousandth as often and must read lower;
    // asking the per-call factor of it would be asking it to stop being sparse.
    // Pinned so a later "consistency" edit cannot quietly raise it.
    //
    // EXPRESSED IN BYTES RATHER THAN AS A BARE COMPARISON OF THE CONSTANT, and
    // that is forced rather than chosen: `MIN_SPARSE_TO_ALLOWANCE_RATIO < 8` is
    // foldable by TypeScript, so BL-083's type-aware rules reject it as an
    // unnecessary condition -- rightly, an assertion the compiler can prove is
    // not one -- and annotating the constant `: number` to widen it is then
    // rejected by `no-inferrable-types`. Multiplying by the allowance is
    // un-foldable AND is the unit the thresholds are applied in.
    const sparseRequirement = allowance * MIN_SPARSE_TO_ALLOWANCE_RATIO;
    assert.ok(
      sparseRequirement < allowance * 8,
      `the sparse requirement ${sparseRequirement} must stay below the per-call control's ` +
        `${allowance * 8}`,
    );
    assert.ok(sparseRequirement >= allowance * 2, 'a ratio under 2 is not a gap');
    // And it has to clear the stray allowance by more than a single sample,
    // which is the property BL-074 found missing in its own boundary.
    assert.ok(sparseRequirement > allowance + DEFAULT_SAMPLING_INTERVAL);
  });

  it('rejects a period that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => createAllocator(bad), /positive integer/);
    }
    assert.doesNotThrow(() => createAllocator(1));
  });

  it('gives each allocator its own counter, so two measurements cannot share a phase', () => {
    const a = createAllocator(2);
    const b = createAllocator(2);
    // `a` is advanced to its allocating call; `b` must be unaffected. Without
    // per-closure state the two would step together and a second measurement in
    // one run would read a different phase of the first.
    const ringBefore = readRing();
    a(1);
    a(1);
    assert.notEqual(
      readRing(),
      ringBefore,
      'the first allocator did not reach its allocating call',
    );
    const ringAfterA = readRing();
    b(1);
    assert.equal(readRing(), ringAfterA, 'the second allocator allocated on its first call');
  });

  it('left both sinks non-zero, so nothing measured here was dead code', () => {
    // The lesson `allocationHarness.ts` records: an unread ring lets V8 remove
    // the store and then the object, and the control silently measures nothing
    // while appearing to pass. The arithmetic branch needs the same treatment.
    assert.ok(readRing() > 0, 'the escape ring holds nothing, so nothing actually escaped');
    assert.ok(readSink() !== 0, 'the arithmetic branch was eliminated as dead code');
    assert.ok(scratchSum !== 0, 'the clean operation was eliminated as dead code');
  });

  it('the stray allowance is unchanged by BL-078, which is how criterion 2 is met', () => {
    // BL-078's whole claim is that it closed the sparse case WITHOUT moving this
    // number. If a later change achieves the same by raising it, that is
    // BL-074 coming back and this assertion is where it is caught.
    assert.equal(MAX_STRAY_SAMPLES, 4);
    assert.equal(allowance, DEFAULT_SAMPLING_INTERVAL * MAX_STRAY_SAMPLES);
  });
});
