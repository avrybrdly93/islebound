/**
 * The fixed-timestep loop (BL-008) — `04` §4.1's behaviour, `05` §1's
 * `core/Loop.ts`.
 *
 * Owns: the simulation's step budget, the frame timestamps, the catch-up cap,
 * and the timing counters.
 * Reads: the injected {@link LoopClock} and nothing else. No `performance`, no
 * `Date`, no `requestAnimationFrame`, no DOM.
 * Writes: nothing outside itself; it calls the two callbacks it was given.
 * Emits: `sim:timeDropped`, and only that, through {@link Loop.events}.
 * Tick position: this module *is* the tick's scheduler. `step(DT)` is one tick.
 *
 * ## `04` §4.1's sketch is a shape, and transcribing it would break `04` §5
 *
 * The sketch calls `world.step(DT)` and `renderer.render(world, acc / DT)`
 * inline. Written that way, `core/Loop.ts` would import `sim/` and `render/` —
 * and `04` §5's table is binding: **`core → (nothing)`**. So the two calls are
 * constructor arguments, and the loop never learns what it is stepping. The
 * composition root is where a `World` and a renderer meet a `Loop`.
 *
 * That is also what lets the whole of §4.1's behaviour be tested without a
 * world, a renderer or a browser.
 *
 * ## The clock and the scheduler are injected, and the criteria are why
 *
 * BL-008's criteria are "exactly 30 Hz at simulated 30/60/144 fps" and "a
 * 10-second tab switch does not produce a burst". Both are statements about
 * time. `pnpm test` is `node --test` with no DOM, so `requestAnimationFrame`
 * is absent outright and `performance.now` advances at the speed of the
 * machine — a suite waiting for real frames would take minutes and would
 * assert on whatever the container happened to schedule.
 *
 * So {@link LoopClock} and {@link FrameScheduler} are parameters, and the two
 * adapters the app passes live in `core/browserFrameHost.ts` — so **no browser
 * identifier appears in this file outside its own comments**, which is a
 * property a reader can grep for rather than a claim they have to trust.
 *
 * This is also why the loop is not in `sim/`: `04` §4.2 rule 2 bans reading
 * the wall clock inside `sim/`, and something must read it or no frame arrives.
 * The boundary is the point — the loop reads the clock and hands the
 * simulation a constant.
 *
 * ## The budget is computed from an absolute time base, not accumulated
 *
 * §4.1's sketch keeps `acc += delta` and subtracts `DT` per step. **That form
 * loses a step every ten seconds here, and loses it faster the higher the
 * frame rate** — which is precisely what criterion 1 forbids. Measured while
 * building this: 300 frames of `1000/30` ms sum to `9.999999999999991` and 600
 * of `1000/60` to `9.999999999999895`, so `floor(sum / DT)` is **299** at both
 * while the true answer is 300. The error is per-addition, so more frames per
 * second means more of it; at an hour it is minutes of simulation time gone
 * with nothing reporting it, because no cap was hit and no clamp fired.
 *
 * So this loop stores **`epochMs`** (the first frame's timestamp) and
 * **`lostMs`** (wall time deliberately excluded — clamped gaps and dropped
 * catch-up), and derives the budget:
 *
 * ```
 * elapsed  = (timestampMs - epochMs - lostMs) / 1000
 * demanded = floor(elapsed / DT) - stepsAlreadyRun
 * ```
 *
 * `lostMs` changes only on a clamped or a dropped frame, so the only repeated
 * addition is over events that are rare by construction. The observable
 * behaviour is `04` §4.1's — same rate, same cap, same clamp, same alpha —
 * and it is now exact rather than drifting. `04` §4.2 rule 4 is the same
 * instinct applied to component state: *"no floating-point accumulation across
 * ticks where an integer would do"*, and the integer that does here is the
 * step count. See decision 0041.
 *
 * Precision, stated so nobody has to rediscover its bound: `elapsed` is a
 * double in seconds, whose ULP at a day of uptime is ~1.5e-11 s — nine orders
 * below `DT`. `performance.now` starts near zero on a page load, so the
 * subtraction never operates on large magnitudes.
 *
 * ## The two guards are different guards, and conflating them is the bug
 *
 * - **{@link MAX_FRAME_DELTA} clamps the measured gap.** Its case is a tab
 *   switch: the page was not rendering for ten seconds and the simulation does
 *   not owe ten seconds of catch-up. 0.25 s is `04` §4.1's number.
 * - **{@link MAX_CATCH_UP_STEPS} caps the steps taken in one frame.** Its case
 *   is a machine that is simply too slow — every frame legitimately exceeds
 *   `DT`, so the budget grows a little each frame and would grow without
 *   bound. 5 is `04` §4.1's number.
 *
 * With the clamp at 0.25 s and `DT` at 1/30, one clamped frame still demands
 * `floor(0.25 / DT) = 7` steps against a cap of 5, so a long tab switch trips
 * **both**: the clamp bounds the burst to 7 steps' worth of time, the cap
 * spends 5 and drops the rest. That interaction is asserted rather than
 * described, because the two numbers are independent and a later change to
 * either could silently make the clamp a no-op (any clamp under
 * `MAX_CATCH_UP_STEPS * DT` = 0.1667 s) or the cap unreachable.
 *
 * ## Dropped time is discarded, not carried
 *
 * Steps beyond the cap are charged to `lostMs` — `04` §4.1: *"Beyond that,
 * time is dropped"*. Carrying them is the spiral of death the cap exists to
 * prevent: the next frame would begin already over budget, spend its 5 steps
 * and drop more, the debt growing every frame. The simulation loses wall-clock
 * time and keeps running at exactly 30 Hz of *its own* time, which is the
 * trade `04` §4.2 rule 2 already makes — `world.tick` counts steps, not
 * seconds elapsed on this machine.
 *
 * Only whole steps are dropped, so the sub-step remainder survives and `alpha`
 * stays continuous across the hitch instead of snapping to a tick boundary for
 * one frame — a second visible hitch on top of the one that caused it.
 *
 * ## `sim:timeDropped` is this module's event, not the world's
 *
 * `05` §`sim/events/` is where a simulation event map will live and it is a
 * later item; `World.ts` says so. Two routes to reuse are closed. Emitting on
 * `world.events` cannot typecheck — `EventBus<M>` is invariant in `M`, so
 * `World<Record<never, never>>`, which is what today's empty `SYSTEM_ORDER`
 * builds, is assignable to no other `World<M2>` (decision 0025). And inventing
 * the sim's map here would be taking a later item's decision.
 *
 * The third route is right on its own terms rather than by elimination.
 * **This event is a fact about the host machine, not about the simulation.**
 * The same seed and the same intents produce it on one machine and not
 * another. `04` §4.2 and Phase 7's "send intent to server, receive events
 * back" both need the simulation's event stream to be reproducible, so an
 * event that is not reproducible must not be in it. See decision 0042.
 *
 * ## What this deliberately does not do
 *
 * - **No intent draining.** `04` §4.4's queue is a later item, and where its
 *   drain sits relative to `step` is that item's decision. `World.step`
 *   already owns the event drain.
 * - **No `World` and no renderer.** See the boundary argument above.
 * - **No allocation in the per-frame path** (`06` §8). The counters are
 *   numbers on the instance and the frame callback is bound once. The one
 *   object per *dropped* frame is not a per-frame path by construction: if it
 *   allocated every frame the machine has already lost.
 */

import { EventBus } from '@core/EventBus';

/**
 * The fixed simulation timestep, in seconds. `04` §4.1: 30 Hz.
 *
 * Exported so a test and a system can name the same number, not so a caller
 * can pick another — {@link createLoop} takes no step-size option, because two
 * loops at two step sizes are two different simulations from one seed.
 */
export const DT = 1 / 30;

/**
 * The most simulation steps one frame may take. `04` §4.1: 5. A different
 * guard from {@link MAX_FRAME_DELTA}; see the module comment.
 */
export const MAX_CATCH_UP_STEPS = 5;

/**
 * The largest frame delta admitted, in seconds. `04` §4.1's
 * `Math.min(t - last, 0.25)`.
 *
 * Deliberately larger than `MAX_CATCH_UP_STEPS * DT` (0.1667 s) so the cap
 * stays reachable and the two guards are independently observable. Below that
 * product the cap would be dead code.
 */
export const MAX_FRAME_DELTA = 0.25;

/** The events this loop emits. See the module comment for why they are not the world's. */
export interface LoopEvents {
  /**
   * The catch-up cap was hit and wall-clock time was discarded. Emitted at
   * most once per frame, after that frame's steps and its render, so a handler
   * sees the frame it describes already drawn.
   */
  'sim:timeDropped': {
    /** Seconds discarded. Always `> 0`, and always a whole multiple of {@link DT}. */
    readonly seconds: number;
    /** Steps taken on the dropping frame. Always {@link MAX_CATCH_UP_STEPS}. */
    readonly stepsTaken: number;
    /** Steps the budget demanded, had there been no cap. Always `> stepsTaken`. */
    readonly stepsDemanded: number;
  };
}

/**
 * A source of monotonic time in **milliseconds**, matching `performance.now`'s
 * unit so the browser adapter is an identity and one conversion happens in one
 * place.
 */
export interface LoopClock {
  now(): number;
}

/**
 * Something that calls back on the next frame, shaped like
 * `requestAnimationFrame`.
 *
 * The callback receives the frame's timestamp in milliseconds, and the loop
 * uses that rather than calling `clock.now()` itself: `requestAnimationFrame`
 * passes the time the frame was scheduled for, which keeps successive deltas
 * from absorbing the callback's own dispatch jitter.
 */
export interface FrameScheduler {
  /** Schedules `callback` for the next frame. The returned handle cancels it. */
  request(callback: (timestampMs: number) => void): number;
  /** Cancels a pending request. Must tolerate a handle that has already fired. */
  cancel(handle: number): void;
}

/** Cumulative counters, for `04` §4.1's "per-stage timing instrumentation". */
export interface LoopStats {
  /** Frames dispatched since the first {@link Loop.start}. */
  readonly frames: number;
  /** Simulation steps run. */
  readonly steps: number;
  /** Frames on which the catch-up cap was hit. */
  readonly droppedFrames: number;
  /** Seconds discarded in total. */
  readonly droppedSeconds: number;
  /** Milliseconds spent inside the `step` callback, summed over all steps. */
  readonly stepMs: number;
  /** Milliseconds spent inside the `render` callback, summed over all frames. */
  readonly renderMs: number;
  /** Frame deltas clamped by {@link MAX_FRAME_DELTA}. */
  readonly clampedFrames: number;
}

/** What {@link createLoop} needs. */
export interface LoopOptions {
  /** One simulation tick. Called with {@link DT}, always, exactly. */
  step: (dt: number) => void;
  /**
   * Draw one frame. `alpha` is the interpolation factor in `[0, 1)` between
   * the last two simulation states (`04` §4.1).
   */
  render: (alpha: number) => void;
  /** Where frame timestamps come from. */
  scheduler: FrameScheduler;
  /** Where stage timings come from. */
  clock: LoopClock;
}

/**
 * A running (or stopped) fixed-timestep loop. Build one with
 * {@link createLoop}; the class is not exported because nothing needs to
 * subclass it.
 */
class Loop {
  /** `sim:timeDropped`. Subscribe before {@link start}. */
  readonly events = new EventBus<LoopEvents>();

  private readonly stepFn: (dt: number) => void;
  private readonly renderFn: (alpha: number) => void;
  private readonly scheduler: FrameScheduler;
  private readonly clock: LoopClock;

  /** The first frame's timestamp, or `null` before it. The base every budget is measured from. */
  private epochMs: number | null = null;

  /** The previous frame's timestamp, for the clamp. `null` before the first frame. */
  private lastTimestampMs: number | null = null;

  /** Wall time deliberately excluded from the budget: clamped gaps and dropped catch-up. */
  private lostMs = 0;

  /** Sub-step remainder of the last frame, in seconds, for {@link alpha}. */
  private remainderSeconds = 0;

  /**
   * Steps run since the current epoch was established.
   *
   * Separate from {@link steps}, which is cumulative for {@link LoopStats} and
   * survives a stop. The budget is `floor(elapsed / DT) - stepsThisEpoch`, and
   * `elapsed` is measured from the epoch — so the two counters have to agree
   * about where zero is. They did not in the first draft, and a restarted loop
   * consequently took no step ever again: `elapsed` restarted at zero while
   * `steps` still held everything the loop had run before the stop, so the
   * subtraction was permanently negative and `Math.max(..., 0)` turned that
   * into silence rather than an error. `Loop.guards.test.ts`'s restart case is
   * the regression test.
   */
  private stepsThisEpoch = 0;

  private handle: number | null = null;

  private frames = 0;
  private steps = 0;
  private droppedFrames = 0;
  private droppedSeconds = 0;
  private stepMs = 0;
  private renderMs = 0;
  private clampedFrames = 0;

  // Explicit fields assigned in the body rather than TypeScript parameter
  // properties: `pnpm test:node` runs `node --test` over strip-only type
  // stripping, which rejects `constructor(private readonly x: T)` outright with
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Same reason as `World`'s.
  constructor(options: LoopOptions) {
    this.stepFn = options.step;
    this.renderFn = options.render;
    this.scheduler = options.scheduler;
    this.clock = options.clock;
  }

  /** Whether frames are being requested. */
  get running(): boolean {
    return this.handle !== null;
  }

  /**
   * Cumulative counters. A fresh object per call, which is correct here: this
   * is a diagnostics reader rather than a per-frame path, and handing back the
   * live fields would give a caller a view that changes under it.
   */
  get stats(): LoopStats {
    return {
      frames: this.frames,
      steps: this.steps,
      droppedFrames: this.droppedFrames,
      droppedSeconds: this.droppedSeconds,
      stepMs: this.stepMs,
      renderMs: this.renderMs,
      clampedFrames: this.clampedFrames,
    };
  }

  /**
   * The interpolation factor the last `render` was given, in `[0, 1)`.
   *
   * `render` receives it as an argument so nothing on the draw path has to
   * reach back into the loop; this getter is for a debug overlay.
   */
  get alpha(): number {
    return this.remainderSeconds / DT;
  }

  /**
   * Starts requesting frames. Idempotent — a second call while running would
   * otherwise start a second chain of frames and run the simulation at twice
   * the rate for as long as both lived.
   *
   * A restart re-bases the clock: the next frame becomes the new epoch and the
   * counters carry on. The wall-clock gap while stopped is therefore not owed,
   * which is the same judgement the tab-switch clamp makes and for the same
   * reason.
   */
  start(): void {
    if (this.handle !== null) {
      return;
    }
    this.epochMs = null;
    this.lastTimestampMs = null;
    this.handle = this.scheduler.request(this.onFrame);
  }

  /**
   * Stops requesting frames and cancels any pending one. Idempotent.
   *
   * The sub-step remainder is kept, so a stopped loop still reports the
   * {@link alpha} it last rendered at rather than snapping to zero.
   */
  stop(): void {
    if (this.handle === null) {
      return;
    }
    this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  /**
   * One frame: clamp the gap, take up to {@link MAX_CATCH_UP_STEPS} steps,
   * render with the remainder as `alpha`, and schedule the next.
   *
   * Named `onFrame` rather than `update`/`sync`/`step`: the `no-restricted-
   * syntax` rule in `eslint.config.js` bans `new THREE.*` inside functions with
   * those prefixes, and this is a per-frame path that its prefix set does not
   * cover. There is no three.js here and there must never be — this file may
   * not import `render/` at all (`04` §5) — so the name is a reminder rather
   * than a loophole.
   *
   * An arrow **property** rather than a method: it is handed to
   * {@link FrameScheduler.request} every frame, so it must already be bound —
   * a `.bind(this)` at each call site would allocate a function per frame, and
   * an unbound method reference is what `@typescript-eslint/unbound-method`
   * correctly refuses. One closure, created once with the instance.
   */
  private readonly onFrame = (timestampMs: number): void => {
    // Re-request first, so a callback that throws does not silently end the
    // loop for the rest of the session. The exception still propagates; a host
    // that wants to stop on it calls `stop()` from its own handler.
    this.handle = this.scheduler.request(this.onFrame);
    this.frames += 1;

    if (this.epochMs === null) {
      // The first frame has nothing to measure from, so it takes no step. It
      // still renders, which puts something on screen before the first tick
      // rather than one frame after it. The epoch is the *frame's* timestamp
      // and not `start()`'s: a page that starts a loop and then spends 300 ms
      // mounting React must not hand the simulation that 300 ms.
      this.epochMs = timestampMs;
      this.lastTimestampMs = timestampMs;
      this.lostMs = 0;
      this.stepsThisEpoch = 0;
      // Renders with the *retained* remainder rather than zero, so a restart
      // does not snap `alpha` to a tick boundary for one frame. The budget
      // does restart from here, so up to one sub-step of wall time is not
      // owed — which is the same judgement `start()` already makes about the
      // whole interval the loop spent stopped.
      this.renderMeasured(this.remainderSeconds);
      return;
    }

    const previous = this.lastTimestampMs ?? timestampMs;
    this.lastTimestampMs = timestampMs;

    // A gap wider than the clamp, or a timestamp that went backwards, is
    // excluded from the budget rather than admitted. Monotonic clocks are
    // specified not to go backwards and `requestAnimationFrame` timestamps have
    // done so in shipped browsers; admitting a negative delta would push the
    // budget below zero and stall the simulation until it climbed back, with
    // nothing reporting it.
    const rawDeltaMs = timestampMs - previous;
    const maxDeltaMs = MAX_FRAME_DELTA * 1000;
    if (rawDeltaMs > maxDeltaMs) {
      this.lostMs += rawDeltaMs - maxDeltaMs;
      this.clampedFrames += 1;
    } else if (rawDeltaMs < 0) {
      // Negative, so this *subtracts* from `lostMs` and holds `elapsed` where
      // it was: the backwards jump is treated as zero elapsed and the time
      // base re-bases onto the new timestamp. "Real" elapsed is not
      // recoverable once a clock has lied, so the conservative reading wins.
      this.lostMs += rawDeltaMs;
    }

    const elapsedSeconds = (timestampMs - this.epochMs - this.lostMs) / 1000;
    const demanded = Math.max(Math.floor(elapsedSeconds / DT) - this.stepsThisEpoch, 0);
    const taken = Math.min(demanded, MAX_CATCH_UP_STEPS);

    for (let i = 0; i < taken; i += 1) {
      const startedAt = this.clock.now();
      this.stepFn(DT);
      this.stepMs += this.clock.now() - startedAt;
    }
    this.steps += taken;
    this.stepsThisEpoch += taken;

    let droppedSeconds = 0;
    if (demanded > taken) {
      droppedSeconds = (demanded - taken) * DT;
      this.lostMs += droppedSeconds * 1000;
      this.droppedFrames += 1;
      this.droppedSeconds += droppedSeconds;
    }

    // Recomputed from the same base rather than tracked separately, so the
    // remainder cannot disagree with the budget it is the remainder of. The
    // clamp is defensive: both terms are doubles and their difference can land
    // a few ULP outside [0, DT) without anything being wrong.
    const consumedSeconds =
      (timestampMs - this.epochMs - this.lostMs) / 1000 - this.stepsThisEpoch * DT;
    this.remainderSeconds = Math.min(Math.max(consumedSeconds, 0), DT);

    this.renderMeasured(this.remainderSeconds);

    if (droppedSeconds > 0) {
      this.events.emit('sim:timeDropped', {
        seconds: droppedSeconds,
        stepsTaken: taken,
        stepsDemanded: demanded,
      });
    }
  };

  /** `render`, with its wall-clock cost charged to {@link LoopStats.renderMs}. */
  private renderMeasured(remainderSeconds: number): void {
    const startedAt = this.clock.now();
    this.renderFn(remainderSeconds / DT);
    this.renderMs += this.clock.now() - startedAt;
  }
}

/** The loop's public type. See {@link createLoop}. */
export type { Loop };

/**
 * Builds a fixed-timestep loop over `step` and `render`.
 *
 * ```ts
 * import { browserFrameScheduler, browserLoopClock } from '@core/browserFrameHost';
 *
 * const loop = createLoop({
 *   step: (dt) => world.step(dt),
 *   render: (alpha) => renderer.render(alpha),
 *   scheduler: browserFrameScheduler(),
 *   clock: browserLoopClock(),
 * });
 * loop.events.on('sim:timeDropped', (e) => log.warn('dropped', e.seconds));
 * loop.start();
 * ```
 */
export function createLoop(options: LoopOptions): Loop {
  return new Loop(options);
}
