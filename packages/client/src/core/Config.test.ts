import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConfigStore, type ConfigReloadSource } from '@core/Config';
import { viteConfigReloadSource, type ViteHotContext } from '@core/viteConfigHost';

/**
 * BL-009 criterion 2: "Config changes hot-reload in dev without a page
 * refresh."
 *
 * ## What is and is not demonstrated here, said before the assertions
 *
 * That criterion is a statement about a *bundler*, the way BL-008's criteria
 * were statements about a *clock*, and `pnpm test` is `node --test`: there is
 * no `import.meta.hot`, no module graph and nothing that could refresh a page.
 * So the criterion is split where it can honestly be split:
 *
 *   * **The mechanism is tested here, in full.** A replacement arriving from
 *     a reload source swaps the snapshot and notifies every subscriber, with
 *     nothing torn down and nothing re-created. That is what "without a page
 *     refresh" means from the store's side, and a scripted source demonstrates
 *     it exactly.
 *   * **The Vite wiring is tested for shape only**, against a fake hot
 *     context. Whether Vite calls `accept` with a re-evaluated module in a
 *     real browser is not observable from here, and is not claimed. BL-089
 *     is the record of that, and it is the same gap `browserFrameHost.ts` has
 *     carried since BL-008.
 *
 * Writing the second bullet down is the point of it. A suite that asserted the
 * fake and reported "criterion 2 met" would be making a claim about Vite on
 * the evidence of a two-line object.
 */

interface TestConfig {
  readonly tickHz: number;
  readonly label: string;
}

const INITIAL: TestConfig = { tickHz: 30, label: 'first' };

/** A reload source a test drives by hand. The `ManualHost` of this file. */
function manualReloadSource(): {
  source: ConfigReloadSource<TestConfig>;
  push(next: TestConfig): void;
  listenerCount(): number;
} {
  const listeners: ((next: TestConfig) => void)[] = [];
  return {
    source: {
      onReload(listener) {
        listeners.push(listener);
      },
    },
    push(next) {
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.length,
  };
}

describe('ConfigStore: reloading without a refresh (criterion 2)', () => {
  it('swaps the snapshot when a replacement arrives from the source', () => {
    const manual = manualReloadSource();
    const store = createConfigStore({ initial: INITIAL, reloadSource: manual.source });

    assert.equal(store.current().tickHz, 30);
    manual.push({ tickHz: 60, label: 'second' });
    assert.equal(store.current().tickHz, 60);
    assert.equal(store.current().label, 'second');
  });

  it('notifies every subscriber, in registration order', () => {
    const manual = manualReloadSource();
    const store = createConfigStore({ initial: INITIAL, reloadSource: manual.source });
    const seen: string[] = [];

    store.subscribe((next) => seen.push(`a:${next.label}`));
    store.subscribe((next) => seen.push(`b:${next.label}`));
    manual.push({ tickHz: 30, label: 'second' });

    assert.deepEqual(seen, ['a:second', 'b:second']);
  });

  it('has already swapped the snapshot by the time a subscriber runs', () => {
    // The ordering a subscriber depends on. A store that notified first and
    // swapped afterwards would hand every listener the value it is replacing,
    // and a listener that consulted `current()` instead of its argument would
    // read the old one — which is the shape of bug that survives a test
    // asserting only the argument.
    const manual = manualReloadSource();
    const store = createConfigStore({ initial: INITIAL, reloadSource: manual.source });
    let seenFromCurrent = 0;

    store.subscribe(() => {
      seenFromCurrent = store.current().tickHz;
    });
    manual.push({ tickHz: 144, label: 'second' });

    assert.equal(seenFromCurrent, 144);
  });

  it('subscribes to the source at construction, so an early reload is not missed', () => {
    const manual = manualReloadSource();
    assert.equal(manual.listenerCount(), 0);
    createConfigStore({ initial: INITIAL, reloadSource: manual.source });
    assert.equal(manual.listenerCount(), 1);
  });

  it('survives a subscriber that unsubscribes during notification', () => {
    const manual = manualReloadSource();
    const store = createConfigStore({ initial: INITIAL, reloadSource: manual.source });
    const seen: string[] = [];

    const off = store.subscribe(() => {
      seen.push('first');
      off();
    });
    store.subscribe(() => seen.push('second'));

    manual.push({ tickHz: 30, label: 'second' });
    assert.deepEqual(seen, ['first', 'second']);

    manual.push({ tickHz: 30, label: 'third' });
    assert.deepEqual(seen, ['first', 'second', 'second']);
  });

  it('stops calling a listener that unsubscribed, and tolerates a double unsubscribe', () => {
    const manual = manualReloadSource();
    const store = createConfigStore({ initial: INITIAL, reloadSource: manual.source });
    let calls = 0;

    const off = store.subscribe(() => {
      calls += 1;
    });
    off();
    off();
    manual.push({ tickHz: 30, label: 'second' });

    assert.equal(calls, 0);
  });
});

describe('ConfigStore: the snapshot', () => {
  it('is frozen, so a caller cannot edit the tunables in place', () => {
    const store = createConfigStore({ initial: INITIAL });
    assert.equal(Object.isFrozen(store.current()), true);
  });

  it('is a copy, so mutating the object that was passed in changes nothing', () => {
    // The composition root passes `@content/config.ts`'s exported object. A
    // store that held that reference would let an unrelated edit to the module
    // object leak into a live game, and would make `current()` and the content
    // module the same mutable thing.
    const mutable = { tickHz: 30, label: 'first' };
    const store = createConfigStore({ initial: mutable });
    mutable.tickHz = 99;

    assert.equal(store.current().tickHz, 30);
  });

  it('never changes when no reload source was given', () => {
    const store = createConfigStore({ initial: INITIAL });
    assert.equal(store.current().label, 'first');
  });
});

describe('viteConfigReloadSource: shape only, and that is on purpose', () => {
  it('accepts the dependency it was told to, once', () => {
    const accepted: string[] = [];
    const hot: ViteHotContext = {
      accept(dependency) {
        accepted.push(dependency);
      },
    };

    viteConfigReloadSource<TestConfig>(hot, '@content/config.ts', () => undefined).onReload(
      () => undefined,
    );

    assert.deepEqual(accepted, ['@content/config.ts']);
  });

  it('passes the selected config on when the module re-evaluates', () => {
    let callback: ((module: unknown) => void) | undefined;
    const hot: ViteHotContext = {
      accept(_dependency, cb) {
        callback = cb;
      },
    };
    const seen: TestConfig[] = [];

    viteConfigReloadSource<TestConfig>(
      hot,
      '@content/config.ts',
      (module) => (module as { CONFIG?: TestConfig }).CONFIG,
    ).onReload((next) => seen.push(next));

    callback?.({ CONFIG: { tickHz: 60, label: 'reloaded' } });
    assert.deepEqual(seen, [{ tickHz: 60, label: 'reloaded' }]);
  });

  it('drops a rejected update rather than replacing a live config with nothing', () => {
    // Vite calls back with `undefined` when it has given up and the page is
    // about to reload. Forwarding that would hand the store `undefined` as its
    // config — a crash, one frame before the reload that would have fixed it.
    let callback: ((module: unknown) => void) | undefined;
    const hot: ViteHotContext = {
      accept(_dependency, cb) {
        callback = cb;
      },
    };
    let calls = 0;

    viteConfigReloadSource<TestConfig>(hot, '@content/config.ts', () => undefined).onReload(() => {
      calls += 1;
    });

    callback?.(undefined);
    assert.equal(calls, 0);
  });

  it('is inert without a hot context, which is the production case', () => {
    const source = viteConfigReloadSource<TestConfig>(
      undefined,
      '@content/config.ts',
      () => undefined,
    );
    let calls = 0;

    // The assertion is that this does not throw. A caller in a production
    // build passes `import.meta.hot`, which is `undefined` there, and must not
    // need a branch of its own.
    source.onReload(() => {
      calls += 1;
    });
    assert.equal(calls, 0);
  });
});
