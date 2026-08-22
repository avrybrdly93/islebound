import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComponentRegistry, type ComponentDef, defineComponent } from '@sim/ecs/ComponentStore';
import { EntityAllocator, type EntityId, indexOf } from '@sim/ecs/EntityAllocator';
import { QueryCache, type AnyComponentDef } from '@sim/ecs/Query';

/**
 * BL-059's three acceptance criteria, plus the traps BL-058's handoff named
 * before this task started.
 *
 * **Criterion 3 is the one a plausible implementation fails.** `04` §4.3 says
 * queries are "cached per-tick", and a cache cleared once per tick is the
 * obvious reading of that sentence — it is also precisely the stale cache
 * criterion 3 forbids, because a component added or removed *mid-tick* falls
 * inside the window a per-tick cache holds. So the mid-tick cases below never
 * advance anything resembling a tick; they mutate and re-query immediately.
 *
 * **Criterion 2 is the one that can pass while being wrong**, in exactly the
 * way BL-058's ordering criterion could: "ascending entity order" is trivially
 * true of anything that sorts raw handles, right up until an index is
 * recycled, and every entity in a fresh fixture has generation 1. The ordering
 * cases here recycle first.
 *
 * **The performance criterion needs its own guard against passing for the
 * wrong reason.** A benchmark that recomputed on every call would report a
 * number about the cold path; one whose query matched nothing would report a
 * number about an empty loop. Both are checked before the time is.
 */

interface Vec {
  x: number;
  y: number;
}

const Transform = defineComponent<Vec>('Transform');
const Velocity = defineComponent<Vec>('Velocity');
const PlayerTag = defineComponent<true>('PlayerTag');
const Renderable = defineComponent<{ mesh: string }>('Renderable');

/** Erases a def's value type the way `QueryCache.query` takes them. */
function anyDef<T>(def: ComponentDef<T>): AnyComponentDef {
  return def as AnyComponentDef;
}

function fixture(): {
  allocator: EntityAllocator;
  registry: ComponentRegistry;
  queries: QueryCache;
} {
  const allocator = new EntityAllocator();
  const registry = new ComponentRegistry(allocator);
  return { allocator, registry, queries: new QueryCache(allocator, registry) };
}

describe('QueryCache: the intersection itself', () => {
  it('returns entities holding every named component and no others', () => {
    const { allocator, registry, queries } = fixture();
    const transforms = registry.store(Transform);
    const velocities = registry.store(Velocity);

    const both = allocator.create();
    const transformOnly = allocator.create();
    const velocityOnly = allocator.create();
    const neither = allocator.create();

    transforms.set(both, { x: 0, y: 0 });
    velocities.set(both, { x: 1, y: 1 });
    transforms.set(transformOnly, { x: 2, y: 2 });
    velocities.set(velocityOnly, { x: 3, y: 3 });

    assert.deepEqual(queries.query(anyDef(Transform), anyDef(Velocity)), [both]);
    assert.equal(queries.query(anyDef(Transform)).includes(neither), false);
    assert.deepEqual(queries.query(anyDef(Transform)), [both, transformOnly]);
  });

  it('is empty when a named component has no store yet, without creating a hole', () => {
    // `registry.store` creates on first request, so querying a never-used
    // component must produce an empty result rather than throwing — and must
    // not make later queries on that def behave differently.
    const { allocator, registry, queries } = fixture();
    const e = allocator.create();
    registry.store(Transform).set(e, { x: 0, y: 0 });

    assert.deepEqual(queries.query(anyDef(Transform), anyDef(PlayerTag)), []);
    registry.store(PlayerTag).set(e, true);
    assert.deepEqual(queries.query(anyDef(Transform), anyDef(PlayerTag)), [e]);
  });

  it('treats the def order as irrelevant and a repeat as one constraint', () => {
    const { allocator, registry, queries } = fixture();
    const e = allocator.create();
    registry.store(Transform).set(e, { x: 0, y: 0 });
    registry.store(Velocity).set(e, { x: 0, y: 0 });

    const forwards = queries.query(anyDef(Transform), anyDef(Velocity));
    const backwards = queries.query(anyDef(Velocity), anyDef(Transform));
    assert.deepEqual(backwards, forwards);
    // One signature, not two: the second call was a cache hit.
    assert.equal(queries.size, 1);

    assert.deepEqual(queries.query(anyDef(Transform), anyDef(Transform)), [e]);
    assert.deepEqual(
      queries.query(anyDef(Transform), anyDef(Transform)),
      queries.query(anyDef(Transform)),
    );
  });

  it('refuses a query over no components rather than returning the world', () => {
    const { queries } = fixture();
    assert.throws(() => queries.query(), /at least one component definition/);
  });

  it('keys on def identity, not on name', () => {
    // Two defs with the same name are two components — `ComponentRegistry`
    // says so by throwing, and this asserts the cache agrees rather than
    // serving one def's result for the other.
    const { registry, queries } = fixture();
    const duplicate = defineComponent<Vec>('Transform');
    registry.store(Transform);
    assert.throws(() => queries.query(anyDef(duplicate)), /both named "Transform"/);
  });

  it('hands back a frozen array, so a caller cannot corrupt the cache', () => {
    const { allocator, registry, queries } = fixture();
    const e = allocator.create();
    registry.store(Transform).set(e, { x: 0, y: 0 });
    const result = queries.query(anyDef(Transform));
    assert.equal(Object.isFrozen(result), true);
  });
});

describe('BL-059 criterion 2: results are in ascending entity order, always', () => {
  it('is ascending when the components were added in reverse order', () => {
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const entities = [allocator.create(), allocator.create(), allocator.create()];
    for (const e of [...entities].reverse()) store.set(e, { x: 0, y: 0 });

    assert.deepEqual(queries.query(anyDef(Transform)), entities);
  });

  it('is ascending by INDEX after a recycle, where handle order disagrees', () => {
    // The trap. Destroying index 0 and recreating it gives (index 0, gen 2),
    // whose numeric handle is LARGER than (index 1, gen 1) while its index is
    // smaller. Anything sorting raw handles puts it last; ascending entity
    // order puts it first.
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);

    const first = allocator.create();
    const second = allocator.create();
    store.set(second, { x: 0, y: 0 });
    allocator.destroy(first);
    const recycled = allocator.create();
    store.set(recycled, { x: 1, y: 1 });

    assert.equal(indexOf(recycled), indexOf(first));
    assert.ok(recycled > second, 'the recycled handle must be the larger number');
    assert.ok(indexOf(recycled) < indexOf(second), 'and the smaller index');

    assert.deepEqual(queries.query(anyDef(Transform)), [recycled, second]);
  });

  it('is ascending when the driving store is not the first def', () => {
    // The result's order is inherited from whichever store drives the loop,
    // and that is the smallest one rather than the first named. A driver whose
    // own order was wrong would surface here and nowhere else.
    const { allocator, registry, queries } = fixture();
    const transforms = registry.store(Transform);
    const players = registry.store(PlayerTag);

    const many: EntityId[] = [];
    for (let i = 0; i < 10; i += 1) {
      const e = allocator.create();
      transforms.set(e, { x: i, y: i });
      many.push(e);
    }
    // Two players, added youngest-first so the store's insertion order is
    // descending while its `entities()` is not.
    const a = many[2];
    const b = many[7];
    assert.ok(a !== undefined && b !== undefined);
    players.set(b, true);
    players.set(a, true);

    assert.deepEqual(queries.query(anyDef(Transform), anyDef(PlayerTag)), [a, b]);
  });
});

describe('BL-059 criterion 3: a mid-tick add or remove is reflected, not served stale', () => {
  it('reflects a component added after the first query', () => {
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const first = allocator.create();
    store.set(first, { x: 0, y: 0 });

    assert.deepEqual(queries.query(anyDef(Transform)), [first]);

    const second = allocator.create();
    store.set(second, { x: 1, y: 1 });

    // No tick boundary, no explicit invalidation call — immediately.
    assert.deepEqual(queries.query(anyDef(Transform)), [first, second]);
  });

  it('reflects a component removed after the first query', () => {
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const a = allocator.create();
    const b = allocator.create();
    store.set(a, { x: 0, y: 0 });
    store.set(b, { x: 1, y: 1 });

    assert.deepEqual(queries.query(anyDef(Transform)), [a, b]);
    store.remove(a);
    assert.deepEqual(queries.query(anyDef(Transform)), [b]);
  });

  it('reflects a destroyed entity, which no store mutation can signal', () => {
    // The case a per-store counter alone cannot see: destroying an entity
    // touches no store, every store's version is unchanged, and `entities()`
    // silently stops yielding the handle. A cache keyed only on store versions
    // keeps serving a dead entity — which is a use-after-free with extra
    // steps, since a system would then `get` it and receive `undefined`.
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const a = allocator.create();
    const b = allocator.create();
    store.set(a, { x: 0, y: 0 });
    store.set(b, { x: 1, y: 1 });

    const before = queries.query(anyDef(Transform));
    assert.deepEqual(before, [a, b]);

    const storeVersionBefore = store.version;
    allocator.destroy(a);
    assert.equal(store.version, storeVersionBefore, 'destroy must not touch the store');

    assert.deepEqual(queries.query(anyDef(Transform)), [b]);
  });

  it('does not invalidate when a set only replaces a value', () => {
    // The counterpart claim: overwriting a component's value cannot change any
    // query result, so it must not bump the store's version. Without this the
    // cache is invalidated by every position update of every entity, i.e. by
    // the most common mutation in the game, and it stops being a cache.
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const e = allocator.create();
    store.set(e, { x: 0, y: 0 });

    queries.query(anyDef(Transform));
    const hitsBefore = queries.hits;
    const missesBefore = queries.misses;

    store.set(e, { x: 99, y: 99 });

    assert.deepEqual(queries.query(anyDef(Transform)), [e]);
    assert.equal(queries.misses, missesBefore, 'a value-only set must not force a recompute');
    assert.equal(queries.hits, hitsBefore + 1);
  });

  it('does not invalidate when an entity is created but given no component', () => {
    // The claim `EntityAllocator.version` rests on: a fresh entity is a member
    // of no query until some store's `set` says so, so `create` need not bump
    // anything. If it did, every spawn would invalidate every cache — in a
    // game loop, every tick.
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const e = allocator.create();
    store.set(e, { x: 0, y: 0 });

    queries.query(anyDef(Transform));
    const missesBefore = queries.misses;

    allocator.create();

    assert.deepEqual(queries.query(anyDef(Transform)), [e]);
    assert.equal(queries.misses, missesBefore);
  });

  it('does not inherit a component through a recycled index', () => {
    // Belt and braces across the two layers: the store's dense array holds
    // whole handles, so a recycled index misses — and the cache must be
    // recomputed anyway, because the destroy bumped the allocator.
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const original = allocator.create();
    store.set(original, { x: 7, y: 7 });
    assert.deepEqual(queries.query(anyDef(Transform)), [original]);

    allocator.destroy(original);
    const recycled = allocator.create();
    assert.equal(indexOf(recycled), indexOf(original));

    assert.deepEqual(queries.query(anyDef(Transform)), []);
    assert.equal(store.get(recycled), undefined);
  });

  it('invalidates each signature independently', () => {
    // A change to one store must not force every other signature to recompute;
    // an invalidation that was global would meet criterion 3 and quietly
    // destroy the point of the cache.
    const { allocator, registry, queries } = fixture();
    const transforms = registry.store(Transform);
    const renderables = registry.store(Renderable);
    const e = allocator.create();
    transforms.set(e, { x: 0, y: 0 });
    renderables.set(e, { mesh: 'a' });

    queries.query(anyDef(Transform));
    queries.query(anyDef(Renderable));
    const missesBefore = queries.misses;

    const other = allocator.create();
    transforms.set(other, { x: 1, y: 1 });

    queries.query(anyDef(Renderable));
    assert.equal(queries.misses, missesBefore, 'the Renderable signature was untouched');

    queries.query(anyDef(Transform));
    assert.equal(queries.misses, missesBefore + 1, 'the Transform signature was not');
  });

  it('reflects a prune, which changes size but nothing observable', () => {
    const { allocator, registry, queries } = fixture();
    const store = registry.store(Transform);
    const a = allocator.create();
    const b = allocator.create();
    store.set(a, { x: 0, y: 0 });
    store.set(b, { x: 1, y: 1 });
    allocator.destroy(a);

    assert.deepEqual(queries.query(anyDef(Transform)), [b]);
    assert.equal(store.prune(), 1);
    assert.deepEqual(queries.query(anyDef(Transform)), [b]);
  });
});

describe('BL-059 criterion 1: 10,000 entities x 6 components, iteration <= 0.15 ms', () => {
  const ENTITIES = 10_000;
  const DEFS: AnyComponentDef[] = [
    anyDef(Transform),
    anyDef(Velocity),
    anyDef(PlayerTag),
    anyDef(Renderable),
    anyDef(defineComponent<number>('Collider')),
    anyDef(defineComponent<number>('Interactable')),
  ];

  function populated(): { queries: QueryCache; defs: AnyComponentDef[] } {
    const allocator = new EntityAllocator();
    const registry = new ComponentRegistry(allocator);
    const queries = new QueryCache(allocator, registry);
    const stores = DEFS.map((def) => registry.store(def));
    for (let i = 0; i < ENTITIES; i += 1) {
      const e = allocator.create();
      for (const store of stores) store.set(e, 1 as never);
    }
    return { queries, defs: DEFS };
  }

  it('iterates a cached 6-component query over 10,000 entities within budget', () => {
    const { queries, defs } = populated();

    // Warm, and check the two ways this measurement could be about nothing.
    const warm = queries.query(...defs);
    assert.equal(warm.length, ENTITIES, 'the query must actually match all 10,000');
    const missesAfterWarm = queries.misses;

    const REPEATS = 200;
    const started = process.hrtime.bigint();
    let seen = 0;
    for (let pass = 0; pass < REPEATS; pass += 1) {
      const result = queries.query(...defs);
      // The sum is a sink: without consuming the handles, nothing stops the
      // engine from eliminating the loop and timing an empty one.
      for (const entity of result) seen += entity;
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.ok(seen > 0, 'the timed loop must actually have consumed the handles');
    assert.equal(
      queries.misses,
      missesAfterWarm,
      'every timed pass must have been a cache hit; a recompute would make this a ' +
        'measurement of the cold path',
    );
    assert.equal(queries.hits >= REPEATS, true);

    const perQueryMs = elapsedMs / REPEATS;
    assert.ok(
      perQueryMs <= 0.15,
      `cached 6-component query over ${String(ENTITIES)} entities took ` +
        `${perQueryMs.toFixed(4)} ms, over the 0.15 ms budget`,
    );
  });

  it('computes a cold 6-component intersection without pathological cost', () => {
    // The cold path is NOT what criterion 1 bounds — the criterion is about
    // iteration, and the cache is what makes iteration cheap. It is measured
    // anyway and held to a deliberately loose ceiling, because "the cached
    // path is fast" says nothing if a single mutation costs a hundred
    // milliseconds to recover from. The number this ceiling was chosen against
    // is in `34_DEVELOPMENT_LOG.md`; it is not a budget from any doc.
    const { queries, defs } = populated();
    const started = process.hrtime.bigint();
    const result = queries.query(...defs);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(result.length, ENTITIES);
    assert.ok(
      elapsedMs <= 50,
      `cold 6-component intersection over ${String(ENTITIES)} entities took ` +
        `${elapsedMs.toFixed(3)} ms`,
    );
  });

  it('drives the loop from the smallest store, not the first named', () => {
    // The optimisation handoff note 4 asked for, asserted by its consequence
    // rather than by inspecting a private: a one-entity store alongside five
    // 10,000-entity ones must cost about what one entity costs, not 10,000.
    const allocator = new EntityAllocator();
    const registry = new ComponentRegistry(allocator);
    const queries = new QueryCache(allocator, registry);
    const wide = DEFS.slice(0, 5).map((def) => registry.store(def));
    const narrowDef = DEFS[5];
    assert.ok(narrowDef !== undefined);
    const narrow = registry.store(narrowDef);

    let only: EntityId | undefined;
    for (let i = 0; i < ENTITIES; i += 1) {
      const e = allocator.create();
      for (const store of wide) store.set(e, 1 as never);
      if (i === ENTITIES - 1) {
        narrow.set(e, 1 as never);
        only = e;
      }
    }
    assert.ok(only !== undefined);

    const started = process.hrtime.bigint();
    const result = queries.query(...DEFS);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.deepEqual(result, [only]);
    assert.ok(
      elapsedMs <= 5,
      `a 1-of-10,000 intersection took ${elapsedMs.toFixed(3)} ms, which is the cost of ` +
        'driving from a 10,000-entity store rather than the 1-entity one',
    );
  });
});
