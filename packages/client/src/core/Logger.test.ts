import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createLogger,
  DEFAULT_LOG_CAPACITY,
  DEVELOPMENT_LEVELS,
  InvalidLogCapacityError,
  type LogLevel,
  type LogRecord,
} from '@core/Logger';

/**
 * BL-010 criterion 1: "Ring buffer never exceeds its cap."
 *
 * ## What is and is not demonstrated here, said before the assertions
 *
 * Criterion 1 is entirely a property of this module and is tested in full
 * below — at the cap, one past it, and two full wraps past it, because a
 * fixed-slot ring has three distinct behaviours there and only the third
 * exercises the modulo on the read path as well as the write path.
 *
 * **Criterion 2 is not here and cannot be.** "Debug calls are removed from
 * the production bundle (verified by a bundle grep test)" names a bundler and
 * an instrument, and `pnpm test` is `node --test`. It lives in
 * `tools/check-debug-stripping.test.ts`, which runs two real Vite builds. The
 * split is the same one BL-009 made, with the difference BL-010's wording
 * forces: BL-009 could test its adapter for shape and file the gap, and this
 * criterion names the real output, so the real output is what is read.
 */

/** Collects records a logger emits, so a test can assert on the sink too. */
function collector(): { sink: (record: LogRecord) => void; seen: LogRecord[] } {
  const seen: LogRecord[] = [];
  return { sink: (record) => seen.push(record), seen };
}

describe('Logger ring buffer', () => {
  it('never exceeds its cap, at the cap, one past it, and two wraps past it', () => {
    // BL-010 criterion 1. Three counts rather than one: filling exactly to
    // the cap never wraps the write cursor, one past it wraps the cursor but
    // not the read, and 3x the cap has both wrapped more than once — which is
    // where an off-by-one in `snapshot`'s start index shows up as a rotated
    // ring rather than as an oversized one.
    const capacity = 8;
    for (const written of [capacity, capacity + 1, capacity * 3]) {
      const log = createLogger({ capacity });
      for (let i = 0; i < written; i += 1) log.info(`line ${String(i)}`);

      assert.equal(log.size(), capacity, `size after ${String(written)} writes`);
      assert.equal(
        log.snapshot().length,
        capacity,
        `snapshot length after ${String(written)} writes`,
      );
    }
  });

  it('holds the newest `capacity` lines, oldest first, after wrapping', () => {
    // The cap on its own is satisfiable by a ring that drops the *newest*
    // line, or by one that returns its contents rotated. Both would pass the
    // case above and both make a crash report useless, which is the only
    // thing the ring is for (`30` §8).
    const capacity = 4;
    const log = createLogger({ capacity });
    for (let i = 0; i < 10; i += 1) log.info(`line ${String(i)}`);

    assert.deepEqual(
      log.snapshot().map((r) => r.message),
      ['line 6', 'line 7', 'line 8', 'line 9'],
    );
  });

  it('is oldest-first before it has wrapped at all', () => {
    const log = createLogger({ capacity: 4 });
    log.info('a');
    log.info('b');

    assert.deepEqual(
      log.snapshot().map((r) => r.message),
      ['a', 'b'],
    );
    assert.equal(log.size(), 2);
  });

  it('hands out a fresh array, so a caller cannot corrupt the crash context', () => {
    const log = createLogger({ capacity: 4 });
    log.info('a');

    const first = log.snapshot();
    // `snapshot()` is typed `readonly LogRecord[]`, so the cast is how a
    // caller who ignored the type would reach the array — which is the caller
    // this case is about. Without the cast `pnpm typecheck` catches it and
    // the runtime behaviour goes untested.
    (first as LogRecord[]).length = 0;

    assert.equal(log.snapshot().length, 1);
    assert.notEqual(log.snapshot(), first);
  });

  it('clear() empties the ring and lets it refill from the start', () => {
    const log = createLogger({ capacity: 3 });
    log.info('a');
    log.info('b');
    log.clear();

    assert.equal(log.size(), 0);
    assert.deepEqual(log.snapshot(), []);

    log.info('c');
    assert.deepEqual(
      log.snapshot().map((r) => r.message),
      ['c'],
    );
  });

  it('defaults its capacity to the 200 lines a crash report attaches', () => {
    // `30` §8. Pinned because the number is a contract with the crash
    // reporter, not a tuning knob.
    assert.equal(DEFAULT_LOG_CAPACITY, 200);
    assert.equal(createLogger().capacity, 200);
  });

  it('refuses a capacity that cannot hold a ring', () => {
    // A zero-capacity ring makes every snapshot empty while every call looks
    // like it worked, which is the failure mode a crash report cannot survive.
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => createLogger({ capacity }), InvalidLogCapacityError);
    }
    assert.equal(createLogger({ capacity: 1 }).capacity, 1);
  });
});

describe('Logger levels', () => {
  it('drops a line below the minimum level, and does not build a record for it', () => {
    const { sink, seen } = collector();
    const log = createLogger({ capacity: 8, minLevel: 'info', sink });

    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    assert.deepEqual(
      seen.map((r) => r.level),
      ['info', 'warn', 'error'],
    );
    assert.deepEqual(
      log.snapshot().map((r) => r.level),
      ['info', 'warn', 'error'],
    );
  });

  it('answers isEnabled consistently with what it emits', () => {
    // The guard and the filter must not be able to disagree: a call site that
    // trusts `isEnabled` to skip building expensive arguments is relying on
    // exactly this.
    const levels: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
    for (const minLevel of levels) {
      const { sink, seen } = collector();
      const log = createLogger({ capacity: 16, minLevel, sink });
      for (const level of levels) log[level](level);

      assert.deepEqual(
        levels.filter((level) => log.isEnabled(level)),
        seen.map((r) => r.level),
        `minLevel=${minLevel}`,
      );
    }
  });

  it('defaults to trace, so nothing is swallowed by omission', () => {
    const log = createLogger();
    assert.equal(log.minLevel(), 'trace');
    assert.equal(log.isEnabled('trace'), true);
  });

  it('setMinLevel applies to every view of the same ring', () => {
    const log = createLogger({ capacity: 8 });
    const render = log.tag('render');

    render.setMinLevel('warn');

    assert.equal(log.minLevel(), 'warn');
    assert.equal(log.isEnabled('info'), false);
    log.info('dropped');
    assert.equal(log.size(), 0);
  });

  it('names the development-only levels in one place', () => {
    // `06` calls trace and debug development-only and BL-010's second
    // criterion strips them. The list is exported so the bundle test and the
    // composition root cannot drift from this module's idea of which they are.
    assert.deepEqual([...DEVELOPMENT_LEVELS], ['trace', 'debug']);
  });
});

describe('Logger tags', () => {
  it('records the tag on each line and nests with a dot', () => {
    const log = createLogger({ capacity: 8 });
    log.info('root');
    log.tag('render').info('child');
    log.tag('render').tag('canvas').info('grandchild');

    assert.deepEqual(
      log.snapshot().map((r) => `${r.tag}|${r.message}`),
      ['|root', 'render|child', 'render.canvas|grandchild'],
    );
  });

  it('shares one ring across tags, in emission order', () => {
    // `30` §8 attaches "the last 200 log lines" to a crash report — one
    // interleaved history, not one ring per module. A tag that owned its own
    // ring would make the report's ordering meaningless and would silently
    // multiply the 200 by the number of modules.
    const log = createLogger({ capacity: 8 });
    const a = log.tag('a');
    const b = log.tag('b');

    a.info('1');
    b.info('2');
    a.info('3');

    assert.deepEqual(
      a.snapshot().map((r) => `${r.tag}${r.message}`),
      ['a1', 'b2', 'a3'],
    );
    assert.deepEqual(a.snapshot(), b.snapshot());
  });
});

describe('Logger records', () => {
  it('timestamps from the injected clock and carries structured data', () => {
    const { sink, seen } = collector();
    let t = 100;
    const log = createLogger({ capacity: 4, sink, now: () => (t += 10) });

    log.warn('slow frame', { ms: 42 });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], {
      at: 110,
      level: 'warn',
      tag: '',
      message: 'slow frame',
      data: { ms: 42 },
    });
  });

  it('omits `data` entirely when the caller passed none', () => {
    // Rather than recording `data: undefined`, which a crash reporter would
    // serialise as a key that was never set.
    const log = createLogger({ capacity: 4 });
    log.info('bare');

    assert.deepEqual(Object.keys(log.snapshot()[0] ?? {}).sort(), [
      'at',
      'level',
      'message',
      'tag',
    ]);
  });

  it('uses a deterministic default clock rather than the wall clock', () => {
    // A default of `Date.now` would make every test that inspects a timestamp
    // non-deterministic by omission. A composition root that wants real time
    // passes it.
    const log = createLogger({ capacity: 4 });
    log.info('a');
    log.info('b');

    assert.deepEqual(
      log.snapshot().map((r) => r.at),
      [0, 1],
    );
  });

  it('emits to the sink and the ring for the same line', () => {
    const { sink, seen } = collector();
    const log = createLogger({ capacity: 4, sink });
    log.error('boom');

    assert.equal(seen.length, 1);
    assert.equal(log.snapshot().length, 1);
    assert.equal(seen[0], log.snapshot()[0]);
  });
});
