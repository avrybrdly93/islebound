import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { EventBus } from '@core/EventBus';
import {
  allocationAllowanceFromControl,
  keepAlive,
  measureAttributedAllocation,
  readRing,
} from '@core/math/allocationHarness';

/**
 * BL-006's three acceptance criteria, plus the queued mode `04` §4.4 asks for.
 *
 * The type-safety criterion is the one a runtime assertion cannot reach: a
 * test that compiles is the evidence, so the narrowing cases below are written
 * to fail `pnpm typecheck` if the generic ever loosens, and their runtime
 * assertions are almost incidental. `expectType` is what makes that explicit —
 * it is a compile-time assertion wearing a runtime no-op.
 */

/**
 * A handler that does nothing, as a named counter rather than `() => {}`.
 *
 * `@typescript-eslint/no-empty-function` bans the empty body, and counting is
 * the honest way to satisfy it: several cases below want to assert that a
 * do-nothing handler was or was not reached, which an empty body cannot show.
 */
let noopCalls = 0;
function noop(): void {
  noopCalls++;
}

/** A representative event map, using `05`'s `domain:pastTense` names. */
interface TestEvents {
  'item:added': { item: string; count: number };
  'resource:harvested': { node: number };
  'structure:placed': { id: number; kind: string };
  'tick:done': number;
}

describe('EventBus: type safety (criterion 1)', () => {
  it('narrows the payload to the subscribed event', () => {
    const bus = new EventBus<TestEvents>();
    let seenItem = '';
    let seenCount = 0;

    bus.on('item:added', (payload) => {
      // Both lines are the assertion. If the generic ever loosened to
      // `unknown`, neither compiles, and this file fails `pnpm typecheck`
      // rather than failing at runtime -- which is the only way a type-safety
      // criterion can be tested.
      const narrowed: { item: string; count: number } = payload;
      seenItem = narrowed.item;
      seenCount = narrowed.count;
    });

    bus.on('tick:done', (payload) => {
      const asNumber: number = payload;
      seenCount += asNumber;
    });

    bus.emit('item:added', { item: 'item.pine_plank', count: 3 });
    assert.equal(seenItem, 'item.pine_plank');
    assert.equal(seenCount, 3);
  });

  it('rejects the wrong payload type, the wrong handler type and an unknown event name', () => {
    const bus = new EventBus<TestEvents>();

    // Each `@ts-expect-error` below *is* a test: if any of these ever starts
    // compiling, the directive itself becomes an error and this file goes
    // red. That is the negative half of the criterion, which a positive
    // narrowing case cannot cover.

    // @ts-expect-error -- payload does not match the event's declared shape
    bus.emit('item:added', { item: 'item.pine_plank' });

    // @ts-expect-error -- a number payload for an object event
    bus.emit('resource:harvested', 7);

    // @ts-expect-error -- handler annotated with a payload the event never has
    bus.on('tick:done', (payload: string) => payload.length);

    // @ts-expect-error -- an event name outside the map
    bus.on('nope:happened', () => undefined);

    // @ts-expect-error -- enqueue is typed exactly like emit
    bus.enqueue('tick:done', { wrong: true });

    assert.equal(bus.queuedCount, 1, 'the ill-typed enqueue still ran at runtime');
  });

  it('gives each event type its own payload', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    bus.on('resource:harvested', (payload) => {
      seen.push(payload.node);
    });
    bus.on('structure:placed', (payload) => {
      seen.push(payload.id);
    });

    bus.emit('resource:harvested', { node: 7 });
    bus.emit('structure:placed', { id: 9, kind: 'structure.hut' });
    assert.deepEqual(seen, [7, 9]);
  });

  it('accepts an event map declared as an interface, not only as a type alias', () => {
    // Regression pin for the constraint choice documented in EventBus.ts:
    // `Record<string, unknown>` rejects an interface, because TypeScript gives
    // implicit index signatures only to type aliases. `TestEvents` above is an
    // interface, so every case in this file already depends on it -- this one
    // says so out loud.
    const bus = new EventBus<TestEvents>();
    let got = 0;
    bus.on('tick:done', (n) => {
      got = n;
    });
    bus.emit('tick:done', 42);
    assert.equal(got, 42);
  });
});

describe('EventBus: subscribe, emit, unsubscribe', () => {
  it('calls handlers in subscription order', () => {
    const bus = new EventBus<TestEvents>();
    const order: number[] = [];
    bus.on('tick:done', () => order.push(1));
    bus.on('tick:done', () => order.push(2));
    bus.on('tick:done', () => order.push(3));
    bus.emit('tick:done', 0);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('emitting an event nobody subscribed to is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    assert.doesNotThrow(() => {
      bus.emit('tick:done', 1);
    });
    assert.equal(bus.handlerCount('tick:done'), 0);
  });

  it('calls the same handler once per subscription, and each unsubscribe cancels only its own', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    const handler = (): void => {
      calls++;
    };
    const offA = bus.on('tick:done', handler);
    bus.on('tick:done', handler);

    bus.emit('tick:done', 0);
    assert.equal(calls, 2, 'a handler subscribed twice is called twice');

    offA();
    bus.emit('tick:done', 0);
    assert.equal(calls, 3, 'cancelling one subscription left the other alone');
  });

  it('unsubscribe is idempotent', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    const off = bus.on('tick:done', () => {
      calls++;
    });
    off();
    off();
    off();
    bus.emit('tick:done', 0);
    assert.equal(calls, 0);
    assert.equal(bus.handlerCount('tick:done'), 0);
  });

  it('once fires exactly once and does not re-enter itself', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    bus.once('tick:done', () => {
      calls++;
      // Cancelled before the handler body runs, so this cannot recurse.
      if (calls < 5) bus.emit('tick:done', 0);
    });
    bus.emit('tick:done', 0);
    assert.equal(calls, 1);
  });
});

describe('EventBus: unsubscribe during emit does not skip handlers (criterion 3)', () => {
  it('cancelling the next handler from inside the current one does not shift the rest', () => {
    // The splice bug in one case: with a splicing implementation, cancelling
    // B from inside A slides C down into B's index -- which the loop has just
    // finished with -- so C is silently never called.
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    let offB: () => void = noop;

    bus.on('tick:done', () => {
      seen.push('A');
      offB();
    });
    offB = bus.on('tick:done', () => seen.push('B'));
    bus.on('tick:done', () => seen.push('C'));

    bus.emit('tick:done', 0);
    assert.deepEqual(seen, ['A', 'C'], 'C must still run; B was cancelled before it was reached');
  });

  it('a handler cancelling every other handler still leaves the survivors called', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    const offs: (() => void)[] = [];
    for (let i = 0; i < 8; i++) {
      offs.push(
        bus.on('tick:done', () => {
          seen.push(i);
          if (i === 0) for (let k = 1; k < 8; k += 2) offs[k]?.();
        }),
      );
    }
    bus.emit('tick:done', 0);
    assert.deepEqual(seen, [0, 2, 4, 6], 'the odd handlers were cancelled, the even ones ran');
  });

  it('cancelling an ALREADY-CALLED handler does not drop the ones after it', () => {
    // This is the case that actually catches a splicing implementation, and
    // the reason it is written out separately: cancelling a *later* handler by
    // splicing happens to behave correctly, because the survivor slides into
    // an index the loop has not reached yet. Cancelling an *earlier* one
    // slides every later handler down past the cursor, so the last handler is
    // silently skipped. Measured: with `splice` in place of the tombstone,
    // this case and the self-cancelling one below fail and every other case in
    // this file still passes.
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    let offA = noop;

    offA = bus.on('tick:done', () => seen.push('A'));
    bus.on('tick:done', () => {
      seen.push('B');
      offA();
    });
    bus.on('tick:done', () => seen.push('C'));

    bus.emit('tick:done', 0);
    assert.deepEqual(
      seen,
      ['A', 'B', 'C'],
      'C must not be skipped by A being removed mid-dispatch',
    );
  });

  it('a handler cancelling itself does not drop the handlers after it', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    const self: { off: () => void } = { off: noop };

    self.off = bus.on('tick:done', () => {
      seen.push('A');
      self.off();
    });
    bus.on('tick:done', () => seen.push('B'));
    bus.on('tick:done', () => seen.push('C'));

    bus.emit('tick:done', 0);
    assert.deepEqual(seen, ['A', 'B', 'C']);
    // ...and it really did unsubscribe.
    bus.emit('tick:done', 0);
    assert.deepEqual(seen, ['A', 'B', 'C', 'B', 'C']);
  });

  it('a handler cancelling itself is not called again', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    const off: { fn: () => void } = { fn: noop };
    off.fn = bus.on('tick:done', () => {
      calls++;
      off.fn();
    });
    bus.emit('tick:done', 0);
    bus.emit('tick:done', 0);
    assert.equal(calls, 1);
  });

  it('a handler subscribed during emit does not receive the event being dispatched', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    bus.on('tick:done', () => {
      seen.push('first');
      bus.on('tick:done', () => seen.push('late'));
    });

    bus.emit('tick:done', 0);
    assert.deepEqual(seen, ['first'], 'the late subscriber must wait for the next emit');

    // Second emit: the original handler runs (pushing 'first' and subscribing
    // yet another late handler, which likewise waits), then the late handler
    // from the first emit runs.
    bus.emit('tick:done', 0);
    assert.deepEqual(seen, ['first', 'first', 'late']);
  });

  it('survives a re-entrant emit of the same type', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    let depth = 0;
    bus.on('tick:done', (n) => {
      seen.push(n);
      if (depth++ < 2) bus.emit('tick:done', n + 1);
    });
    bus.on('tick:done', (n) => seen.push(n * 100));

    bus.emit('tick:done', 1);
    // Depth-first: the inner emit completes inside the first handler.
    assert.deepEqual(seen, [1, 2, 3, 300, 200, 100]);
  });

  it('compacts tombstones only once the outermost dispatch has finished', () => {
    const bus = new EventBus<TestEvents>();
    let offSecond: () => void = noop;
    let countDuring = -1;

    bus.on('tick:done', () => {
      offSecond();
      // Still 1 live of 2 slots -- handlerCount skips tombstones, but the
      // slot array itself must not have been compacted yet.
      countDuring = bus.handlerCount('tick:done');
    });
    offSecond = bus.on('tick:done', noop);

    bus.emit('tick:done', 0);
    assert.equal(countDuring, 1, 'the cancelled handler is not counted while dispatch runs');
    assert.equal(bus.handlerCount('tick:done'), 1, 'and is gone after it');
  });

  it('drops the slot list entirely when the last handler unsubscribes', () => {
    // Not cosmetic: emit's zero-subscriber fast path is a failed Map lookup,
    // and a permanently-empty array left behind would turn it into a hit.
    const bus = new EventBus<TestEvents>();
    const before = noopCalls;
    const off = bus.on('tick:done', noop);
    off();
    bus.emit('tick:done', 0);
    assert.equal(bus.handlerCount('tick:done'), 0);
    assert.equal(noopCalls, before, 'the cancelled handler was not called');
  });
});

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
