import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ComponentRegistry,
  ComponentStore,
  defineComponent,
  type Store,
} from '@sim/ecs/ComponentStore';
import {
  EntityAllocator,
  type EntityId,
  NULL_ENTITY,
  generationOf,
  indexOf,
} from '@sim/ecs/EntityAllocator';

/**
 * BL-058's three acceptance criteria, plus the two traps BL-007's handoff
 * named before this task started.
 *
 * **The ordering criterion is the one that can pass while being wrong.**
 * "`entities()` yields in ascending entity order, always" is trivially true of
 * a store that sorts raw handles — right up until an index is recycled. The
 * generation lives in the high 12 bits, so a handle sort orders by generation
 * first, and every entity in a freshly built fixture has generation 1. So the
 * ordering cases here deliberately *recycle* an index before checking, and one
 * of them constructs the case where the two orders disagree outright:
 * `(index 0, gen 2)` is the larger number and the smaller index.
 *
 * **The resurrection criterion needs both halves.** A destroyed handle must
 * not read its own leftover data, *and* a recycled index must not read its
 * predecessor's. They are different code paths — the first is the liveness
 * check, the second is the `dense[pos] === e` identity test — and a store can
 * pass either alone.
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

/** An allocator plus a store over it, the fixture nearly every case wants. */
function fixture(): { alloc: EntityAllocator; store: ComponentStore<Transform> } {
  const alloc = new EntityAllocator();
  return { alloc, store: new ComponentStore(alloc, Transform) };
}

function at(x: number): Transform {
  return { x, y: 0, z: 0 };
}

describe('defineComponent', () => {
  it('carries a name', () => {
    assert.equal(Transform.name, 'Transform');
  });

  it('rejects an empty name', () => {
    assert.throws(() => defineComponent<Transform>(''), /non-empty name/);
  });

  it('returns a distinct definition each call, even for the same name', () => {
    // Identity is what the registry keys on, so two calls must not collide by
    // accident. The registry's own name guard is what turns this into an error
    // at the point it matters.
    assert.notEqual(defineComponent<Transform>('Same'), defineComponent<Transform>('Same'));
  });
});

describe('ComponentStore: the basic surface of `04` §4.3', () => {
  it('stores, reads and reports absence', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    const b = alloc.create();

    assert.equal(store.has(a), false);
    assert.equal(store.get(a), undefined);
    assert.equal(store.size, 0);

    store.set(a, at(1));
    assert.equal(store.has(a), true);
    assert.deepEqual(store.get(a), { x: 1, y: 0, z: 0 });
    assert.equal(store.has(b), false);
    assert.equal(store.size, 1);
  });

  it('overwrites rather than duplicating on a second set', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    store.set(a, at(1));
    store.set(a, at(2));
    assert.equal(store.size, 1);
    assert.deepEqual(store.get(a), { x: 2, y: 0, z: 0 });
  });

  it('removes, idempotently', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    store.set(a, at(1));

    assert.equal(store.remove(a), true);
    assert.equal(store.has(a), false);
    assert.equal(store.size, 0);
    assert.equal(store.remove(a), false, 'a second remove is a no-op, not an error');
  });

  it('keeps every other entry reachable after a middle removal', () => {
    // Swap-with-last removal moves the last entry into the freed position and
    // has to repoint its sparse slot. Doing the two in the wrong order clears
    // the *moved* entry's slot instead of the removed one's, which loses a
    // live component and is invisible to any test that removes only the last
    // element. This case removes from the middle of five.
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3, 4].map(() => alloc.create());
    entities.forEach((entity, i) => {
      store.set(entity, at(i));
    });

    const middle = entities[2];
    assert.ok(middle !== undefined);
    assert.equal(store.remove(middle), true);

    assert.equal(store.size, 4);
    for (const [i, entity] of entities.entries()) {
      if (i === 2) {
        assert.equal(store.has(entity), false);
        continue;
      }
      assert.equal(store.has(entity), true, `entity ${String(i)} must survive`);
      assert.deepEqual(store.get(entity), at(i), `entity ${String(i)}'s value must survive`);
    }
  });

  it('satisfies the Store<T> interface `04` §4.3 declares', () => {
    const { alloc, store } = fixture();
    const asInterface: Store<Transform> = store;
    const a = alloc.create();
    asInterface.set(a, at(3));
    assert.equal(asInterface.has(a), true);
    assert.deepEqual(asInterface.get(a), at(3));
    assert.deepEqual([...asInterface.entities()], [a]);
    assert.equal(asInterface.remove(a), true);
  });
});

describe('BL-058 criterion 1: structuredClone round-trips losslessly', () => {
  it('round-trips a component with nested plain data', () => {
    const alloc = new EntityAllocator();
    const store = new ComponentStore(alloc, Owned);
    const owner = alloc.create();
    const subject = alloc.create();
    const component: Owned = { owner, tags: ['tree', 'harvestable'] };

    store.set(subject, component);
    const read = store.get(subject);
    assert.ok(read !== undefined);
    const cloned = structuredClone(read);

    assert.deepEqual(cloned, component);
    assert.notEqual(cloned, read, 'a clone is a copy, not the same object');
    assert.notEqual(cloned.tags, read.tags, 'nested arrays are copied too');
  });

  it('round-trips an EntityId reference as a live handle', () => {
    // `04` §4.3: components hold "only EntityIds". A handle is one number, so
    // it survives the clone as itself and still validates against the
    // allocator — which is the property that makes entity references in
    // components safe to save.
    const alloc = new EntityAllocator();
    const store = new ComponentStore(alloc, Owned);
    const owner = alloc.create();
    const subject = alloc.create();
    store.set(subject, { owner, tags: [] });

    const read = store.get(subject);
    assert.ok(read !== undefined);
    const cloned = structuredClone(read);

    assert.equal(cloned.owner, owner);
    assert.equal(alloc.isLive(cloned.owner), true);
    assert.equal(generationOf(cloned.owner), generationOf(owner));
  });

  it('clones the whole set of stored values, so nothing the store adds is uncloneable', () => {
    // The criterion is about what the *store* does to a component, and the way
    // to fail it is to wrap values — a class instance, a getter, a closure, a
    // reference back to the store. Cloning everything the store yields is the
    // check that nothing like that was introduced.
    const alloc = new EntityAllocator();
    const store = new ComponentStore(alloc, Owned);
    const entities = [0, 1, 2].map(() => alloc.create());
    entities.forEach((entity, i) => {
      store.set(entity, { owner: entities[0] ?? NULL_ENTITY, tags: [`t${String(i)}`] });
    });

    const snapshot = [...store.entities()].map((entity) => store.get(entity));
    const cloned = structuredClone(snapshot);
    assert.deepEqual(cloned, snapshot);
  });

  it('does not alias a stored value between two entities', () => {
    // Not a clone-on-write store: `set` keeps the caller's object. Asserted
    // rather than assumed, because "components are plain data" says nothing
    // about ownership, and a caller sharing one object between two entities
    // needs to know that a later mutation is visible through both.
    const { alloc, store } = fixture();
    const a = alloc.create();
    const shared = at(1);
    store.set(a, shared);
    shared.x = 99;
    assert.deepEqual(store.get(a), { x: 99, y: 0, z: 0 });
  });
});

describe('BL-058 criterion 2: entities() yields in ascending entity order, always', () => {
  it('sorts insertions that arrived out of order', () => {
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3, 4].map(() => alloc.create());
    for (const i of [3, 0, 4, 1, 2]) {
      const entity = entities[i];
      assert.ok(entity !== undefined);
      store.set(entity, at(i));
    }
    assert.deepEqual([...store.entities()], entities);
  });

  it('stays ascending after a swap-remove has reordered the dense array', () => {
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3, 4].map(() => alloc.create());
    entities.forEach((entity, i) => {
      store.set(entity, at(i));
    });

    const second = entities[1];
    assert.ok(second !== undefined);
    store.remove(second);

    const yielded = [...store.entities()];
    assert.deepEqual(yielded, [entities[0], entities[2], entities[3], entities[4]]);
  });

  it('orders by INDEX, not by handle — the case where the two disagree', () => {
    // The trap, made concrete. Destroy index 0's entity and recreate it: the
    // new handle is (index 0, generation 2) = 2_097_152, while index 1's is
    // (index 1, generation 1) = 1_048_577. Sorting the raw numbers puts index
    // 1 first. Sorting by index — which is what "ascending entity order"
    // means, and what EntityAllocator.liveEntities() does — puts index 0 first.
    const { alloc, store } = fixture();
    const first = alloc.create();
    const second = alloc.create();
    alloc.destroy(first);
    const recycled = alloc.create();

    assert.equal(indexOf(recycled), 0);
    assert.equal(generationOf(recycled), 2);
    assert.ok(recycled > second, 'the fixture only means something if the handles invert');
    assert.ok(indexOf(recycled) < indexOf(second));

    store.set(second, at(1));
    store.set(recycled, at(0));

    assert.deepEqual([...store.entities()], [recycled, second]);
  });

  it('agrees with the allocator on the order of the entities they share', () => {
    // Two independent orderings that must not drift: liveEntities() scans the
    // index range, entities() sorts the dense array. After churn they still
    // have to name the same sequence.
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3, 4, 5].map(() => alloc.create());
    entities.forEach((entity) => {
      store.set(entity, at(0));
    });
    for (const i of [1, 4]) {
      const entity = entities[i];
      assert.ok(entity !== undefined);
      alloc.destroy(entity);
      store.remove(entity);
    }
    const revived = alloc.create();
    store.set(revived, at(0));

    assert.deepEqual([...store.entities()], [...alloc.liveEntities()]);
  });

  it('reflects a mutation made between two iterations, rather than serving a stale sort', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    const b = alloc.create();
    const c = alloc.create();
    store.set(a, at(0));
    store.set(c, at(2));
    assert.deepEqual([...store.entities()], [a, c]);

    store.set(b, at(1));
    assert.deepEqual([...store.entities()], [a, b, c], 'an insert must invalidate the cache');

    store.remove(a);
    assert.deepEqual([...store.entities()], [b, c], 'a remove must invalidate the cache');
  });

  it('leaves the order alone when only a value changed', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    const b = alloc.create();
    store.set(a, at(0));
    store.set(b, at(1));
    assert.deepEqual([...store.entities()], [a, b]);
    store.set(a, at(9));
    assert.deepEqual([...store.entities()], [a, b]);
    assert.deepEqual(store.get(a), at(9));
  });

  it('skips an entity destroyed without its component being removed', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    const b = alloc.create();
    store.set(a, at(0));
    store.set(b, at(1));

    alloc.destroy(a);
    assert.deepEqual([...store.entities()], [b]);
    assert.equal(store.size, 2, 'the slot lingers until it is pruned or reused');
  });
});

describe('BL-058 criterion 3: a destroyed handle is rejected, not resurrected', () => {
  it('throws on set, naming the entity', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    alloc.destroy(a);
    assert.throws(() => {
      store.set(a, at(1));
    }, /is not live/);
  });

  it('throws on set for NULL_ENTITY', () => {
    const { store } = fixture();
    assert.throws(() => {
      store.set(NULL_ENTITY, at(1));
    }, /is not live/);
  });

  it('hides a destroyed entity’s own leftover component from every read', () => {
    const { alloc, store } = fixture();
    const a = alloc.create();
    store.set(a, at(7));
    alloc.destroy(a);

    assert.equal(store.has(a), false);
    assert.equal(store.get(a), undefined);
    assert.equal(store.remove(a), false);
    assert.deepEqual([...store.entities()], []);
  });

  it('does not let a recycled index inherit its predecessor’s component', () => {
    // The other half, and a different code path: here the handle asking is
    // perfectly live, and what must not happen is it finding data that belongs
    // to the entity that held the index before it.
    const { alloc, store } = fixture();
    const first = alloc.create();
    store.set(first, at(7));
    alloc.destroy(first);
    const recycled = alloc.create();

    assert.equal(indexOf(recycled), indexOf(first));
    assert.notEqual(recycled, first);
    assert.equal(store.has(recycled), false);
    assert.equal(store.get(recycled), undefined);
  });

  it('lets the recycled entity write its own component over the stale slot', () => {
    const { alloc, store } = fixture();
    const first = alloc.create();
    store.set(first, at(7));
    alloc.destroy(first);
    const recycled = alloc.create();

    store.set(recycled, at(8));
    assert.deepEqual(store.get(recycled), at(8));
    assert.equal(store.get(first), undefined, 'the stale handle still reads nothing');
    assert.equal(store.size, 1, 'and the slot was reused, not duplicated');
    assert.deepEqual([...store.entities()], [recycled]);
  });

  it('does not let a stale handle remove a live entity’s component', () => {
    const { alloc, store } = fixture();
    const first = alloc.create();
    alloc.destroy(first);
    const recycled = alloc.create();
    store.set(recycled, at(8));

    assert.equal(store.remove(first), false);
    assert.equal(store.has(recycled), true, 'the live entity keeps its component');
  });
});

describe('ComponentStore.prune', () => {
  it('drops the slots of destroyed entities and reports how many', () => {
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3].map(() => alloc.create());
    entities.forEach((entity, i) => {
      store.set(entity, at(i));
    });
    for (const i of [0, 2]) {
      const entity = entities[i];
      assert.ok(entity !== undefined);
      alloc.destroy(entity);
    }

    assert.equal(store.size, 4);
    assert.equal(store.prune(), 2);
    assert.equal(store.size, 2);
    assert.equal(store.prune(), 0, 'a second prune has nothing to do');
  });

  it('changes nothing observable, only the size', () => {
    const { alloc, store } = fixture();
    const entities = [0, 1, 2, 3].map(() => alloc.create());
    entities.forEach((entity, i) => {
      store.set(entity, at(i));
    });
    const doomed = entities[1];
    assert.ok(doomed !== undefined);
    alloc.destroy(doomed);

    const before = [...store.entities()].map((entity) => [entity, store.get(entity)]);
    store.prune();
    const after = [...store.entities()].map((entity) => [entity, store.get(entity)]);
    assert.deepEqual(after, before);
  });
});

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
