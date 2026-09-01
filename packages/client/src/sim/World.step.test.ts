import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { World } from '@sim/World';
import { Transform, Velocity, emptyWorld, recorder } from '@sim/World.testFixtures';

/**
 * BL-061's criterion 2, plus `World`'s event plumbing and its purity
 * constraints.
 *
 * **"The order is data" is the criterion a passing test can miss.** A world
 * that ran its systems in the array's order would pass any test that only
 * checks *that* they ran. The order cases therefore use systems that append to
 * a shared log, and run the same set in two different orders in the same test,
 * so a `step` that sorted, reversed or ignored the array fails.
 *
 * Criterion 1 is in `World.test.ts`; the fixtures both files use are in
 * `World.testFixtures.ts`. Split by BL-069 to get under the 500-line hard
 * limit.
 */

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
