/**
 * The `World` (BL-061) — `04` §4.3's assembly, `05` §1's `sim/World.ts`.
 *
 * Owns: the tick counter, and the four pieces below by composition.
 * Reads: nothing outside itself — no clock, no DOM, no randomness.
 * Writes: nothing outside itself.
 * Emits: nothing of its own. {@link World.events} is the bus systems emit
 * through; `World` never invents an event.
 * Tick position: `step(dt)` **is** the tick.
 *
 * ## This class is an assembly, not an implementation
 *
 * Every piece already existed separately before this file: {@link
 * EntityAllocator} (BL-007) owns handles and liveness, {@link
 * ComponentRegistry} (BL-058) owns per-component stores, {@link QueryCache}
 * (BL-059) owns intersections, {@link EventBus} (BL-006) owns pub/sub. BL-061's
 * first acceptance criterion is that this file adds **no second
 * implementation** of any of them, and the delegating methods below are one
 * line each for that reason. If a method here ever grows a branch that
 * duplicates a decision one of those four already makes, the fix is in that
 * class, not here.
 *
 * The four are constructed in dependency order because three of them need the
 * ones above: the registry needs the allocator (a store checks liveness), and
 * the cache needs both.
 *
 * ## The event map is a type parameter, and the systems must name the same one
 *
 * `04` §4.3 writes `events: EventBus` unparameterised, but {@link EventBus} is
 * generic over an event map and `05` §`sim/events/` puts the map in its own
 * module — which does not exist yet (`SimEvent` is a later item). Rather than
 * invent that map here, `World` carries it as a type parameter, so nothing has
 * to change in this file when the map lands.
 *
 * That has one consequence worth stating plainly, because it was discovered
 * rather than designed. **`EventBus<M>` is invariant in `M`** — it holds a
 * `Map<keyof M, Slot[]>` and an `on` whose handler takes `M[K]` — so `World<M>`
 * is assignable to `World<M2>` for no other `M2` at all, not even the empty map
 * or the widest one. A system's type mentions the world it runs on, so **a
 * system list and the world it runs on are one choice, not two**: there is no
 * `SYSTEM_ORDER` that serves every `World<M>`.
 *
 * So the order is a **constructor argument rather than a hard import**, which
 * turns out to be the better shape anyway: the world is *handed* its order
 * instead of reaching for a module-level global, which is what lets a test run
 * two recording systems without touching the authoritative array, and what will
 * let a server and a client share this class with different system lists. The
 * three alternatives were a cast (unsound the moment the array stops being
 * empty), dropping the type parameter (a bus that accepts no event types, which
 * the first real system would immediately have to undo), and inventing the
 * event map here (a later item's decision). See decision 0025.
 *
 * ## What `step` does, and the one ordering decision in it
 *
 * ```
 * tick += 1
 * for each system in SYSTEM_ORDER: run(world, dt)
 * events.drain()
 * ```
 *
 * **The tick increments first**, so a system reading `world.tick` sees the tick
 * it is executing, not the one that finished. The alternative reads correctly
 * for the *first* tick only if `tick` starts at 1, and then every system's
 * arithmetic is off by one relative to the tick number the loop reports.
 * Starting at 0 and incrementing first means `tick` is 1 during the first
 * `step`, and `world.tick` before any step is 0 — a world that has not run.
 *
 * **The drain is after every system**, and this is the decision `04` §4.4
 * leaves to "the loop's owner". Two arguments, and they point the same way.
 * Events are for *presentation* — `04` §4.4: "consumed by presentation for
 * VFX/SFX/UI, and by the journal" — so draining mid-tick would deliver half a
 * tick's worth of events to a renderer that is going to draw the end-of-tick
 * state anyway, and the other half after. And Phase 7 replaces this choke point
 * with a network hop (`04` §4.4, `36`): the server sends a tick's events as a
 * batch, so the tick boundary is where the batch is already defined.
 *
 * Note this is about {@link EventBus.enqueue}, the deferred queue. `emit`
 * dispatches synchronously and is unaffected — a system that needs another
 * system to see something *this* tick emits, and one that is telling the
 * outside world what happened enqueues. That distinction is the bus's, not
 * this class's.
 *
 * ## What this deliberately does not do
 *
 * - **No intent queue.** `04` §4.4's intents are a later item; `step` drains
 *   events, and where the intent drain sits relative to the systems is that
 *   item's decision, not this one's.
 * - **No fixed-timestep loop.** `step(dt)` is what the accumulator in `04` §4.1
 *   calls; the accumulator itself is BL-008.
 * - **No query-cache eviction, deliberately and now on the record.** BL-063
 *   asked for eviction *or* a checked rule, and the answer turned out to be the
 *   one this class made available: `World` owns the cache's lifetime — one
 *   {@link QueryCache} constructed here and unreachable from outside — so the
 *   map dies with the world and there is no process-lifetime leak. What is
 *   enforced instead is that signatures are statically known, by a limit in
 *   `Query.ts` that refuses a new one past `SIGNATURE_LIMIT`. See that module's
 *   comment for why eviction would make the cache *slower* rather than safer.
 */

import { EventBus, type EventMap } from '@core/EventBus';
import type { ComponentDef } from '@sim/ecs/ComponentDef';
import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import type { ComponentStore } from '@sim/ecs/ComponentStore';
import { EntityAllocator, type EntityId } from '@sim/ecs/EntityAllocator';
import { QueryCache } from '@sim/ecs/Query';
import type { RegisteredSystem } from '@sim/systems/order';

/**
 * The simulation world: entities, components, queries, events and the tick.
 *
 * @typeParam M - the event map {@link World.events} is typed by. Defaults to
 *   the empty map; see the module comment.
 */
export class World<M extends EventMap = Record<never, never>> {
  /**
   * Ticks completed. `0` before the first {@link World.step}, and the number of
   * the tick currently executing while a system runs.
   *
   * This is the simulation's only clock (`04` §4.2 rule 2). It is an integer,
   * and durations elsewhere are integer tick counts rather than float seconds
   * for the reason rule 4 gives — a float accumulated across ticks drifts, and
   * two machines drift differently.
   *
   * Readonly from outside. Only {@link World.step} advances it, so nothing can
   * make a world's tick disagree with the number of steps it has taken.
   */
  get tick(): number {
    return this.currentTick;
  }

  private currentTick = 0;

  private readonly allocator: EntityAllocator;

  private readonly registry: ComponentRegistry;

  private readonly queries: QueryCache;

  /**
   * The event bus (`04` §4.4). Public because systems and presentation both
   * hold it directly; `World` neither wraps nor filters it.
   */
  readonly events: EventBus<M>;

  /**
   * The system order this world runs, captured at construction.
   *
   * Production callers pass {@link SYSTEM_ORDER}, which is the authoritative
   * one; see the module comment for why it is an argument rather than an
   * import. The array is captured, not copied — it is already frozen.
   *
   * There is **no** setter and no `addSystem`: a list that could grow after the
   * first tick would make the order depend on when a module was evaluated,
   * which is what `04` §4.2 rules out.
   */
  private readonly systems: readonly RegisteredSystem<M>[];

  // Explicit fields assigned in the body rather than TypeScript parameter
  // properties: `pnpm test:node` runs `node --test` over strip-only type
  // stripping, which rejects `constructor(private readonly x: T)` outright with
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. See `33_CURRENT_TASK.md` and
  // `34_DEVELOPMENT_LOG.md`, BL-058.
  constructor(systems: readonly RegisteredSystem<M>[]) {
    this.allocator = new EntityAllocator();
    this.registry = new ComponentRegistry(this.allocator);
    this.queries = new QueryCache(this.allocator, this.registry);
    this.events = new EventBus<M>();
    this.systems = systems;
  }

  /**
   * A new entity handle. Delegates to {@link EntityAllocator.create}.
   *
   * The entity has no components. `04` §4.3's components are added through a
   * store's `set`, which is also what makes the query cache notice it.
   */
  createEntity(): EntityId {
    return this.allocator.create();
  }

  /**
   * Destroys an entity and removes its components from every store, returning
   * whether it was live (BL-060).
   *
   * **The two lines are in this order and it matters.**
   * {@link ComponentStore.remove} refuses a dead or stale handle, so the
   * fan-out has to happen while the entity is still live. Destroying first and
   * fanning out after makes every `remove` a silent no-op and leaves exactly
   * the leak this closes — with nothing failing, because a destroyed entity's
   * components are unreadable either way. `World.test.ts` asserts the order,
   * not only the outcome.
   *
   * No liveness check here: {@link ComponentRegistry.removeEntity} is harmless
   * on a handle that is not live (every store refuses it and it returns `0`),
   * and the allocator is about to answer the same question. Asking it twice
   * would be this class duplicating a decision one of its four pieces already
   * makes, which the module comment rules out.
   *
   * Cost: `O(stores)` per destroy, each `remove` an O(1) swap. The alternative
   * — a deferred `prune()` sweep on a cadence, `O(total entries)` — was
   * rejected because `QueryCache` keys on store `version`, so a sweep would
   * invalidate every cached query on whichever tick it happened to run. See
   * {@link ComponentStore.prune}, which stays for stores driven without a
   * `World`.
   */
  destroyEntity(entity: EntityId): boolean {
    this.registry.removeEntity(entity);
    return this.allocator.destroy(entity);
  }

  /** Whether a handle refers to a live entity. Delegates to {@link EntityAllocator.isLive}. */
  isLive(entity: EntityId): boolean {
    return this.allocator.isLive(entity);
  }

  /** Live entities, ascending. Delegates to {@link EntityAllocator.liveEntities}. */
  liveEntities(): IterableIterator<EntityId> {
    return this.allocator.liveEntities();
  }

  /** How many entities are live. Delegates to {@link EntityAllocator.liveCount}. */
  get entityCount(): number {
    return this.allocator.liveCount;
  }

  /**
   * The store for a component, creating it on first ask. Delegates to
   * {@link ComponentRegistry.store}.
   *
   * Keyed on def **identity**, not name — two defs spelled the same are two
   * different components, and the registry refuses the collision rather than
   * silently sharing a store. That decision is the registry's; this method does
   * not repeat it.
   */
  store<T>(def: ComponentDef<T>): ComponentStore<T> {
    return this.registry.store(def);
  }

  /** Whether a component's store has been created. Delegates to {@link ComponentRegistry.has}. */
  hasStore<T>(def: ComponentDef<T>): boolean {
    return this.registry.has(def);
  }

  /**
   * Every live entity holding all of `defs`, in ascending entity order.
   * Delegates to {@link QueryCache.query}.
   *
   * The returned array is frozen and owned by the cache: call again rather than
   * holding it across a mutation. Ascending **index** order — see
   * `ComponentStore`'s module comment for why that is not the same as sorting
   * the handles.
   *
   * **Signatures must be statically known** (BL-063): the defs at a call site
   * are written there, not assembled from content. The cache holds one entry
   * per distinct signature and never evicts, so a signature built from data — a
   * query per structure type, per crop species — would grow it for the lifetime
   * of the world. `Query.ts` enforces this rather than trusting it, and its
   * module comment says why that is the right answer here instead of eviction.
   *
   * @throws if called with no defs; `QueryCache` explains why that is not
   *   "every live entity" ({@link World.liveEntities} is).
   * @throws if this would be the `SIGNATURE_LIMIT + 1`-th distinct signature on
   *   this world, which means the rule above has been broken.
   */
  query(...defs: readonly ComponentDef<unknown>[]): readonly EntityId[] {
    // Plain delegation, and it is worth noting that it did not used to be:
    // until BL-065 `QueryCache.query` took `ComponentDef<never>`, so this line
    // carried an erasing cast and a paragraph explaining it. The two
    // signatures are now the same type. `ComponentDef<unknown>` is the top of
    // the family, so a system writes `world.query(Transform, PlayerTag)` with
    // no cast anywhere.
    return this.queries.query(...defs);
  }

  /**
   * Diagnostics for the query cache — distinct signatures held, and the
   * hit/miss split.
   *
   * Exposed because BL-059's performance criterion is about the *cached* path
   * and BL-063 is about the cache's unbounded size, and both want to be
   * observable from a `World` rather than only from a `QueryCache` a caller
   * cannot reach.
   */
  get queryStats(): { readonly size: number; readonly hits: number; readonly misses: number } {
    return { size: this.queries.size, hits: this.queries.hits, misses: this.queries.misses };
  }

  /**
   * One simulation tick: advance the clock, run every system in order, then
   * deliver the tick's deferred events.
   *
   * See the module comment for why the tick increments first and why the drain
   * is last. `dt` is the fixed step (`04` §4.1: 1/30 s) and is passed through
   * to each system unchanged; `World` does not read it.
   *
   * A system that throws aborts the tick — the remaining systems do not run and
   * the queue is not drained. That is deliberate: a half-run tick has produced
   * a state no system order would produce, and delivering its events would tell
   * presentation about a world that does not exist. The error is re-thrown
   * naming the system, because a stack trace through a bundled arrow function
   * does not (`28` mangles names). The tick counter is **not** rolled back —
   * the world really did partially advance, and pretending otherwise would make
   * `tick` disagree with the state.
   */
  step(dt: number): void {
    this.currentTick += 1;
    for (const system of this.systems) {
      try {
        system.run(this, dt);
      } catch (cause) {
        throw new Error(
          `World.step: system "${system.name}" threw on tick ${String(this.currentTick)}`,
          {
            cause,
          },
        );
      }
    }
    this.events.drain();
  }
}
