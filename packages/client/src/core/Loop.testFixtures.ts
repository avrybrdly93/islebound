/**
 * Fixtures for BL-008's loop tests: a clock and a frame scheduler a test
 * drives by hand.
 *
 * `05` §1 has no home for test-only helpers, so these live beside the module
 * under test in the `.testFixtures.ts` shape `World.testFixtures.ts`,
 * `EventBus.testFixtures.ts` and `Rng.testFixtures.ts` established. They are
 * shared because BL-008's criteria split across two suites — the rate cases
 * and the guard cases — and two copies of a clock would let a divergence
 * between them read as a finding.
 *
 * ## Timestamps are computed from the frame index, never accumulated
 *
 * {@link ManualHost.runFrames} sets each frame's timestamp to
 * `start + i * intervalMs` rather than adding `intervalMs` to a running total.
 * At 144 fps the interval is 6.944… ms and 1440 additions of it do not land on
 * 10000; computing from the index makes the *harness* exact so that any drift
 * the test measures belongs to the loop. This mattered: the first draft
 * accumulated, and the three frame rates then disagreed by a step for a reason
 * that had nothing to do with the loop.
 */

import type { FrameScheduler, LoopClock } from '@core/Loop';

/**
 * A clock and a scheduler under a test's control.
 *
 * Time only moves when the test moves it. Frames only fire when the test fires
 * them. Nothing here reads a real clock, so a suite runs in microseconds and
 * gives the same answer on a loaded container as on an idle one.
 */
export class ManualHost {
  /** Current time in milliseconds. Read by {@link clock}. */
  nowMs = 0;

  /** Handles issued, so a cancel of a stale handle is distinguishable from a live one. */
  private nextHandle = 1;

  /**
   * Every outstanding request, in the order they were made.
   *
   * **A single slot is not enough, and a surviving mutant is how that was
   * found.** The first version of this fixture held one pending callback and
   * let a second `request` overwrite it — which made `Loop.start()`'s
   * idempotence untestable, because the double chain of frames a
   * non-idempotent `start` creates collapsed back into one inside the
   * fixture. The mutant that removed the guard passed every case. A real
   * `requestAnimationFrame` queues each request and fires each one once, so
   * this does too.
   */
  private pending: { handle: number; callback: (timestampMs: number) => void }[] = [];

  /** How many times {@link FrameScheduler.cancel} has been called. */
  cancels = 0;

  readonly clock: LoopClock = {
    now: () => this.nowMs,
  };

  readonly scheduler: FrameScheduler = {
    request: (callback) => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.pending.push({ handle, callback });
      return handle;
    },
    cancel: (handle) => {
      this.cancels += 1;
      // Tolerates a handle that already fired, as the interface requires: a
      // cancel of a handle that is not outstanding is a no-op rather than an
      // error, so `stop()` after the last frame behaves like the browser's.
      this.pending = this.pending.filter((entry) => entry.handle !== handle);
    },
  };

  /** Whether any frame is scheduled. `false` once the loop has been stopped. */
  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** How many requests are outstanding. More than one means more than one chain of frames. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Fires the pending frame at `nowMs`, having first advanced the clock by
   * `deltaMs`.
   *
   * Throws rather than no-oping when nothing is pending: a test that expects a
   * frame and gets silence should fail at the line that expected it.
   */
  fire(deltaMs: number): void {
    this.nowMs += deltaMs;
    this.fireAt(this.nowMs);
  }

  /**
   * Fires every outstanding frame with an explicit timestamp, and sets the
   * clock to it.
   *
   * The queue is taken and cleared *before* the first callback runs: the loop
   * re-requests from inside its own callback, and a request made during this
   * frame belongs to the next one.
   */
  fireAt(timestampMs: number): void {
    const due = this.pending;
    if (due.length === 0) {
      throw new Error('ManualHost.fireAt: no frame is pending');
    }
    this.pending = [];
    this.nowMs = timestampMs;
    for (const entry of due) {
      entry.callback(timestampMs);
    }
  }

  /**
   * Fires `count` frames spaced `intervalMs` apart, timestamps computed from
   * the index. Returns the last timestamp.
   *
   * The first frame lands at `startMs` (default: the current `nowMs`), which
   * is the frame the loop takes no step on — it has no previous timestamp to
   * measure a delta from.
   */
  runFrames(count: number, intervalMs: number, startMs = this.nowMs): number {
    let last = startMs;
    for (let i = 0; i < count; i += 1) {
      last = startMs + i * intervalMs;
      this.fireAt(last);
    }
    return last;
  }
}

/** Counts calls and records the arguments the loop passed. */
export function recordingStep(): { fn: (dt: number) => void; calls: number[] } {
  const calls: number[] = [];
  return {
    fn: (dt) => {
      calls.push(dt);
    },
    calls,
  };
}

/** Counts renders and records every `alpha` the loop passed. */
export function recordingRender(): { fn: (alpha: number) => void; alphas: number[] } {
  const alphas: number[] = [];
  return {
    fn: (alpha) => {
      alphas.push(alpha);
    },
    alphas,
  };
}
