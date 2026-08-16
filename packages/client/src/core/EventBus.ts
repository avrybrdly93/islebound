/**
 * Typed pub/sub (BL-006), `05`'s `core/EventBus.ts`.
 *
 * Owns: subscription lists per event type, and the deferred queue.
 * Reads: nothing — no clock, no globals, no randomness.
 * Writes: nothing outside itself; it only calls handlers it was given.
 * Emits: whatever its owner emits through it.
 * Tick position: `drain()` is called at one defined point per tick by the
 * loop's owner (`04` §4.4 — "the simulation emits events consumed by
 * presentation"). Nothing here decides when that is.
 *
 * `04` §4.4 makes events one half of the intent-in / event-out choke point
 * that Phase 7 replaces with a network hop, so an event is **data**: the
 * payload types below are whatever the owner's event map says, and this
 * module never inspects a payload.
 *
 * Generic over an event map rather than over a single discriminated union.
 * Both give per-event payload types; the map wins because the lookup is
 * `M[K]` — one indexed access — whereas a union needs `Extract<U, {type: K}>`
 * at every signature, which reads worse and degrades to `never` silently when
 * a type is misspelled. The union type `05` §`sim/events/` describes is then
 * derivable from the map when the sim needs one to serialise.
 */

/**
 * The constraint an owner's event map must satisfy: any object type whose
 * keys are event names and whose values are payload types.
 *
 * **`object`, not `Record<string, unknown>`, and that is not laziness.**
 * TypeScript gives implicit index signatures to type *aliases* but not to
 * *interfaces*, so `interface GameEvents { 'item:added': ... }` — the way
 * anyone would naturally declare this, and the way `05` §`sim/events/`
 * describes it — fails a `Record<string, unknown>` constraint with "Index
 * signature for type 'string' is missing". Constraining to `object` accepts
 * both spellings and costs nothing: every payload type still comes from the
 * indexed access `M[K]`, so `on`/`emit` are exactly as strict either way.
 *
 * Names follow `05`'s `domain:pastTense` convention (`resource:harvested`).
 * Not enforced by a template-literal type: `${string}:${string}` would reject
 * nothing a reviewer would let through, and would push every `keyof M` site
 * into a conditional type for no benefit.
 */
export type EventMap = object;

/** A subscriber. Return values are ignored — an event is not a query. */
export type EventHandler<T> = (payload: T) => void;

/** Cancels one subscription. Idempotent: calling it twice is not an error. */
export type Unsubscribe = () => void;

/**
 * A subscription slot. `handler` is `null` once cancelled — a **tombstone**
 * rather than a splice, which is what makes cancellation safe during
 * dispatch. See {@link EventBus.emit}.
 */
interface Slot {
  /**
   * `EventHandler<never>` because a slot list is homogeneous in its event
   * type but this interface is not generic: `never` is the bottom type, so
   * every `EventHandler<M[K]>` is assignable to it without a cast, and the
   * one cast back lives in {@link EventBus.emit} where `K` is in scope.
   */
  handler: EventHandler<never> | null;
}

/**
 * Typed event bus with an immediate mode (`emit`) and a queued mode
 * (`enqueue` + `drain`).
 *
 * ```ts
 * interface GameEvents {
 *   'item:added': { item: string; count: number };
 *   'resource:harvested': { node: number };
 * }
 * const bus = new EventBus<GameEvents>();
 * bus.on('item:added', (p) => p.count);   // p is {item, count}, not unknown
 * ```
 */
export class EventBus<M extends EventMap> {
  /**
   * Insertion-ordered per `04` §4.2 rule 3: handlers run in subscription
   * order, and `Map` iteration order is stable in JS. A type with no
   * subscribers is **absent** from this map rather than present with an empty
   * list, which is what lets {@link emit} cost one failed lookup.
   */
  private readonly slots = new Map<keyof M, Slot[]>();

  /**
   * Queued events, as two parallel arrays rather than an array of
   * `{type, payload}` objects: `enqueue` is a per-tick path and `06` §8 bans
   * allocation there, so this trades one object per event for two pushes into
   * arrays that reach a steady-state capacity and stop growing.
   */
  private readonly queuedTypes: (keyof M)[] = [];
  private readonly queuedPayloads: unknown[] = [];

  /**
   * How many `emit` calls are on the stack. Compaction of tombstoned slots is
   * deferred until this returns to 0, so a re-entrant emit (a handler that
   * emits) cannot shift the indices an outer dispatch loop is walking.
   */
  private dispatchDepth = 0;

  /** Types with at least one tombstone awaiting compaction. */
  private readonly dirty = new Set<keyof M>();

  /** True while a `drain()` is running, to reject a re-entrant one. */
  private draining = false;

  /**
   * Subscribes `handler` to `type`. Returns the function that cancels it.
   *
   * The same handler may be subscribed more than once and is then called
   * once per subscription; each returned `Unsubscribe` cancels exactly its
   * own. That is why a slot object exists at all rather than the handler
   * being stored bare — identity is not a key here.
   */
  on<K extends keyof M>(type: K, handler: EventHandler<M[K]>): Unsubscribe {
    let list = this.slots.get(type);
    if (list === undefined) {
      list = [];
      this.slots.set(type, list);
    }
    const slot: Slot = { handler };
    list.push(slot);

    let cancelled = false;
    return (): void => {
      // Idempotent, and cheap on the second call: a cancelled closure knows
      // it is cancelled without touching the map.
      if (cancelled) return;
      cancelled = true;
      slot.handler = null;
      this.dirty.add(type);
      if (this.dispatchDepth === 0) this.compact(type);
    };
  }

  /**
   * Subscribes for exactly one event, then cancels itself.
   *
   * Cancels *before* invoking the handler, so a handler that re-emits its own
   * event does not re-enter itself.
   */
  once<K extends keyof M>(type: K, handler: EventHandler<M[K]>): Unsubscribe {
    const off = this.on(type, (payload: M[K]): void => {
      off();
      handler(payload);
    });
    return off;
  }

  /**
   * Dispatches `payload` to every handler subscribed to `type` at the moment
   * this call began, in subscription order, immediately.
   *
   * **Zero-subscriber emit allocates nothing** (BL-006's second criterion):
   * one `Map.get` miss and a return. No iterator (`for...of` over a `Map`
   * allocates an iterator result per step), no array, no closure, and the
   * payload is passed straight through rather than wrapped in an envelope.
   *
   * **Unsubscribe during emit does not skip handlers** (third criterion).
   * The loop walks live indices, and cancellation tombstones a slot instead
   * of splicing it, so no later handler ever slides into an index the loop
   * has already passed. Splicing is the classic bug here: cancel handler 2
   * from inside handler 1 and handler 3 shifts down into index 2, which the
   * loop has just finished with, so handler 3 is silently never called.
   *
   * A handler subscribed *during* this dispatch does not receive this event —
   * `length` is read once, before the loop. A handler cancelled during this
   * dispatch and not yet reached is not called: cancellation takes effect
   * immediately, which is the whole point of being able to cancel.
   */
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const list = this.slots.get(type);
    if (list === undefined) return;
    const n = list.length;
    if (n === 0) return;

    this.dispatchDepth++;
    try {
      for (let i = 0; i < n; i++) {
        const handler = list[i]?.handler;
        if (handler !== null && handler !== undefined) {
          (handler as EventHandler<M[K]>)(payload);
        }
      }
    } finally {
      this.dispatchDepth--;
      if (this.dispatchDepth === 0 && this.dirty.size > 0) this.compactAll();
    }
  }

  /**
   * Queues an event for the next {@link drain}. Handlers are not called here.
   *
   * This is the mode `04` §4.4 wants for simulation output: a system that
   * emitted immediately would let a subscriber run *inside* that system's
   * tick and observe half-updated state, so the ordering of simulation would
   * depend on who happened to subscribe.
   */
  enqueue<K extends keyof M>(type: K, payload: M[K]): void {
    this.queuedTypes.push(type);
    this.queuedPayloads.push(payload);
  }

  /**
   * Dispatches every event queued **before this call**, in FIFO order, and
   * returns how many were dispatched.
   *
   * Events enqueued *by a handler during* the drain are left for the next
   * drain rather than appended to this pass. Draining them here would make
   * the number of events a tick processes depend on handler behaviour — and
   * a handler that re-enqueues its own event would not terminate. That is
   * the "drains at a defined point in the tick" requirement read strictly:
   * one drain is one bounded batch.
   *
   * Re-entrant `drain()` throws rather than interleaving two batches.
   */
  drain(): number {
    if (this.draining) {
      throw new Error('EventBus.drain() is already running; it must not be re-entered');
    }
    const batch = this.queuedTypes.length;
    if (batch === 0) return 0;

    this.draining = true;
    try {
      for (let i = 0; i < batch; i++) {
        // Non-null: i < batch <= length, and nothing removes from the front
        // during the loop -- the shift below happens after it.
        const type = this.queuedTypes[i];
        // `i < batch <= length` makes this read total; the guard is what
        // `noUncheckedIndexedAccess` needs to see, not a reachable branch.
        if (type === undefined) continue;
        this.emit(type, this.queuedPayloads[i] as M[keyof M]);
      }
    } finally {
      this.draining = false;
      // Drop exactly the batch that was dispatched, keeping anything a
      // handler enqueued during it. `splice` rather than `length = 0` for
      // that reason; the common case (nothing re-enqueued) removes the whole
      // array in one call.
      this.queuedTypes.splice(0, batch);
      this.queuedPayloads.splice(0, batch);
    }
    return batch;
  }

  /** How many events are waiting for the next {@link drain}. */
  get queuedCount(): number {
    return this.queuedTypes.length;
  }

  /**
   * How many live handlers `type` has. Test and dev-overlay affordance; the
   * hot paths do not call it.
   */
  handlerCount(type: keyof M): number {
    const list = this.slots.get(type);
    if (list === undefined) return 0;
    let n = 0;
    for (const slot of list) {
      if (slot.handler !== null) n++;
    }
    return n;
  }

  /**
   * Cancels every subscription and discards every queued event.
   *
   * For teardown (HMR, leaving a world). Throws if called during a dispatch,
   * because a loop is walking a list this would empty.
   */
  clear(): void {
    if (this.dispatchDepth > 0 || this.draining) {
      throw new Error('EventBus.clear() must not be called from inside a handler');
    }
    this.slots.clear();
    this.dirty.clear();
    this.queuedTypes.length = 0;
    this.queuedPayloads.length = 0;
  }

  /** Drops tombstoned slots for one type, and the list itself once empty. */
  private compact(type: keyof M): void {
    this.dirty.delete(type);
    const list = this.slots.get(type);
    if (list === undefined) return;
    let write = 0;
    // Writing behind the read cursor: `write <= read` always, so this only
    // ever overwrites slots iteration has already passed.
    for (const slot of list) {
      if (slot.handler !== null) {
        list[write++] = slot;
      }
    }
    list.length = write;
    // Removing the empty list is what keeps `emit`'s zero-subscriber path a
    // single failed lookup after the last handler unsubscribes, rather than
    // a hit on a permanently empty array.
    if (write === 0) this.slots.delete(type);
  }

  /** {@link compact} for every type marked dirty during a dispatch. */
  private compactAll(): void {
    // Copied because `compact` deletes from `this.dirty` as it goes. This is
    // not a per-frame path: it runs only after a dispatch in which something
    // actually unsubscribed.
    for (const type of Array.from(this.dirty)) {
      this.compact(type);
    }
  }
}
