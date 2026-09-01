/**
 * Shared fixtures for the `EventBus` suites (`EventBus.test.ts` and
 * `EventBus.queued.test.ts`).
 *
 * Extracted by BL-069, which split a 533-line `EventBus.test.ts` in two to get
 * it under the 500-line hard limit `max-lines` now enforces. Both halves are
 * written against the same event map, and a second copy of it would be a
 * second thing to keep in step with `05`'s naming rules.
 *
 * Not a barrel file: it declares these, it does not re-export somebody else's.
 */

/** A representative event map, using `05`'s `domain:pastTense` names. */
export interface TestEvents {
  'item:added': { item: string; count: number };
  'resource:harvested': { node: number };
  'structure:placed': { id: number; kind: string };
  'tick:done': number;
}

/**
 * A handler that does nothing, as a named counter rather than `() => {}`.
 *
 * `@typescript-eslint/no-empty-function` bans the empty body, and counting is
 * the honest way to satisfy it: several cases want to assert that a do-nothing
 * handler was or was not reached, which an empty body cannot show.
 *
 * The count is read through {@link noopCallCount} rather than exported as a
 * mutable binding, so a caller cannot reset it and quietly make the "was not
 * called" assertions vacuous.
 */
let noopCalls = 0;

export function noop(): void {
  noopCalls++;
}

/** How many times {@link noop} has been called in this process. */
export function noopCallCount(): number {
  return noopCalls;
}
