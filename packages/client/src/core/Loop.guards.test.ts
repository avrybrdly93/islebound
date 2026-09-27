import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DT, MAX_CATCH_UP_STEPS, MAX_FRAME_DELTA, createLoop } from '@core/Loop';
import { ManualHost, recordingRender, recordingStep } from '@core/Loop.testFixtures';

/**
 * BL-008's criterion 2 — the tab-switch guard — and the loop's lifecycle.
 * Criteria 1 and 3 are in `Loop.test.ts`; split to stay under `06`'s 500-line
 * hard limit.
 *
 * **The clamp and the cap are two guards, and the criterion names one of
 * them.** "A 10-second tab switch does not produce a burst of catch-up ticks"
 * is satisfied by either alone, so a suite that only asserted the burst size
 * would pass with either deleted. These cases assert each guard's own effect
 * *and* that both fire on the tab-switch frame, because their numbers are
 * independent: any clamp below `MAX_CATCH_UP_STEPS * DT` (0.1667 s) makes the
 * cap dead code, and any cap above `MAX_FRAME_DELTA / DT` (7) makes the clamp
 * the only thing acting.
 */

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
  return { host, step, render, loop };
}

describe('Loop — criterion 2: a tab switch produces no burst', () => {
  it('spends at most MAX_CATCH_UP_STEPS on the frame after a 10-second gap', () => {
    const { host, step, loop } = harness();
    loop.start();
    host.runFrames(31, 1000 / 30, 0); // one ordinary second first
    const before = step.calls.length;

    host.fireAt(1000 + 10_000);

    assert.equal(step.calls.length - before, MAX_CATCH_UP_STEPS);
    assert.equal(loop.stats.clampedFrames, 1);
    assert.equal(loop.stats.droppedFrames, 1);
  });

  it('does not spread the burst over the frames that follow', () => {
    // The failure this rules out: a loop that carried the excess instead of
    // dropping it would take five steps per frame for the next sixty frames,
    // which is the same burst with a longer fuse.
    const { host, step, loop } = harness();
    loop.start();
    host.fireAt(0);
    host.fireAt(10_000);
    const afterGap = step.calls.length;

    // The frame immediately after the drop is the one that decides it. A loop
    // that kept the dropped time owes it here and takes three steps; one that
    // discarded it takes exactly one. Ten frames averaged to 1.2 steps in the
    // first version of this case, which a carrying loop also achieves — the
    // per-frame average was too blunt an instrument and a surviving mutant
    // said so.
    host.fireAt(10_000 + 1000 / 30);
    assert.equal(step.calls.length - afterGap, 1, 'the dropped time must not be owed');

    for (let i = 2; i <= 10; i += 1) {
      host.fireAt(10_000 + (i * 1000) / 30);
    }
    assert.equal(step.calls.length - afterGap, 10, 'and recovery stays at one step per frame');
    assert.equal(loop.stats.droppedFrames, 1, 'only the gap frame dropped');
  });

  it('clamps the gap to MAX_FRAME_DELTA, so the drop does not scale with the gap', () => {
    // Without the clamp, a ten-second gap would demand 300 steps and report
    // ~9.83 s dropped; with it, the demand is capped at what 0.25 s earns
    // whatever the gap was. Two very different gaps, one answer.
    const results = [10_000, 600_000].map((gapMs) => {
      const { host, loop } = harness();
      const dropped: number[] = [];
      loop.events.on('sim:timeDropped', (event) => {
        dropped.push(event.seconds);
      });
      loop.start();
      host.fireAt(0);
      host.fireAt(gapMs);
      return { dropped, stats: loop.stats };
    });

    const [tenSeconds, tenMinutes] = results;
    assert.ok(tenSeconds !== undefined && tenMinutes !== undefined);
    assert.equal(tenSeconds.dropped.length, 1);
    assert.deepEqual(tenSeconds.dropped, tenMinutes.dropped);
    const expected = (Math.floor(MAX_FRAME_DELTA / DT) - MAX_CATCH_UP_STEPS) * DT;
    const [seconds] = tenSeconds.dropped;
    assert.ok(seconds !== undefined);
    assert.ok(Math.abs(seconds - expected) < 1e-12);
  });

  it('leaves the two guards independently observable, which their numbers require', () => {
    // A guard document rather than a behaviour test, and it says so: these are
    // the inequalities that keep the other cases in this file meaningful. If
    // either constant moves, this fails first and names the reason.
    assert.ok(
      MAX_FRAME_DELTA > MAX_CATCH_UP_STEPS * DT,
      'the clamp must admit more than the cap can spend, or the cap is dead code',
    );
    assert.ok(
      Math.floor(MAX_FRAME_DELTA / DT) > MAX_CATCH_UP_STEPS,
      'a clamped frame must still exceed the cap, or the clamp is the only guard acting',
    );
  });

  it('clamps without dropping when the cap is not reached', () => {
    // The clamp's own effect, isolated: a gap wider than MAX_FRAME_DELTA on a
    // loop whose cap is large enough to absorb what the clamp admits would
    // still clamp. Here the cap is reached, so instead the case asserts the
    // clamp's bookkeeping is separate from the drop's — clampedFrames counts
    // the gap, droppedSeconds counts only the steps not taken.
    const { host, loop } = harness();
    loop.start();
    host.fireAt(0);
    host.fireAt(10_000);
    const stats = loop.stats;
    assert.equal(stats.clampedFrames, 1);
    // 9.75 s was clamped away; only the 2 unspendable steps are "dropped".
    assert.ok(stats.droppedSeconds < MAX_FRAME_DELTA, 'drop must not include the clamped gap');
  });

  it('ignores a timestamp that goes backwards instead of stalling on it', () => {
    // requestAnimationFrame timestamps have gone backwards in shipped
    // browsers. A negative delta admitted to the budget would stall the
    // simulation until the clock climbed back, with nothing reporting it.
    const frameMs = 1000 / 30;
    const { host, step, loop } = harness();
    loop.start();
    host.runFrames(61, frameMs, 0); // two ordinary seconds
    const afterForward = step.calls.length;
    assert.equal(afterForward, 60);

    // **A whole second backwards, not ten milliseconds.** A small jump does
    // not discriminate: the budget is `floor(elapsed / DT) - steps` clamped at
    // zero, so a jump under one step makes both the compensating and the
    // naive loop take no step on that frame and carry on identically. The
    // mutant that admitted a negative delta survived the first version of this
    // case for exactly that reason. A one-second jump stalls a naive loop for
    // the thirty frames it takes to climb back, with nothing reporting it.
    host.fireAt(1000);
    assert.equal(step.calls.length, afterForward, 'the backwards frame itself earns no step');

    for (let i = 1; i <= 10; i += 1) {
      host.fireAt(1000 + i * frameMs);
    }
    assert.equal(step.calls.length, afterForward + 10, 'and the loop does not stall afterwards');
    assert.equal(loop.stats.droppedFrames, 0);
    assert.equal(loop.stats.clampedFrames, 0);
  });
});

describe('Loop — lifecycle', () => {
  it('requests no frame until started, and none after stopping', () => {
    const { host, step, loop } = harness();
    assert.equal(host.hasPending, false);
    assert.equal(loop.running, false);

    loop.start();
    assert.equal(host.hasPending, true);
    assert.equal(loop.running, true);

    host.runFrames(31, 1000 / 30, 0);
    const taken = step.calls.length;
    loop.stop();
    assert.equal(host.hasPending, false);
    assert.equal(loop.running, false);
    assert.equal(step.calls.length, taken, 'stopping must not run a final step');
  });

  it('start is idempotent, so a double start cannot double the tick rate', () => {
    // Two chains of frames on one loop would step the simulation twice per
    // frame for as long as both lived. The request queue is where that shows
    // first, and asserting it is what makes this case catch the bug — a
    // fixture with one pending slot silently merged the two chains, and the
    // mutant that removed `start`'s guard passed. See `Loop.testFixtures.ts`.
    const { host, loop } = harness();
    loop.start();
    assert.equal(host.pendingCount, 1);
    loop.start();
    assert.equal(host.pendingCount, 1, 'a second start must not schedule a second chain');

    host.runFrames(31, 1000 / 30, 0);
    assert.equal(host.pendingCount, 1);
    assert.equal(loop.stats.frames, 31);
    assert.equal(loop.stats.steps, 30);
  });

  it('stop is idempotent and cancels exactly once', () => {
    const { host, loop } = harness();
    loop.start();
    host.fireAt(0);
    loop.stop();
    loop.stop();
    assert.equal(host.cancels, 1);
    assert.equal(loop.running, false);
  });

  it('does not owe the time it spent stopped when restarted', () => {
    // The same judgement the tab-switch clamp makes: a loop that was not
    // running was not falling behind.
    const { host, step, loop } = harness();
    loop.start();
    host.runFrames(31, 1000 / 30, 0);
    const taken = step.calls.length;
    loop.stop();

    host.nowMs += 60_000;
    loop.start();
    host.fireAt(host.nowMs);
    host.fireAt(host.nowMs + 1000 / 30);
    assert.equal(step.calls.length, taken + 1, 'one frame after restart earns one step');
    assert.equal(loop.stats.droppedFrames, 0);
    assert.equal(loop.stats.clampedFrames, 0);
  });

  it('keeps its counters across a stop and start', () => {
    const { host, loop } = harness();
    loop.start();
    host.runFrames(31, 1000 / 30, 0);
    const before = loop.stats;
    loop.stop();
    loop.start();
    host.fireAt(host.nowMs);
    assert.equal(loop.stats.frames, before.frames + 1);
    assert.equal(loop.stats.steps, before.steps);
  });

  it('keeps requesting frames when a callback throws', () => {
    // A throwing system must not silently end the session's loop. The
    // exception still propagates; the next frame is already requested.
    const host = new ManualHost();
    let calls = 0;
    let steps = 0;
    const loop = createLoop({
      step: () => {
        steps += 1;
      },
      render: () => {
        calls += 1;
        if (calls === 2) {
          throw new Error('render blew up');
        }
      },
      scheduler: host.scheduler,
      clock: host.clock,
    });
    loop.start();
    host.fireAt(0);
    assert.throws(() => {
      host.fireAt(1000 / 30);
    }, /render blew up/);
    assert.equal(host.hasPending, true, 'the next frame must already be requested');
    host.fireAt(2000 / 30);
    assert.equal(calls, 3);
    assert.ok(steps > 0, 'and the simulation is still stepping after the throw');
  });
});
