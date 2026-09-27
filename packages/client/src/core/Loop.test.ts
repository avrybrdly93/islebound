import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DT, MAX_CATCH_UP_STEPS, MAX_FRAME_DELTA, createLoop, type LoopEvents } from '@core/Loop';
import { ManualHost, recordingRender, recordingStep } from '@core/Loop.testFixtures';

/**
 * BL-008's criteria 1 and 3, plus the interpolation factor and the timing
 * instrumentation. Criterion 2 and the lifecycle are in `Loop.guards.test.ts`,
 * split to stay under `06`'s 500-line hard limit.
 *
 * **Criterion 1 is a claim about two frame rates at once, so it is tested that
 * way.** A suite that ran 60 fps for ten seconds and asserted 300 steps would
 * pass on a loop that simply counted frames and divided by two. The cases
 * below run three rates over the *same* simulated wall interval and assert the
 * step counts are equal to each other as well as to the exact answer, which is
 * what "regardless of render rate" says.
 *
 * That framing found the defect this task's implementation exists to avoid:
 * `04` §4.1's `acc += delta` form returns **299** at 30 and 60 fps and 300 at
 * 144 over the same ten seconds, because summing deltas accumulates rounding
 * and does it faster the more deltas there are. See decision 0041 and the
 * module comment.
 */

/** Builds a loop over a {@link ManualHost}, with the recorders attached. */
function harness() {
  const host = new ManualHost();
  const step = recordingStep();
  const render = recordingRender();
  const loop = createLoop({
    step: step.fn,
    render: render.fn,
    scheduler: host.scheduler,
    clock: host.clock,
  });
  const dropped: LoopEvents['sim:timeDropped'][] = [];
  loop.events.on('sim:timeDropped', (payload) => {
    dropped.push(payload);
  });
  return { host, step, render, loop, dropped };
}

const SECONDS = 10;
const RATES = [30, 60, 144];

describe('Loop — criterion 1: exactly 30 Hz regardless of render rate', () => {
  it('runs the same number of steps at 30, 60 and 144 fps over the same interval', () => {
    const counts = RATES.map((fps) => {
      const { host, step, loop } = harness();
      loop.start();
      // One extra frame so the last timestamp lands exactly on SECONDS: the
      // first frame establishes the epoch and takes no step.
      host.runFrames(fps * SECONDS + 1, 1000 / fps, 0);
      return step.calls.length;
    });

    assert.deepEqual(counts, [SECONDS * 30, SECONDS * 30, SECONDS * 30]);
    // Stated separately from the value: a future change that made all three
    // wrong in the same direction would still have to be deliberate.
    assert.equal(new Set(counts).size, 1, `rates disagreed: ${counts.join(', ')}`);
  });

  it('renders once per frame at every rate, and steps only as the clock earns them', () => {
    for (const fps of RATES) {
      const { host, step, render, loop } = harness();
      loop.start();
      const frames = fps * SECONDS + 1;
      host.runFrames(frames, 1000 / fps, 0);
      assert.equal(render.alphas.length, frames, `fps ${String(fps)}: one render per frame`);
      assert.equal(loop.stats.frames, frames);
      assert.equal(loop.stats.steps, step.calls.length);
    }
  });

  it('passes DT to every step, exactly, never a measured delta', () => {
    // `04` §4.1: "dt is a compile-time constant." A loop that passed the frame
    // delta would look correct at 30 fps and be wrong everywhere else, and
    // would make the simulation non-deterministic across machines.
    const { host, step, loop } = harness();
    loop.start();
    host.runFrames(7, 1000 / 12, 0);
    assert.ok(step.calls.length > 0, 'expected the 12 fps frames to earn steps');
    assert.deepEqual(new Set(step.calls), new Set([DT]));
  });

  it('takes no step on the first frame, because it has nothing to measure from', () => {
    const { host, step, render, loop } = harness();
    loop.start();
    host.fireAt(5000);
    assert.equal(step.calls.length, 0);
    // It still renders: something is on screen before the first tick rather
    // than one frame after it.
    assert.deepEqual(render.alphas, [0]);
    assert.equal(loop.stats.frames, 1);
  });

  it('does not owe the simulation the time between start() and the first frame', () => {
    // A page that starts the loop and then spends 300 ms mounting React must
    // not hand the simulation 300 ms of catch-up on its first frame.
    const { host, step, loop } = harness();
    host.nowMs = 300;
    loop.start();
    host.fireAt(300);
    host.fireAt(300 + 1000 / 60);
    assert.equal(step.calls.length, 0, 'one 60 fps frame has not earned a step');
    assert.equal(loop.stats.droppedFrames, 0);
    assert.equal(loop.stats.clampedFrames, 0);
  });

  it('keeps the step count exact over a long run rather than drifting', () => {
    // The regression case for decision 0041. At 60 fps the accumulator form
    // lost a step per ten seconds; over sixty it loses several, and nothing
    // reports it because no cap is hit and no clamp fires.
    const { host, step, loop } = harness();
    loop.start();
    host.runFrames(60 * 60 + 1, 1000 / 60, 0);
    assert.equal(step.calls.length, 60 * 30);
    assert.equal(loop.stats.droppedFrames, 0);
    assert.equal(loop.stats.clampedFrames, 0);
  });
});

describe('Loop — alpha is the interpolation factor 04 §4.1 asks for', () => {
  it('stays in [0, 1) on every frame of every rate', () => {
    for (const fps of RATES) {
      const { host, render, loop } = harness();
      loop.start();
      host.runFrames(fps * 2 + 1, 1000 / fps, 0);
      for (const alpha of render.alphas) {
        assert.ok(
          alpha >= 0 && alpha < 1,
          `fps ${String(fps)}: alpha ${String(alpha)} left [0, 1)`,
        );
      }
      assert.equal(loop.alpha, render.alphas.at(-1));
    }
  });

  it('is the fraction of a step the clock has earned but not spent', () => {
    // Half a step of wall time, at a rate that cannot spend it.
    const { host, step, render, loop } = harness();
    loop.start();
    host.fireAt(0);
    host.fireAt((DT / 2) * 1000);
    assert.equal(step.calls.length, 0);
    const half = render.alphas[1];
    assert.ok(half !== undefined);
    assert.ok(Math.abs(half - 0.5) < 1e-9, `alpha was ${String(half)}`);
    assert.ok(Math.abs(loop.alpha - 0.5) < 1e-9);
  });

  it('runs at 60 fps as alternating full and half steps, not two half steps', () => {
    // The shape a 2:1 render-to-sim ratio must produce: every second frame
    // earns a step and the ones between it carry alpha 0.5.
    const { host, render, loop } = harness();
    loop.start();
    host.runFrames(7, 1000 / 60, 0);
    const rounded = render.alphas.map((a) => Math.round(a * 2) / 2);
    assert.deepEqual(rounded, [0, 0.5, 0, 0.5, 0, 0.5, 0]);
    assert.equal(loop.stats.steps, 3);
  });
});

describe('Loop — criterion 3: sim:timeDropped when the cap is hit', () => {
  it('emits once, with the seconds and both step counts', () => {
    const { host, loop, dropped } = harness();
    loop.start();
    host.fireAt(0);
    // Ten seconds in one frame: clamped to MAX_FRAME_DELTA, which still demands
    // floor(0.25 / DT) = 7 steps against a cap of 5.
    host.fireAt(10_000);

    assert.equal(dropped.length, 1);
    const [event] = dropped;
    assert.ok(event !== undefined);
    assert.equal(event.stepsTaken, MAX_CATCH_UP_STEPS);
    assert.equal(event.stepsDemanded, Math.floor(MAX_FRAME_DELTA / DT));
    assert.ok(event.stepsDemanded > event.stepsTaken);
    assert.ok(Math.abs(event.seconds - (event.stepsDemanded - event.stepsTaken) * DT) < 1e-12);
    assert.equal(loop.stats.droppedFrames, 1);
    assert.ok(Math.abs(loop.stats.droppedSeconds - event.seconds) < 1e-12);
  });

  it('is not emitted on a frame that did not hit the cap', () => {
    // The assertion the criterion needs and does not state: an event that
    // fired every frame would satisfy "emitted when the cap is hit" too.
    const { host, loop, dropped } = harness();
    loop.start();
    // Four steps' worth in one frame — under the cap, over a normal frame.
    host.runFrames(20, (MAX_CATCH_UP_STEPS - 1) * DT * 1000, 0);
    assert.equal(dropped.length, 0);
    assert.equal(loop.stats.droppedFrames, 0);
    assert.equal(loop.stats.steps, 19 * (MAX_CATCH_UP_STEPS - 1));
  });

  it('fires after the frame it describes has been rendered', () => {
    // A handler reacting to the drop should see the frame already drawn, not
    // half-processed. Recorded because the ordering is not obvious from the
    // payload and a later refactor could invert it silently.
    const order: string[] = [];
    const host = new ManualHost();
    const loop = createLoop({
      step: () => {
        order.push('step');
      },
      render: () => {
        order.push('render');
      },
      scheduler: host.scheduler,
      clock: host.clock,
    });
    loop.events.on('sim:timeDropped', () => {
      order.push('dropped');
    });
    loop.start();
    host.fireAt(0);
    host.fireAt(10_000);
    assert.equal(order.at(-1), 'dropped');
    assert.equal(order.at(-2), 'render');
  });

  it('reports every dropped second exactly once across repeated overruns', () => {
    const { host, loop, dropped } = harness();
    loop.start();
    host.runFrames(6, MAX_FRAME_DELTA * 1000, 0);
    assert.equal(dropped.length, loop.stats.droppedFrames);
    const summed = dropped.reduce((total, event) => total + event.seconds, 0);
    assert.ok(Math.abs(summed - loop.stats.droppedSeconds) < 1e-12);
  });
});

describe('Loop — per-stage timing instrumentation', () => {
  it('charges step and render time to their own counters', () => {
    // The manual clock only moves when a callback moves it, so the numbers
    // below are exact rather than timing-dependent: this asserts the
    // attribution, which is the part that can be wrong.
    const host = new ManualHost();
    const loop = createLoop({
      step: () => {
        host.nowMs += 2;
      },
      render: () => {
        host.nowMs += 7;
      },
      scheduler: host.scheduler,
      clock: host.clock,
    });
    loop.start();
    host.fireAt(0);
    assert.equal(loop.stats.stepMs, 0, 'first frame takes no step');
    assert.equal(loop.stats.renderMs, 7);

    // Advance far enough past the first frame's render cost to earn two steps.
    host.fireAt(host.nowMs + 2 * DT * 1000);
    assert.equal(loop.stats.steps, 2);
    assert.equal(loop.stats.stepMs, 4);
    assert.equal(loop.stats.renderMs, 14);
  });

  it('returns a snapshot, not a live view', () => {
    const { host, loop } = harness();
    loop.start();
    host.runFrames(4, 1000 / 30, 0);
    const before = loop.stats;
    host.fire(1000 / 30);
    assert.notEqual(loop.stats.frames, before.frames);
    assert.equal(before.frames, 4);
  });
});
