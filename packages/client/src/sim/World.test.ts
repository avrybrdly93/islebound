import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import { EntityAllocator, indexOf } from '@sim/ecs/EntityAllocator';
import { SYSTEM_ORDER } from '@sim/systems/order';
import { World } from '@sim/World';
import { Health, PlayerTag, Transform, Velocity, emptyWorld } from '@sim/World.testFixtures';

/**
 * BL-061's criterion 1, plus the trap that makes it passable while wrong.
 *
 * **"Delegates, no second implementation" cannot be tested by behaviour.** A
 * `World` that reimplemented an allocator would behave exactly like one that
 * delegates, because the reimplementation would be a copy of the same
 * algorithm. So the cases below assert *identity*: the store `World.store`
 * hands back is the same object the registry would, the query result is the
 * cache's own frozen array, and the cache's hit counter moves when
 * `World.query` is called twice. Those are observations a second
 * implementation fails.
 *
 * Criterion 2, events and purity are in `World.step.test.ts`; the fixtures both
 * files use are in `World.testFixtures.ts`. Split by BL-069 to get under the
 * 500-line hard limit.
 */

describe('World — the authoritative system order', () => {
  it('SYSTEM_ORDER is empty, frozen, and that is deliberate', () => {
    // Not a placeholder assertion. `order.ts` says the empty array is the
    // honest content while no system exists, and the freeze is what stops a
    // module adding itself at evaluation time -- which `04` §4.2 rules out
    // because it would make the order depend on module load order.
    assert.deepEqual(SYSTEM_ORDER, []);
    assert.equal(Object.isFrozen(SYSTEM_ORDER), true);
  });

  it('a world built from SYSTEM_ORDER steps without incident', () => {
    // The production wiring, exercised. Everything else in this file passes a
    // hand-built array, so without this case nothing would notice if the real
    // array stopped being an acceptable argument.
    const world = new World(SYSTEM_ORDER);
    world.step(1 / 30);
    assert.equal(world.tick, 1);
  });
});

describe('World — criterion 1: delegation, not reimplementation', () => {
  it('store() returns the same object for the same def, and a different one per def', () => {
    const world = emptyWorld();
    const transforms = world.store(Transform);
    assert.equal(world.store(Transform), transforms, 'the registry memoises; World must not copy');
    assert.notEqual(world.store(Velocity), transforms);
  });

  it('hasStore reports the registry, not a guess', () => {
    const world = emptyWorld();
    assert.equal(world.hasStore(Transform), false);
    world.store(Transform);
    assert.equal(world.hasStore(Transform), true);
    assert.equal(world.hasStore(Velocity), false);
  });

  it('createEntity/destroyEntity/isLive go through one allocator', () => {
    const world = emptyWorld();
    const a = world.createEntity();
    const b = world.createEntity();
    assert.notEqual(a, b);
    assert.equal(world.isLive(a), true);
    assert.equal(world.entityCount, 2);

    assert.equal(world.destroyEntity(a), true);
    assert.equal(world.isLive(a), false);
    assert.equal(world.entityCount, 1);
    // A second destroy of the same handle is not an error and not a second
    // destruction -- that is the allocator's contract, and World repeating it
    // differently is exactly what criterion 1 forbids.
    assert.equal(world.destroyEntity(a), false);
    assert.equal(world.entityCount, 1);
  });

  it('recycles an index, and the stale handle stays dead', () => {
    // The generation-bit behaviour is the allocator's. Asserted here because a
    // World with its own entity counter would hand out a live handle equal to
    // the dead one and nothing else in this file would notice.
    const world = emptyWorld();
    const first = world.createEntity();
    world.destroyEntity(first);
    const recycled = world.createEntity();
    assert.equal(indexOf(recycled), indexOf(first));
    assert.notEqual(recycled, first);
    assert.equal(world.isLive(first), false);
    assert.equal(world.isLive(recycled), true);
  });

  it('liveEntities enumerates exactly the live set', () => {
    const world = emptyWorld();
    const entities = [world.createEntity(), world.createEntity(), world.createEntity()];
    const middle = entities[1];
    assert.ok(middle !== undefined);
    world.destroyEntity(middle);
    assert.deepEqual(
      [...world.liveEntities()],
      [entities[0], entities[2]],
      'ascending index order, minus the destroyed one',
    );
  });

  it('query() returns the cache’s own frozen array and serves the second call from cache', () => {
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const tags = world.store(PlayerTag);
    const player = world.createEntity();
    const other = world.createEntity();
    transforms.set(player, { x: 1, y: 2 });
    transforms.set(other, { x: 3, y: 4 });
    tags.set(player, true);

    const first = world.query(Transform, PlayerTag);
    assert.deepEqual([...first], [player]);
    assert.equal(Object.isFrozen(first), true, 'the cache hands out its own array');

    const before = world.queryStats.hits;
    const second = world.query(Transform, PlayerTag);
    assert.equal(second, first, 'same array object -- a reimplementation would build a new one');
    assert.equal(world.queryStats.hits, before + 1);
  });

  it('a component added mid-tick is visible to the next query in the same tick', () => {
    // BL-059's third criterion, re-asserted through World because a World that
    // wrapped the cache with a per-tick clear of its own would fail it while
    // QueryCache's own tests still passed.
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const tags = world.store(PlayerTag);
    const e = world.createEntity();
    transforms.set(e, { x: 0, y: 0 });

    assert.deepEqual([...world.query(Transform, PlayerTag)], []);
    tags.set(e, true);
    assert.deepEqual([...world.query(Transform, PlayerTag)], [e], 'no tick advanced in between');
  });

  it('query() with no defs throws rather than meaning “everything”', () => {
    const world = emptyWorld();
    assert.throws(() => {
      world.query();
    }, /at least one component definition/);
  });

  it('destroyEntity reaches the stores — BL-060', () => {
    // The case that used to assert the opposite. Its failure was the reminder
    // to change World's module comment and the backlog entry with it.
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const e = world.createEntity();
    transforms.set(e, { x: 1, y: 1 });
    assert.equal(transforms.size, 1);

    world.destroyEntity(e);
    assert.equal(transforms.size, 0, 'the slot is gone, not merely unreadable');
    assert.equal(transforms.has(e), false);
    assert.equal(transforms.get(e), undefined);
    assert.deepEqual([...transforms.entities()], []);
    assert.equal(transforms.prune(), 0, 'there is nothing left for the sweep to find');
  });

  it('destroyEntity reaches EVERY store, not just the first', () => {
    // A fan-out that stopped at the first hit, or that iterated one store by
    // accident, passes the case above.
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const healths = world.store(Health);
    const e = world.createEntity();
    transforms.set(e, { x: 1, y: 1 });
    healths.set(e, 3);

    world.destroyEntity(e);
    assert.equal(transforms.size, 0);
    assert.equal(healths.size, 0);
  });

  it('destroyEntity leaves other entities’ components alone', () => {
    // The counterexample to a fan-out that cleared the stores instead of
    // removing one entity from them, which passes every case above.
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const doomed = world.createEntity();
    const survivor = world.createEntity();
    transforms.set(doomed, { x: 1, y: 1 });
    transforms.set(survivor, { x: 2, y: 2 });

    world.destroyEntity(doomed);
    assert.equal(transforms.size, 1);
    assert.deepEqual(transforms.get(survivor), { x: 2, y: 2 });
    assert.deepEqual([...transforms.entities()], [survivor]);
  });

  it('the fan-out runs BEFORE the handle is destroyed — the ordering trap', () => {
    // ComponentStore.remove refuses a dead or stale handle, so the reversed
    // order (destroy, then fan out) leaves every slot exactly where it was.
    // Nothing else observable changes, so only a size assertion catches it —
    // which is why this case asserts the mechanism and not just the outcome.
    //
    // The mechanism is asserted by proving `remove` really does refuse a dead
    // handle: destroy through the allocator's own path first (a store the
    // world does not own), then try to remove, and watch it fail.
    const allocator = new EntityAllocator();
    const registry = new ComponentRegistry(allocator);
    const store = registry.store(Transform);
    const e = allocator.create();
    store.set(e, { x: 1, y: 1 });

    allocator.destroy(e);
    assert.equal(registry.removeEntity(e), 0, 'a dead handle is refused by every store');
    assert.equal(store.size, 1, 'so the slot survives — this is the reversed order');
    assert.equal(store.prune(), 1, 'and only the sweep can reclaim it now');
  });

  it('destroyEntity is idempotent and reports the allocator’s answer', () => {
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const e = world.createEntity();
    transforms.set(e, { x: 1, y: 1 });

    assert.equal(world.destroyEntity(e), true);
    assert.equal(world.destroyEntity(e), false, 'second destroy is a no-op');
    assert.equal(transforms.size, 0);
  });

  it('the store’s version moves at destroy time, which is why the sweep was rejected', () => {
    // The reason the eager fan-out was chosen over a deferred prune(): the
    // version moves when the entity was destroyed rather than on whichever
    // tick a sweep happened to run, so QueryCache invalidates for a reason a
    // system could point at.
    //
    // Note the *query* half of this is not a check on the fan-out and is not
    // written as one: QueryCache keys on the allocator's version too, and
    // every store method skips non-live handles, so `query` would drop `a`
    // even with no fan-out at all. The load-bearing assertion here is the
    // version one — with no fan-out the store's version does not move.
    const world = emptyWorld();
    const transforms = world.store(Transform);
    const a = world.createEntity();
    const b = world.createEntity();
    transforms.set(a, { x: 1, y: 1 });
    transforms.set(b, { x: 2, y: 2 });
    assert.deepEqual([...world.query(Transform)], [a, b]);
    const versionBefore = transforms.version;

    world.destroyEntity(a);
    assert.ok(transforms.version > versionBefore, 'the destroy itself moved the store version');
    assert.deepEqual([...world.query(Transform)], [b]);
  });

  it('destroying an entity with no components costs nothing and still works', () => {
    const world = emptyWorld();
    world.store(Transform);
    const e = world.createEntity();
    assert.equal(world.destroyEntity(e), true);
    assert.equal(world.store(Transform).size, 0);
  });
});
