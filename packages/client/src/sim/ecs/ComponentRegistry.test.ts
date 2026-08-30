import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineComponent } from '@sim/ecs/ComponentDef';
import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import { EntityAllocator, type EntityId, NULL_ENTITY } from '@sim/ecs/EntityAllocator';

/**
 * `ComponentRegistry`: the `World.store(def)` accessor of `04` §4.3, the
 * destroy fan-out of BL-060, and the `stores()` enumerator of BL-066. Split
 * out of `ComponentStore.test.ts` by BL-068, alongside the class.
 *
 * **The two keying rules are different and both are checked.** Stores are
 * keyed on the def *object's identity*, so two defs are two components even
 * when somebody names them the same; and `name` collisions are caught
 * separately, at registration, where the error can say which name. A registry
 * that keyed on `name` would pass the first family of cases and silently hand
 * back the wrong store.
 *
 * **BL-066's second criterion is about the source, not the behaviour** — the
 * `as` count in the store module must not rise — so the `ErasedStore` cases
 * below assert the *absence* of `set` by reading the property rather than
 * calling it. Calling it under a `@ts-expect-error` suppresses the compile
 * error and still runs the code, which is how BL-066's first draft wrote a
 * component while asserting it could not.
 */

interface Transform {
  x: number;
  y: number;
  z: number;
}

interface Owned {
  owner: EntityId;
  tags: string[];
}

const Transform = defineComponent<Transform>('Transform');
const Owned = defineComponent<Owned>('Owned');

function at(x: number): Transform {
  return { x, y: 0, z: 0 };
}

describe('ComponentRegistry: the World.store(def) accessor of `04` §4.3', () => {
  it('creates a store on first request and returns the same one after', () => {
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);

    assert.equal(registry.has(Transform), false);
    assert.equal(registry.storeCount, 0);

    const first = registry.store(Transform);
    const second = registry.store(Transform);

    assert.equal(first, second);
    assert.equal(registry.has(Transform), true);
    assert.equal(registry.storeCount, 1);
  });

  it('keeps one store per component type', () => {
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    const owned = registry.store(Owned);

    assert.notEqual(transforms, owned);
    assert.equal(registry.storeCount, 2);

    const entity = alloc.create();
    transforms.set(entity, at(1));
    assert.equal(owned.has(entity), false, 'the two stores are independent');
  });

  it('gives every store the same allocator, so liveness is judged once', () => {
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    const owned = registry.store(Owned);
    const entity = alloc.create();
    transforms.set(entity, at(1));
    owned.set(entity, { owner: entity, tags: [] });

    alloc.destroy(entity);
    assert.equal(transforms.has(entity), false);
    assert.equal(owned.has(entity), false);
  });

  it('rejects two different definitions sharing a name', () => {
    // Names reach save files and debug views. Identity keying means the
    // registry would happily hold both, so the collision has to be caught
    // where it can say which name.
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    registry.store(Transform);
    const impostor = defineComponent<Transform>('Transform');
    assert.throws(() => registry.store(impostor), /both named "Transform"/);
  });

  it('exposes the definition on the store it built', () => {
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    assert.equal(registry.store(Owned).def, Owned);
  });
});

describe('BL-066: ComponentRegistry.stores() enumerates without the value types', () => {
  it('yields nothing before any store exists', () => {
    const registry = new ComponentRegistry(new EntityAllocator());
    assert.deepEqual([...registry.stores()], []);
  });

  it('yields one entry per store, carrying the def the store was built for', () => {
    const registry = new ComponentRegistry(new EntityAllocator());
    const transforms = registry.store(Transform);
    const owned = registry.store(Owned);

    const yielded = [...registry.stores()];
    assert.equal(yielded.length, 2);
    assert.equal(registry.storeCount, 2);
    assert.deepEqual(
      yielded.map((store) => store.def.name),
      ['Transform', 'Owned'],
    );
    // Identity, not just shape: these are the same objects `store(def)` hands
    // out, not copies or wrappers.
    assert.equal(yielded[0], transforms);
    assert.equal(yielded[1], owned);
  });

  it('supports a save-shaped walk with no cast at the call site', () => {
    // This is the caller BL-066 was filed for (`23`), written the way it would
    // really be written. Nothing here names a component's `T`, and nothing here
    // needs an `as` — which is the whole claim `ErasedStore` makes.
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    const owned = registry.store(Owned);
    const a = alloc.create();
    const b = alloc.create();
    transforms.set(a, at(1));
    transforms.set(b, at(2));
    owned.set(b, { owner: a, tags: ['crate'] });

    const serialised = [...registry.stores()]
      .map((store) => ({
        name: store.def.name,
        entries: [...store.entities()].map((entity): [EntityId, unknown] => [
          entity,
          store.get(entity),
        ]),
      }))
      // The doc says a save format must key on name and must not lean on
      // enumeration order. Sorting here is that instruction obeyed.
      .sort((left, right) => left.name.localeCompare(right.name));

    assert.deepEqual(serialised, [
      { name: 'Owned', entries: [[b, { owner: a, tags: ['crate'] }]] },
      {
        name: 'Transform',
        entries: [
          [a, at(1)],
          [b, at(2)],
        ],
      },
    ]);

    // And it survives the round trip components are required to survive
    // (`04` §4.3, BL-058 criterion 1) — the erasure to `unknown` is a type-level
    // widening and does not touch the values.
    assert.deepEqual(structuredClone(serialised), serialised);
  });

  it('supports a debug-overlay-shaped walk: name, size and version per store', () => {
    // The other caller BL-066 names (`13`). Reads three members and no values.
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    registry.store(Owned);
    const a = alloc.create();
    const b = alloc.create();
    transforms.set(a, at(1));
    transforms.set(b, at(2));

    assert.deepEqual(
      [...registry.stores()].map((store) => ({
        name: store.def.name,
        size: store.size,
        version: store.version,
      })),
      [
        { name: 'Transform', size: 2, version: 2 },
        { name: 'Owned', size: 0, version: 0 },
      ],
    );
  });

  it('reflects later mutations, because it yields the stores themselves', () => {
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    const [erased] = [...registry.stores()];
    assert.ok(erased !== undefined);
    assert.equal(erased.size, 0);

    const entity = alloc.create();
    transforms.set(entity, at(7));
    assert.equal(erased.size, 1);
    assert.deepEqual(erased.get(entity), at(7));

    // Including the destroy fan-out BL-060 landed, which is the one mutation
    // that reaches every store at once.
    registry.removeEntity(entity);
    assert.equal(erased.size, 0);
    assert.equal(erased.get(entity), undefined);
  });

  it('inherits the store’s liveness rules rather than restating them', () => {
    // `entities()` skips dead handles and `get` returns undefined for them.
    // Erasure changes the value type, not the semantics — worth pinning,
    // because a save pass that serialised dead entities would write garbage
    // that a load pass would then resurrect.
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    const transforms = registry.store(Transform);
    const doomed = alloc.create();
    const survivor = alloc.create();
    transforms.set(doomed, at(1));
    transforms.set(survivor, at(2));

    // Destroyed behind the store's back — no `World` here, so no fan-out.
    alloc.destroy(doomed);
    const [erased] = [...registry.stores()];
    assert.ok(erased !== undefined);
    assert.deepEqual([...erased.entities()], [survivor]);
    assert.equal(erased.get(doomed), undefined);
    assert.equal(erased.get(NULL_ENTITY), undefined);
    // `size` counts the not-yet-pruned slot, exactly as it does on the typed
    // store. A debug overlay reading `size` is reading occupancy, not liveness.
    assert.equal(erased.size, 2);
  });

  it('enumerates in request order, which is why a save must key on name', () => {
    // The doc's warning, made concrete: the same two components requested in
    // the opposite order enumerate in the opposite order. Deterministic within
    // a run, not stable across runs, because it depends on which system
    // touched which component first.
    const first = new ComponentRegistry(new EntityAllocator());
    first.store(Transform);
    first.store(Owned);
    const second = new ComponentRegistry(new EntityAllocator());
    second.store(Owned);
    second.store(Transform);

    assert.deepEqual(
      [...first.stores()].map((store) => store.def.name),
      ['Transform', 'Owned'],
    );
    assert.deepEqual(
      [...second.stores()].map((store) => store.def.name),
      ['Owned', 'Transform'],
    );
  });

  it('offers no way to write through the erased surface', () => {
    // Each `@ts-expect-error` below *is* the test, in the style
    // `EventBus.test.ts` established: if `set` were ever added to
    // `ErasedStore`, these stop erroring and the file fails to compile.
    //
    // The reason it must not be added is in `ErasedStore`'s doc: `set` is
    // contravariant in the component's `T`, so an erased one would accept an
    // `Owned` value into the `Transform` store with the compiler's blessing —
    // undoing the `componentValue` brand one level up.
    const alloc = new EntityAllocator();
    const registry = new ComponentRegistry(alloc);
    registry.store(Transform);
    const entity = alloc.create();
    const [erased] = [...registry.stores()];
    assert.ok(erased !== undefined);

    // Property *reads*, not calls: `erased` is a real `ComponentStore` at
    // runtime, so calling `set` here would genuinely write a component and the
    // test would be asserting the opposite of what it says.
    // @ts-expect-error -- ErasedStore has no `set`, deliberately
    const hiddenSet: unknown = erased.set;
    // @ts-expect-error -- and no `prune` either; a sweep is not an erased concern
    const hiddenPrune: unknown = erased.prune;

    // Which is worth stating plainly: the erasure is **type-level only**. The
    // methods are still on the object, and a caller who defeats the compiler
    // reaches them. `ErasedStore` narrows what can be written by accident, not
    // what is reachable by determination — there is no runtime barrier here and
    // adding one (a wrapper object per store) would allocate per enumeration,
    // which `06`'s no-allocation-in-per-frame-paths rule makes the wrong trade
    // for a debug overlay that walks these every frame.
    assert.equal(typeof hiddenSet, 'function');
    assert.equal(typeof hiddenPrune, 'function');

    // `remove` *is* on the type, because it does not mention `T` and BL-060's
    // fan-out needs it. Asserted so the boundary is stated from both sides.
    assert.equal(erased.remove(entity), false);
  });
});
