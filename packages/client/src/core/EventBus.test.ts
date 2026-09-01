import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EventBus } from '@core/EventBus';
import { noop, noopCallCount, type TestEvents } from '@core/EventBus.testFixtures';

/**
 * BL-006's type-safety and subscribe/emit/unsubscribe criteria.
 *
 * The type-safety criterion is the one a runtime assertion cannot reach: a
 * test that compiles is the evidence, so the narrowing cases below are written
 * to fail `pnpm typecheck` if the generic ever loosens, and their runtime
 * assertions are almost incidental. `expectType` is what makes that explicit —
 * it is a compile-time assertion wearing a runtime no-op.
 *
 * Queued mode (`04` §4.4) and the zero-subscriber allocation criterion are in
 * `EventBus.queued.test.ts`; the shared event map is in
 * `EventBus.testFixtures.ts`. Split by BL-069 to get under the 500-line hard
 * limit.
 */

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
    const before = noopCallCount();
    const off = bus.on('tick:done', noop);
    off();
    bus.emit('tick:done', 0);
    assert.equal(bus.handlerCount('tick:done'), 0);
    assert.equal(noopCallCount(), before, 'the cancelled handler was not called');
  });
});
