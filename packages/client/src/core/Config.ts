/**
 * The typed config store (BL-009) — `05` §2's `core/Config.ts`, "tunables,
 * loaded from content/config.ts".
 *
 * Owns: the current config snapshot and the list of subscribers.
 * Reads: only what it was handed — see below.
 * Writes: nothing outside itself.
 * Emits: nothing through the event bus; subscribers are called directly,
 * because a config change is not a simulation event and must not be
 * observable to `sim/`.
 * Tick position: none. {@link ConfigStore.current} is a field read and is safe
 * in a per-frame path; a reload is not, and only ever happens in dev.
 *
 * ## `core → (nothing)` and "loaded from content/config.ts" are both binding
 *
 * `04` §5's table forbids this file from importing `@content/*`, and `05` §2
 * says the tunables come from there. Both hold, because **this file never
 * loads anything**: it is generic over the config type, and the composition
 * root passes the object in. `@content/config.ts` declares the shape and the
 * values together and imports nothing itself, so the edge that `04` forbids
 * does not exist in either direction.
 *
 * That is the same resolution BL-008 reached for `Loop.ts` and §4.1's sketch,
 * and it has the same payoff: the whole of this file's behaviour, criterion 2
 * included, is testable with no bundler, no browser and no content module.
 *
 * ## The reload source is injected, and that is what makes criterion 2 checkable
 *
 * BL-009's second criterion is "config changes hot-reload in dev without a
 * page refresh" — a statement about a *bundler*, the way BL-008's criteria
 * were statements about a *clock*. `pnpm test` is `node --test`: there is no
 * `import.meta.hot`, no module graph to invalidate, and nothing that could
 * refresh a page in the first place.
 *
 * So the store takes a {@link ConfigReloadSource}, and the Vite adapter lives
 * in `core/viteConfigHost.ts` — which means **no bundler identifier appears
 * in this file outside its own comments**, a property a reader can grep for
 * rather than a claim they have to trust.
 *
 * ## What "without a page refresh" means here, precisely
 *
 * It means the store swaps its snapshot and calls every subscriber, in
 * registration order, without anything else being torn down. It does **not**
 * mean a subscriber is absolved of reacting: a system that read `tickHz` once
 * at construction keeps its old value, and that is the subscriber's bug, not
 * this store's. {@link ConfigStore.subscribe} exists so there is a correct
 * thing to do.
 */

/**
 * The port a bundler's hot-module API is adapted to.
 *
 * Deliberately one method. Vite's `import.meta.hot` offers accept, dispose,
 * invalidate, events and more; nothing here needs any of it, and a wider port
 * would be a wider thing to fake in a test for no gain.
 */
export interface ConfigReloadSource<C> {
  /**
   * Registers `onReload`, to be called with a replacement config whenever the
   * content module is re-evaluated. An implementation that never calls back —
   * a production build — is correct and is the common case.
   */
  onReload(listener: (next: C) => void): void;
}

/** Called after the snapshot has been swapped. Receives the new config. */
export type ConfigListener<C> = (next: C) => void;

/** Removes a subscription. Calling it twice is harmless. */
export type Unsubscribe = () => void;

/** Options for {@link createConfigStore}. */
export interface ConfigStoreOptions<C> {
  /** The starting values, normally `@content/config.ts`'s `CONFIG`. */
  readonly initial: C;
  /**
   * Where replacements arrive from. Omitted in production and in any test
   * that is not about reloading, in which case the store never changes.
   */
  readonly reloadSource?: ConfigReloadSource<C>;
}

/**
 * A config snapshot that can be replaced wholesale and subscribed to.
 *
 * Not a class, because there is nothing to extend and the closure keeps the
 * snapshot genuinely private — `#fields` would do the same, but this shape
 * matches `createLoop` and reads the same way at the call site.
 */
export interface ConfigStore<C> {
  /** The current values. Frozen; treat the result as a snapshot, not a handle. */
  current(): C;
  /**
   * Registers a listener, returning its unsubscribe. Listeners are called in
   * registration order after a reload, never during one.
   */
  subscribe(listener: ConfigListener<C>): Unsubscribe;
  /**
   * Replaces the snapshot and notifies every subscriber.
   *
   * Public because a test needs it and because a composition root may have a
   * source this port does not model. It is not a setter for individual
   * tunables: the whole object is replaced, which is what a re-evaluated
   * module actually hands you.
   */
  reload(next: C): void;
}

/**
 * Builds a {@link ConfigStore}.
 *
 * If `reloadSource` is given, it is subscribed to immediately, so a module
 * re-evaluation that happens before the first frame is not missed.
 */
export function createConfigStore<C extends object>(
  options: ConfigStoreOptions<C>,
): ConfigStore<C> {
  let snapshot = Object.freeze({ ...options.initial });
  const listeners = new Set<ConfigListener<C>>();

  const reload = (next: C): void => {
    snapshot = Object.freeze({ ...next });
    // A copy, because a listener that unsubscribes (or subscribes) during
    // notification would otherwise mutate the set being iterated. The
    // snapshot is swapped first, so every listener — including one added
    // mid-notification by another — sees the new values from `current()`.
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  };

  options.reloadSource?.onReload(reload);

  return {
    current: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reload,
  };
}
