/**
 * The explicit service registry (BL-009) — `05` §2's `core/Services.ts`,
 * "explicit service registry (no magic DI)".
 *
 * Owns: a name → instance map and nothing else.
 * Reads: only what it was handed.
 * Writes: nothing outside itself.
 * Emits: nothing.
 * Tick position: none. Construction-time only; `get` is a map lookup and is
 * safe in a per-frame path, but nothing here should be *registered* in one.
 *
 * ## Why this is a map and not a container
 *
 * `05` §2's parenthetical is the whole design: **no magic DI**. There are no
 * decorators, no reflection, no constructor-argument inspection and no
 * lifecycle. A service is a value somebody put in under a key they wrote
 * down, and the registry's only job is to fail loudly when it was not.
 *
 * The type parameter is a caller-supplied map, the same shape
 * {@link EventBus}'s is, so `get('clock')` returns the clock's type rather
 * than `unknown` and a typo in a key fails `pnpm typecheck` instead of
 * arriving as a runtime `undefined`.
 *
 * ## `undefined` is a registered value, not a missing one
 *
 * The obvious implementation — `if (!this.entries.get(key)) throw` — cannot
 * tell "nobody registered `x`" from "somebody registered `x` as `undefined`",
 * and would throw the not-registered error for the second. That matters
 * because BL-009's first criterion is about the *message*: an error naming a
 * service the caller did in fact register sends them looking in the wrong
 * place. So membership is asked with `has`, never inferred from the value.
 */

/** Any service map. Keys are the names a caller registers under. */
export type ServiceMap = object;

/**
 * Thrown by {@link Services.get} for a key nothing was registered under.
 *
 * A named class rather than a bare `Error` so a test can assert the failure
 * mode without matching on prose, and so a caller that wants to recover from
 * a missing optional service can do it without a string compare.
 */
export class UnregisteredServiceError extends Error {
  /** The key that was asked for. */
  readonly service: string;
  /** Every key that *was* registered, sorted, at the moment of the failure. */
  readonly registered: readonly string[];

  constructor(service: string, registered: readonly string[]) {
    const known =
      registered.length === 0 ? 'nothing is registered' : `registered: ${registered.join(', ')}`;
    super(`No service registered under "${service}" (${known})`);
    this.name = 'UnregisteredServiceError';
    this.service = service;
    this.registered = registered;
  }
}

/** Thrown by {@link Services.register} for a key that is already taken. */
export class DuplicateServiceError extends Error {
  /** The key that was registered twice. */
  readonly service: string;

  constructor(service: string) {
    super(`Service "${service}" is already registered; call replace() if that is intended`);
    this.name = 'DuplicateServiceError';
    this.service = service;
  }
}

/**
 * An explicit, typed service registry.
 *
 * @typeParam M - the service map: `{ clock: LoopClock; config: ConfigStore }`
 *   and so on. Keys are the registry's keys and the values are their types.
 */
export class Services<M extends ServiceMap> {
  readonly #entries = new Map<keyof M & string, M[keyof M & string]>();

  /**
   * Registers `value` under `key`.
   *
   * Throws {@link DuplicateServiceError} rather than overwriting. A
   * composition root that registers the same key twice has a bug — usually a
   * module wired in two places — and silently keeping the second one hides it
   * until something reads the wrong instance. {@link replace} is the explicit
   * way to say it was intended.
   */
  register<K extends keyof M & string>(key: K, value: M[K]): void {
    if (this.#entries.has(key)) {
      throw new DuplicateServiceError(key);
    }
    this.#entries.set(key, value);
  }

  /** Registers `value` under `key`, replacing any existing entry. */
  replace<K extends keyof M & string>(key: K, value: M[K]): void {
    this.#entries.set(key, value);
  }

  /**
   * Returns the service registered under `key`.
   *
   * BL-009 criterion 1. Throws {@link UnregisteredServiceError}, whose message
   * names the key **and lists what is registered** — the second half is what
   * turns "no service registered under X" from a statement into a diagnosis,
   * because the usual cause is a typo or a root that ran in the wrong order,
   * and both are visible in that list.
   */
  get<K extends keyof M & string>(key: K): M[K] {
    if (!this.#entries.has(key)) {
      throw new UnregisteredServiceError(key, this.keys());
    }
    return this.#entries.get(key) as M[K];
  }

  /**
   * Whether anything is registered under `key`.
   *
   * Asked of the map, not of the value, so a service registered as
   * `undefined` reads as present — see this module's comment.
   */
  has(key: keyof M & string): boolean {
    return this.#entries.has(key);
  }

  /** Every registered key, sorted, so a caller's diagnostics are stable. */
  keys(): readonly string[] {
    return [...this.#entries.keys()].sort();
  }
}
