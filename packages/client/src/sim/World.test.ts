import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComponentRegistry, defineComponent } from '@sim/ecs/ComponentStore';
import { EntityAllocator, indexOf } from '@sim/ecs/EntityAllocator';
import { SYSTEM_ORDER, type RegisteredSystem } from '@sim/systems/order';
import { World } from '@sim/World';

/**
 * BL-061's two acceptance criteria, plus the traps that make each of them
 * passable while wrong.
 *
 * **Criterion 1 — "delegates, no second implementation" — cannot be tested by
 * behaviour.** A `World` that reimplemented an allocator would behave exactly
 * like one that delegates, because the reimplementation would be a copy of the
 * same algorithm. So the cases below assert *identity*: the store `World.store`
 * hands back is the same object the registry would, the query result is the
 * cache's own frozen array, and the cache's hit counter moves when `World.query`
 * is called twice. Those are observations a second implementation fails.
 *
 * **Criterion 2 — "the order is data" — is the one a passing test can miss.**
 * A world that ran its systems in the array's order would pass any test that
 * only checks *that* they ran. The order cases therefore use systems that
 * append to a shared log, and run the same set in two different orders in the
 * same test, so a `step` that sorted, reversed or ignored the array fails.
 */

interface Vec {
  x: number;
  y: number;
}

const Transform = defineComponent<Vec>('Transform');
const Velocity = defineComponent<Vec>('Velocity');
const PlayerTag = defineComponent<true>('PlayerTag');
const Health = defineComponent<number>('Health');

/** A system that appends its name to `log` when it runs. */
function recorder(name: string, log: string[]): RegisteredSystem<Record<never, never>> {
  return {
    name,
    run: () => {
      log.push(name);
    },
  };
}

/** A world with no systems — the shape every non-`step` case wants. */
function emptyWorld(): World {
  return new World([]);
}

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

describe('World — criterion 2: step runs the order the array declares', () => {
  it('runs every system, once, per step', () => {
    const log: string[] = [];
    const world = new World([recorder('a', log), recorder('b', log)]);
    world.step(1 / 30);
    assert.deepEqual(log, ['a', 'b']);
    world.step(1 / 30);
    assert.deepEqual(log, ['a', 'b', 'a', 'b']);
  });

  it('honours the array’s order, not the systems’ names or identities', () => {
    // The case that fails a `step` which sorted, reversed, or ran systems in
    // any order of its own: the same three systems, two different arrays.
    const forward: string[] = [];
    new World([recorder('a', forward), recorder('b', forward), recorder('c', forward)]).step(
      1 / 30,
    );
    assert.deepEqual(forward, ['a', 'b', 'c']);

    const backward: string[] = [];
    new World([recorder('c', backward), recorder('b', backward), recorder('a', backward)]).step(
      1 / 30,
    );
    assert.deepEqual(backward, ['c', 'b', 'a']);
  });

  it('passes the world and dt through unchanged', () => {
    const seen: { world: unknown; dt: number }[] = [];
    const world = new World([
      {
        name: 'probe',
        run: (w, dt) => {
          seen.push({ world: w, dt });
        },
      },
    ]);
    world.step(1 / 30);
    assert.equal(seen.length, 1);
    const only = seen[0];
    assert.ok(only !== undefined);
    assert.equal(only.world, world, 'the system receives the world itself, not a wrapper');
    assert.equal(only.dt, 1 / 30);
  });

  it('advances the tick before the systems run, so a system sees its own tick', () => {
    const ticks: number[] = [];
    const world = new World([
      {
        name: 'probe',
        run: (w) => {
          ticks.push(w.tick);
        },
      },
    ]);
    assert.equal(world.tick, 0, 'a world that has not stepped is at tick 0');
    world.step(1 / 30);
    world.step(1 / 30);
    assert.deepEqual(ticks, [1, 2], 'not [0, 1] -- the tick a system sees is the one it is in');
    assert.equal(world.tick, 2);
  });

  it('a system may create, mutate and query through the world it is handed', () => {
    const world = new World<Record<never, never>>([
      {
        name: 'spawner',
        run: (w) => {
          const e = w.createEntity();
          w.store(Transform).set(e, { x: w.tick, y: 0 });
        },
      },
      {
        name: 'reader',
        run: (w) => {
          const found = w.query(Transform);
          const last = found[found.length - 1];
          if (last !== undefined) w.store(Velocity).set(last, { x: found.length, y: 0 });
        },
      },
    ]);
    world.step(1 / 30);
    world.step(1 / 30);
    const entities = world.query(Transform);
    assert.equal(entities.length, 2);
    const [firstSpawn, secondSpawn] = entities;
    assert.ok(firstSpawn !== undefined && secondSpawn !== undefined);
    assert.deepEqual(world.store(Transform).get(firstSpawn), { x: 1, y: 0 });
    assert.deepEqual(world.store(Transform).get(secondSpawn), { x: 2, y: 0 });
    assert.deepEqual(world.store(Velocity).get(secondSpawn), { x: 2, y: 0 });
  });

  it('a throwing system aborts the tick, names itself, and keeps the cause', () => {
    const log: string[] = [];
    const boom = new Error('boom');
    const world = new World([
      recorder('before', log),
      {
        name: 'thrower',
        run: () => {
          throw boom;
        },
      },
      recorder('after', log),
    ]);

    assert.throws(
      () => {
        world.step(1 / 30);
      },
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /system "thrower" threw on tick 1/);
        assert.equal(error.cause, boom, 'the original error is not swallowed');
        return true;
      },
    );
    assert.deepEqual(log, ['before'], 'systems after the thrower do not run');
    assert.equal(world.tick, 1, 'the tick is not rolled back -- the world really did advance');
  });

  it('a stepped world with no systems still advances', () => {
    const world = emptyWorld();
    world.step(1 / 30);
    assert.equal(world.tick, 1);
  });
});

describe('World — events', () => {
  it('drains the deferred queue once, after every system', () => {
    // `04` §4.4 leaves the drain point to "the loop's owner"; World.step is now
    // that owner and this is the case that pins the choice. A drain before the
    // systems, or per-system, gives a different delivered/queued split here.
    const delivered: string[] = [];
    const world = new World<{ 'test:pinged': { from: string } }>([
      {
        name: 'first',
        run: (w) => {
          w.events.enqueue('test:pinged', { from: 'first' });
          delivered.push(`first sees queued=${String(w.events.queuedCount)}`);
        },
      },
      {
        name: 'second',
        run: (w) => {
          w.events.enqueue('test:pinged', { from: 'second' });
          delivered.push(`second sees queued=${String(w.events.queuedCount)}`);
        },
      },
    ]);
    world.events.on('test:pinged', (payload) => {
      delivered.push(`delivered ${payload.from}`);
    });

    world.step(1 / 30);
    assert.deepEqual(delivered, [
      'first sees queued=1',
      'second sees queued=2',
      'delivered first',
      'delivered second',
    ]);
    assert.equal(world.events.queuedCount, 0);
  });

  it('emit is synchronous and unaffected by the drain point', () => {
    // The distinction is the bus's, not World's, but a World that "helpfully"
    // deferred emit would break every system that needs another to see
    // something this tick. Pinned here because World.step is where somebody
    // would be tempted to add that.
    const seen: string[] = [];
    const world = new World<{ 'test:now': { at: string } }>([
      {
        name: 'emitter',
        run: (w) => {
          w.events.emit('test:now', { at: 'inside a system' });
          seen.push('after emit');
        },
      },
    ]);
    world.events.on('test:now', (payload) => {
      seen.push(`handled ${payload.at}`);
    });
    world.step(1 / 30);
    assert.deepEqual(seen, ['handled inside a system', 'after emit']);
  });

  it('does not drain when a system throws', () => {
    // A half-run tick has produced a state no system order would produce;
    // telling presentation about it would be worse than the throw.
    const delivered: string[] = [];
    const world = new World<{ 'test:pinged': null }>([
      {
        name: 'emitter',
        run: (w) => {
          w.events.enqueue('test:pinged', null);
        },
      },
      {
        name: 'thrower',
        run: () => {
          throw new Error('boom');
        },
      },
    ]);
    world.events.on('test:pinged', () => {
      delivered.push('delivered');
    });
    assert.throws(() => {
      world.step(1 / 30);
    });
    assert.deepEqual(delivered, []);
    assert.equal(world.events.queuedCount, 1, 'still queued, not lost');
  });
});

describe('World — purity', () => {
  it('two worlds stepped identically agree, and neither reads a clock', () => {
    // `04` §4.2: the simulation must be reproducible from seed + input alone.
    // World holds no clock and no randomness of its own; this is the cheap
    // end-to-end statement of that, and the thing that would fail if somebody
    // seeded an id from Date.now().
    const build = (): World => {
      const world = new World([
        {
          name: 'spawn',
          run: (w) => {
            const e = w.createEntity();
            w.store(Transform).set(e, { x: w.tick, y: w.tick * 2 });
          },
        },
      ]);
      for (let i = 0; i < 10; i += 1) {
        world.step(1 / 30);
      }
      return world;
    };

    const a = build();
    const b = build();
    assert.equal(a.tick, b.tick);
    assert.deepEqual([...a.query(Transform)], [...b.query(Transform)]);
    assert.deepEqual(
      [...a.query(Transform)].map((e) => a.store(Transform).get(e)),
      [...b.query(Transform)].map((e) => b.store(Transform).get(e)),
    );
  });

  it('each world has its own allocator, registry, cache and bus', () => {
    const a = emptyWorld();
    const b = emptyWorld();
    a.createEntity();
    assert.equal(a.entityCount, 1);
    assert.equal(b.entityCount, 0, 'no module-level state shared between worlds');

    a.store(Transform);
    assert.equal(b.hasStore(Transform), false);
    assert.notEqual(a.events, b.events);
  });
});
