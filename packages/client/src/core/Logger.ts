/**
 * Levelled logging with a capped ring buffer (BL-010) — `06` §3's logging
 * rules and `30` §8's crash-report context.
 *
 * Owns: the ring of recent records, the minimum level, and nothing else.
 * Reads: only what it was handed — a sink and a clock, both injected.
 * Writes: nothing outside itself. The sink is somebody else's side effect.
 * Emits: nothing through the event bus. A log line is not a simulation event
 * and must not be observable to `sim/`.
 * Tick position: none. {@link Logger.info} and friends are safe in a
 * per-frame path at a level that is enabled, and allocate one record when
 * they are; see "Allocation" below.
 *
 * ## This file contains no `import.meta`, and that is checkable
 *
 * The same property `Config.ts` has, for the same reason: `pnpm test` is
 * `node --test`, where `import.meta.env` does not exist and reading `.DEV`
 * off it is a `TypeError` rather than a `false`. Every bundler-shaped
 * decision therefore lives at the call site in the composition root, which is
 * already where `main.ts` keeps its one `import.meta.hot`.
 *
 * ## The ring is 200 entries because a document says so
 *
 * `30` §8: a crash report attaches "the last 200 log lines from the ring
 * buffer and the last 20 sim events". {@link DEFAULT_LOG_CAPACITY} is that
 * number and carries the citation, per `06` §5's rule that a non-obvious
 * constant names its source.
 *
 * ## Why the ring is a fixed array and not a growing one that gets sliced
 *
 * BL-010's first criterion is that the ring never exceeds its cap, and the
 * two obvious implementations differ in whether that is *true* or merely
 * *usually true*. `push` then `if (length > cap) shift()` is correct and
 * allocates on every overflow; a fixed `Array(cap)` with a write cursor
 * cannot exceed the cap because there is nowhere to exceed it into. The
 * second is what is here, and the criterion is a property of the data
 * structure rather than of a check somebody remembered to write.
 *
 * ## Allocation
 *
 * One {@link LogRecord} object per *emitted* line, and none at all for a line
 * below the minimum level — the level comparison happens before the record is
 * built, so a disabled `debug` in a per-frame path costs a numeric compare.
 * `06`'s no-allocation-in-per-frame-paths rule is about the hot path, and an
 * enabled `info` inside one is the caller's decision to allocate.
 */

/**
 * Severity, ordered. A union rather than an `enum` per `07`'s "no `enum`".
 *
 * `trace` and `debug` are the two that `06` calls development-only and that
 * BL-010's second criterion strips from a production bundle. The strip is not
 * performed here — see this module's comment — but the split is named here so
 * there is one place that defines which levels it applies to.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Level → rank, where a higher rank is more severe. Not exported: a caller
 * that needs to compare levels should ask {@link Logger.isEnabled}, so the
 * ordering stays this module's business.
 */
const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** The levels `06` treats as development-only, in ascending severity. */
export const DEVELOPMENT_LEVELS: readonly LogLevel[] = ['trace', 'debug'];

/**
 * Ring capacity. `30` §8 — a crash report attaches "the last 200 log lines
 * from the ring buffer".
 */
export const DEFAULT_LOG_CAPACITY = 200;

/** One recorded line. Plain data, so a crash reporter can serialise it. */
export interface LogRecord {
  /** When the line was emitted, from the injected clock. */
  readonly at: number;
  readonly level: LogLevel;
  /** The module tag, e.g. `'render'`. Empty string for an untagged root. */
  readonly tag: string;
  readonly message: string;
  /**
   * Structured context, if the caller passed any. Not stringified here: a
   * crash reporter wants the object, and a console sink can format it.
   */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Where emitted lines go, beyond the ring. */
export type LogSink = (record: LogRecord) => void;

/** A monotonic-enough source of timestamps, injected for the usual reason. */
export type LogClock = () => number;

/** What {@link createLogger} takes. Every field has a documented default. */
export interface LoggerOptions {
  /**
   * Lines below this level are dropped before a record is built. Defaults to
   * `'trace'`, i.e. everything: a logger that silently swallows by default is
   * the wrong default for a library whose other half is a crash report.
   */
  readonly minLevel?: LogLevel;
  /** Ring capacity. Defaults to {@link DEFAULT_LOG_CAPACITY}. */
  readonly capacity?: number;
  /**
   * Called for every emitted line. Defaults to a no-op rather than to
   * `console`: `core/` does not decide that a browser console exists, and a
   * test that wants one passes one.
   */
  readonly sink?: LogSink;
  /**
   * Timestamp source. Defaults to a counter starting at zero, **not** to
   * `Date.now`: `core/` is not `sim/` and is not bound by its purity rule,
   * but a default that reads the wall clock would make every test that
   * inspects a record non-deterministic by omission. A composition root that
   * wants real time passes `Date.now`.
   */
  readonly now?: LogClock;
}

/**
 * Thrown by {@link createLogger} for a capacity that cannot hold a ring.
 *
 * A named class for the same reason `Services.ts` uses one: a test can assert
 * the failure mode without matching on prose.
 */
export class InvalidLogCapacityError extends Error {
  /** The capacity that was asked for. */
  readonly capacity: number;

  constructor(capacity: number) {
    super(`Log capacity must be a positive integer, got ${String(capacity)}`);
    this.name = 'InvalidLogCapacityError';
    this.capacity = capacity;
  }
}

/**
 * A levelled logger over a shared ring.
 *
 * {@link Logger.tag} returns another view of the *same* ring, so a crash
 * report taken from any tag holds every module's recent lines in the order
 * they happened. That is the property `30` §8 needs and the reason a tag is a
 * view rather than a new logger.
 */
export interface Logger {
  readonly tag: (tag: string) => Logger;
  readonly trace: (message: string, data?: Readonly<Record<string, unknown>>) => void;
  readonly debug: (message: string, data?: Readonly<Record<string, unknown>>) => void;
  readonly info: (message: string, data?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, data?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, data?: Readonly<Record<string, unknown>>) => void;
  /**
   * Whether a line at `level` would be emitted. The cheap guard for a call
   * site whose *arguments* are expensive to build; the logger already skips
   * the record itself.
   */
  readonly isEnabled: (level: LogLevel) => boolean;
  /** The current minimum level. */
  readonly minLevel: () => LogLevel;
  /** Replaces the minimum level, for every view of this ring. */
  readonly setMinLevel: (level: LogLevel) => void;
  /**
   * The ring's contents, oldest first — what a crash report attaches.
   *
   * A fresh array each call, holding the same frozen records. The ring itself
   * is never handed out: a caller that could mutate the crash context is a
   * caller that can corrupt the only evidence a crash leaves behind.
   */
  readonly snapshot: () => readonly LogRecord[];
  /** How many records the ring currently holds; never above the capacity. */
  readonly size: () => number;
  /** The ring's capacity, as constructed. */
  readonly capacity: number;
  /** Empties the ring. The sink is not notified; nothing is un-emitted. */
  readonly clear: () => void;
}

/**
 * The default sink. A named no-op rather than an inline `() => {}`, which
 * `@typescript-eslint/no-empty-function` rejects — and rightly, since an
 * anonymous empty function is indistinguishable from an unfinished one. This
 * one is finished: `core/` does not decide that a console exists.
 */
function noSink(): void {
  // Intentionally empty; see above.
}

/** The mutable state every view of one ring shares. */
interface LoggerCore {
  readonly slots: (LogRecord | undefined)[];
  readonly capacity: number;
  readonly sink: LogSink;
  readonly now: LogClock;
  /** Where the next record goes. Always in `[0, capacity)`. */
  cursor: number;
  /** How many records are held. Saturates at `capacity` and never exceeds it. */
  count: number;
  minRank: number;
  minLevel: LogLevel;
}

function record(
  core: LoggerCore,
  level: LogLevel,
  tag: string,
  message: string,
  data?: Readonly<Record<string, unknown>>,
): void {
  if (LEVEL_RANK[level] < core.minRank) return;

  const entry: LogRecord =
    data === undefined
      ? { at: core.now(), level, tag, message }
      : { at: core.now(), level, tag, message, data };

  // The cap is structural: the cursor wraps, so a write replaces the oldest
  // slot rather than extending anything. `count` saturates because there is
  // no state in which the ring holds more than it has slots for.
  core.slots[core.cursor] = entry;
  core.cursor = (core.cursor + 1) % core.capacity;
  if (core.count < core.capacity) core.count += 1;

  core.sink(entry);
}

function view(core: LoggerCore, tag: string): Logger {
  return {
    tag: (child: string) => view(core, tag === '' ? child : `${tag}.${child}`),
    trace: (message, data) => {
      record(core, 'trace', tag, message, data);
    },
    debug: (message, data) => {
      record(core, 'debug', tag, message, data);
    },
    info: (message, data) => {
      record(core, 'info', tag, message, data);
    },
    warn: (message, data) => {
      record(core, 'warn', tag, message, data);
    },
    error: (message, data) => {
      record(core, 'error', tag, message, data);
    },
    isEnabled: (level: LogLevel) => LEVEL_RANK[level] >= core.minRank,
    minLevel: () => core.minLevel,
    setMinLevel: (level: LogLevel) => {
      core.minLevel = level;
      core.minRank = LEVEL_RANK[level];
    },
    snapshot: () => {
      const out: LogRecord[] = [];
      // Oldest first. When the ring has wrapped the oldest slot is the one the
      // cursor is about to overwrite; before it wraps, slot 0 is.
      const start = core.count === core.capacity ? core.cursor : 0;
      for (let i = 0; i < core.count; i += 1) {
        const entry = core.slots[(start + i) % core.capacity];
        if (entry !== undefined) out.push(entry);
      }
      return out;
    },
    size: () => core.count,
    capacity: core.capacity,
    clear: () => {
      core.slots.fill(undefined);
      core.cursor = 0;
      core.count = 0;
    },
  };
}

/**
 * Creates a logger over a fresh ring.
 *
 * @throws {@link InvalidLogCapacityError} for a capacity that is not a
 *   positive integer. A zero-capacity ring would make every `snapshot()`
 *   empty and a crash report useless while looking like it worked, which is
 *   worse than a throw at construction.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const capacity = options.capacity ?? DEFAULT_LOG_CAPACITY;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new InvalidLogCapacityError(capacity);
  }

  const minLevel = options.minLevel ?? 'trace';
  let counter = 0;
  const core: LoggerCore = {
    slots: new Array<LogRecord | undefined>(capacity).fill(undefined),
    capacity,
    sink: options.sink ?? noSink,
    now: options.now ?? (() => counter++),
    cursor: 0,
    count: 0,
    minRank: LEVEL_RANK[minLevel],
    minLevel,
  };
  return view(core, '');
}
