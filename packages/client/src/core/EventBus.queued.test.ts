import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { EventBus } from '@core/EventBus';
import { noop, type TestEvents } from '@core/EventBus.testFixtures';
import {
  allocationAllowanceFromControl,
  keepAlive,
  measureAttributedAllocation,
  readRing,
} from '@core/math/allocationHarness';

/**
 * `EventBus` queued mode (`04` §4.4) and BL-006's criterion 2 — no allocation
 * per emit for an event nobody is listening to.
 *
 * The allocation criterion is measured against a control rather than against a
 * constant, because a bytes-per-op figure means nothing without knowing what
 * this runtime charges for an empty loop; `allocationHarness.ts` owns that
 * machinery.
 *
 * Type safety and the subscribe/unsubscribe cases are in `EventBus.test.ts`;
 * the shared event map is in `EventBus.testFixtures.ts`. Split by BL-069 to get
 * under the 500-line hard limit.
 */

describe('EventBus: queued mode (04 §4.4)', () => {
  it('enqueue does not call handlers; drain does', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    bus.on('tick:done', (n) => seen.push(n));

    bus.enqueue('tick:done', 1);
    bus.enqueue('tick:done', 2);
    assert.deepEqual(seen, [], 'nothing runs until the defined drain point');
    assert.equal(bus.queuedCount, 2);

    assert.equal(bus.drain(), 2);
    assert.deepEqual(seen, [1, 2], 'FIFO');
    assert.equal(bus.queuedCount, 0);
  });

  it('drains mixed event types in enqueue order', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    bus.on('tick:done', (n) => seen.push(`tick:${n}`));
    bus.on('resource:harvested', (p) => seen.push(`node:${p.node}`));

    bus.enqueue('tick:done', 1);
    bus.enqueue('resource:harvested', { node: 4 });
    bus.enqueue('tick:done', 2);
    bus.drain();
    assert.deepEqual(seen, ['tick:1', 'node:4', 'tick:2']);
  });

  it('an event enqueued by a handler waits for the next drain', () => {
    // The bounded-batch rule. Without it a handler that re-enqueues its own
    // event never terminates, and the number of events a tick processes would
    // depend on handler behaviour rather than on the tick.
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    bus.on('tick:done', (n) => {
      calls++;
      if (n < 3) bus.enqueue('tick:done', n + 1);
    });

    bus.enqueue('tick:done', 1);
    assert.equal(bus.drain(), 1);
    assert.equal(calls, 1);
    assert.equal(bus.queuedCount, 1, 'the re-enqueued event is held for the next drain');

    assert.equal(bus.drain(), 1);
    assert.equal(calls, 2);
    assert.equal(bus.drain(), 1);
    assert.equal(calls, 3);
    assert.equal(bus.drain(), 0, 'and it terminates');
  });

  it('draining with nothing queued is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    assert.equal(bus.drain(), 0);
  });

  it('queued events with no subscriber are consumed, not left in the queue', () => {
    const bus = new EventBus<TestEvents>();
    bus.enqueue('tick:done', 1);
    assert.equal(bus.drain(), 1);
    assert.equal(bus.queuedCount, 0);
  });

  it('refuses a re-entrant drain', () => {
    const bus = new EventBus<TestEvents>();
    bus.on('tick:done', () => {
      bus.drain();
    });
    bus.enqueue('tick:done', 1);
    assert.throws(() => bus.drain(), /must not be re-entered/);
    // The failed drain still cleared its own batch rather than leaving the
    // bus wedged.
    assert.equal(bus.queuedCount, 0);
  });

  it('clear drops handlers and queued events, and refuses to run inside a handler', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    bus.on('tick:done', () => {
      calls++;
    });
    bus.enqueue('tick:done', 1);
    bus.clear();
    assert.equal(bus.queuedCount, 0);
    assert.equal(bus.handlerCount('tick:done'), 0);
    bus.emit('tick:done', 0);
    assert.equal(calls, 0);

    const other = new EventBus<TestEvents>();
    other.on('tick:done', () => {
      other.clear();
    });
    assert.throws(() => {
      other.emit('tick:done', 0);
    }, /must not be called from inside a handler/);
  });
});

describe('EventBus: no allocation per emit for zero-subscriber events (criterion 2)', () => {
  /**
   * Derived from a control measured in this same process, exactly as
   * `core/math/allocation.test.ts` does. A constant threshold cannot tell
   * "this path allocates nothing" from "the profiler recorded nothing", and
   * the latter passes everything — see BL-050.
   */
  let allowance = Number.NaN;

  /**
   * Passed to every measurement below, and the reason is measured rather than
   * defensive.
   *
   * `allocationAllowanceFromControl` returns `control / 100`, and on this
   * machine the control reads **77k–94k** across runs, so the allowance lands
   * at **773–944 bytes — below the profiler's 1024-byte sampling interval**.
   * One stray sample landing anywhere in the measured frames is therefore
   * 1024 bytes and fails an assertion whose true reading is exactly 0. That is
   * not hypothetical: the first run of this file failed here once and then
   * passed 13 consecutive runs, which is what sent me looking.
   *
   * `attributedBytes` is the **minimum** across passes, so raising `repeats`
   * requires the stray to recur in every one of them. This strengthens the
   * statistic rather than loosening the threshold — a real allocator reads
   * tens of thousands of bytes in *every* pass and is still caught by a
   * minimum. Filed as **BL-057**, because the same arithmetic applies to
   * `core/math/allocation.test.ts` and the harness's own guard does not cover
   * it.
   */
  const REPEATS = { repeats: 6 } as const;

  before(async () => {
    const control = await measureAttributedAllocation((i) => {
      keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
    });
    allowance = allocationAllowanceFromControl(control.attributedBytes);
    assert.ok(readRing() > 0, 'the escape ring holds nothing, so the control did not allocate');
  });

  it('emit with no subscribers attributes zero bytes', async () => {
    const bus = new EventBus<TestEvents>();
    const { attributedBytes, totalBytes, iterations } = await measureAttributedAllocation(() => {
      bus.emit('tick:done', 1);
    }, REPEATS);
    assert.ok(
      attributedBytes <= allowance,
      `zero-subscriber emit attributed ${attributedBytes} bytes over ${iterations} calls ` +
        `(allowance ${allowance}, process total in the same window ${totalBytes})`,
    );
  });

  it('emit with no subscribers is still zero once a handler has come and gone', async () => {
    // The path after unsubscribe compacted the list away, which is a
    // different Map state from "never subscribed" and has to be measured
    // rather than assumed.
    const bus = new EventBus<TestEvents>();
    bus.on('tick:done', noop)();
    const { attributedBytes, totalBytes } = await measureAttributedAllocation(() => {
      bus.emit('tick:done', 1);
    }, REPEATS);
    assert.ok(
      attributedBytes <= allowance,
      `post-unsubscribe emit attributed ${attributedBytes} bytes (allowance ${allowance}, ` +
        `process total ${totalBytes})`,
    );
  });

  it('emit with a subscriber allocates nothing either, given a non-allocating handler', async () => {
    // Not an acceptance criterion, but the interesting one for the tick: if
    // dispatch allocated per emit, every event on the 30 Hz path would be
    // garbage. A primitive payload keeps the handler itself out of the way.
    const bus = new EventBus<TestEvents>();
    let sink = 0;
    bus.on('tick:done', (n) => {
      sink += n;
    });
    const { attributedBytes, totalBytes } = await measureAttributedAllocation((i) => {
      bus.emit('tick:done', i);
    }, REPEATS);
    assert.ok(sink > 0, 'the handler ran');
    assert.ok(
      attributedBytes <= allowance,
      `one-subscriber emit attributed ${attributedBytes} bytes (allowance ${allowance}, ` +
        `process total ${totalBytes})`,
    );
  });
});
