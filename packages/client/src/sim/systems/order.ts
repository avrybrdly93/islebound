/**
 * THE authoritative system execution order (BL-061), `05` §1's
 * `sim/systems/order.ts`.
 *
 * `04` §4.3: *"Systems are pure functions of `(world, dt)` registered in an
 * explicit order array. Order is data in `sim/systems/order.ts` so it is
 * reviewable."* That sentence is the whole design, and it has two halves
 * worth separating.
 *
 * **Explicit** means no registration side effect. A system does not add itself
 * from its own module; nothing scans a directory; there is no priority number
 * that has to be reconciled across files. The order is one array in one file,
 * so the diff that changes what runs before what is a diff to this line-set and
 * nowhere else. That is what "reviewable" buys, and it is why
 * {@link World.step} takes no system list of its own.
 *
 * **Data** means the array is the order — not a hint the runtime sorts, not a
 * dependency graph it topologically sorts. Two systems that must not be
 * reordered are adjacent here and a reviewer can see it. `04` §4.2's
 * determinism rules make this load-bearing rather than stylistic: a run's state
 * hash depends on the order its systems mutated the world in, so an order
 * derived at runtime from anything — module load order, a `Map` of
 * registrations, a sort by name — is an order that can differ between two
 * builds of the same source.
 *
 * ## The array is empty, and that is the honest content today
 *
 * No system exists yet. `05` §1 lists thirteen files under `sim/systems/`, and
 * every one of them is a later backlog item. Populating this array with names
 * that do not resolve would not compile; populating it with stubs would put
 * thirteen no-op functions in the tick loop and thirteen files in the tree that
 * no acceptance criterion asked for, which is the scope expansion `35` §3
 * forbids.
 *
 * So the deliverable here is the *shape*: the {@link System} type, the array,
 * and `World.step` running it. The first real system appends one line.
 */

import type { EventMap } from '@core/EventBus';
import type { World } from '@sim/World';

/**
 * A system: a pure function of `(world, dt)`.
 *
 * "Pure" in `04` §4.3's sense rather than the mathematical one — a system very
 * much mutates the world it is handed. What it may not do is reach outside
 * that pair: no clock (`world.tick` is the time, `04` §4.2 rule 2), no
 * `Math.random` (`rngFor(purpose)`, rule 1), no DOM, no module-level mutable
 * state carried between ticks. Everything a system needs to remember belongs
 * in a component, because that is what gets serialised, hashed and sent over
 * the wire in Phase 7.
 *
 * `dt` is passed even though it is a compile-time constant (`04` §4.1: 1/30 s)
 * because the signature is what `04` §4.3 specifies, and because a system that
 * reads it from an argument rather than importing a constant is one that a
 * test can run at another step size without editing the module.
 *
 * The return type is `void` deliberately: a system communicates by mutating
 * components and emitting events, never by returning a value the loop would
 * have to interpret. That is the intent-in / event-out shape of `04` §4.4.
 */
export type System<M extends EventMap = EventMap> = (world: World<M>, dt: number) => void;

/**
 * A system paired with the name it is reported under.
 *
 * The name exists for two consumers that do not exist yet and one that does.
 * `04` §4.1 asks for per-stage timing instrumentation in the loop (BL-008), and
 * a profile that reads `system[3]` is not a profile anybody can act on; a debug
 * overlay (`dev/`) wants the same labels. The consumer that exists today is the
 * error path — a system that throws mid-tick should say which one it was, and
 * `Function.prototype.name` cannot be relied on for that (it is empty for many
 * arrow assignments and is mangled by the production bundler, per `28`).
 */
export interface RegisteredSystem<M extends EventMap = EventMap> {
  /** Stable label. Not a content ID; never persisted, safe to rename. */
  readonly name: string;
  /** The function itself. */
  readonly run: System<M>;
}

/**
 * The order systems run in, every tick, top to bottom.
 *
 * Append here, in the position the new system must run at. The comment above
 * each entry should say what it must run *after* and why, because that is the
 * fact a later reordering would otherwise have to rediscover.
 *
 * Frozen so it cannot be appended to at runtime. A system list that could grow
 * after the first tick is one whose order depends on when a module happened to
 * be evaluated, which is exactly what `04` §4.2 rules out.
 *
 * **The event map in the annotation is not decoration.** `EventBus<M>` is
 * invariant in `M` (it holds a `Map<keyof M, ...>` and an `on` whose handler
 * takes `M[K]`), so `World<M>` is assignable to `World<M2>` for no other `M2` —
 * which means a system list and the world it runs on must name the *same* map.
 * `Record<never, never>` is the empty one, correct while no event type exists.
 * When `sim/events/` lands, this annotation changes to that map and every
 * `World` constructed from this array follows automatically. See decision 0025.
 */
export const SYSTEM_ORDER: readonly RegisteredSystem<Record<never, never>>[] = Object.freeze([]);
