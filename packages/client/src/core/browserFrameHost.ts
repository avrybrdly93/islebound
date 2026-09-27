/**
 * The two browser adapters {@link createLoop} needs, and the only place in
 * `core/` that names a browser global (BL-008).
 *
 * Split out of `Loop.ts` rather than left at its foot, and not only for that
 * file's line budget. `Loop.ts` claims, in its module comment, that it touches
 * no DOM and no wall clock of its own — which is what makes every one of
 * BL-008's criteria testable under `node --test`. A claim like that is worth
 * more when it is a property of the file than when it is a property of a
 * paragraph: with the adapters here, `Loop.ts` contains no browser identifier
 * at all and a reader does not have to take the comment's word for it.
 *
 * Neither function runs at module scope, so importing this file in an
 * environment without `performance` or `requestAnimationFrame` is still safe;
 * calling one is not, which is the caller's business.
 */

import type { FrameScheduler, LoopClock } from '@core/Loop';

/** `performance.now` as a {@link LoopClock}. Milliseconds, as the interface asks. */
export function browserLoopClock(): LoopClock {
  return { now: () => performance.now() };
}

/**
 * `requestAnimationFrame` as a {@link FrameScheduler}.
 *
 * `cancelAnimationFrame` tolerates a handle that has already fired, which is
 * exactly what {@link FrameScheduler.cancel}'s contract asks of every
 * implementation — the contract was written from this one.
 */
export function browserFrameScheduler(): FrameScheduler {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
  };
}
