/**
 * The tunables (BL-009) — `05` §4's "A tunable number → `shared/content/config.ts`
 * → never hardcode it in a system".
 *
 * This module is **data and nothing else**. It imports nothing, declares no
 * behaviour, and does not know that `core/Config.ts` exists — `04` §5 gives
 * `content` no outgoing edges at all, and this file is the first real content
 * table to live under that rule.
 *
 * Which way round the dependency goes is the point, and it is why the type
 * lives here rather than in `core/`: `core → (nothing)` means `core/Config.ts`
 * cannot name this file, so the composition root imports both and hands this
 * object to the store. Declaring the shape here keeps the values and their
 * type in one reviewable place, and `core/Config.ts` stays generic over it.
 *
 * **Adding a tunable is an edit to this file and to nothing else.** If a value
 * has to be typed in a second place to be usable, that is a defect in
 * `core/Config.ts`, not a reason to hardcode the number in a system.
 */

/** The shape of {@link CONFIG}. Every field is a value a designer may change. */
export interface GameConfig {
  /** Simulation rate, in ticks per second. `04` §4.1 fixes this at 30. */
  readonly tickHz: number;
  /**
   * How many simulation steps one frame may run to catch up after a stall,
   * before the remaining time is dropped and `sim:timeDropped` is emitted.
   */
  readonly maxCatchUpSteps: number;
  /**
   * The largest frame delta the loop will believe, in milliseconds. Anything
   * longer is a paused tab or a breakpoint rather than a slow frame.
   */
  readonly maxFrameDeltaMs: number;
}

/**
 * The live values.
 *
 * `tickHz` and the two loop bounds are the only tunables this repository has
 * today; they are written here rather than left as literals in `Loop.ts`
 * because `05` §4 says so, and nothing reads them yet — BL-088's composition
 * root is where they meet the loop.
 */
export const CONFIG: GameConfig = {
  tickHz: 30,
  maxCatchUpSteps: 5,
  maxFrameDeltaMs: 250,
};
