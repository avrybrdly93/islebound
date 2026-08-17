import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashU32 } from '@core/math/hash';
import {
  EntityAllocator,
  type EntityId,
  MAX_GENERATION,
  MAX_INDEX,
  NULL_ENTITY,
  generationOf,
  indexOf,
} from '@sim/ecs/EntityAllocator';

/**
 * BL-007's four acceptance criteria.
 *
 * The aliasing criterion is the one worth reading carefully. "Recycled entity
 * IDs never alias" is a claim about a set, not about a pair, so the sweep below
 * checks every handle against every handle it could collide with rather than
 * against its immediate predecessor — a wrapping generation counter passes the
 * pairwise version for 4,094 of every 4,095 cycles.
 */

describe('BL-007 handle layout', () => {
  it('never issues NULL_ENTITY, because generations start at 1', () => {
    const alloc = new EntityAllocator();
    // Index 0 is a real index. Only the generation floor keeps its first
    // handle from being the number 0, which would make `if (entity)` lie.
    const first = alloc.create();
    assert.equal(indexOf(first), 0);
    assert.equal(generationOf(first), 1);
    assert.notEqual(first, NULL_ENTITY);
    assert.equal(alloc.isLive(NULL_ENTITY), false);
  });

  it('packs index and generation losslessly across the whole range', () => {
    const alloc = new EntityAllocator();
    const e = alloc.create();
    assert.equal(indexOf(e) | (generationOf(e) << 20), e);
    assert.equal(MAX_INDEX, 1048575);
    assert.equal(MAX_GENERATION, 4095);
  });

  it('stays an unsigned 32-bit integer once the generation sets bit 31', () => {
    // Generations from 2048 up set bit 31, and JavaScript's bitwise operators
    // are signed. A handle that came back negative here would still behave in
    // most code and would hash differently, which is the worst failure shape.
    const alloc = new EntityAllocator();
    let handle: EntityId = alloc.create();
    for (let i = 0; i < 2100; i += 1) {
      alloc.destroy(handle);
      handle = alloc.create();
    }
    assert.ok(generationOf(handle) > 2048, `generation ${generationOf(handle)} did not reach 2048`);
    assert.ok(handle > 0, `handle ${handle} is not positive`);
    assert.equal(handle, handle >>> 0);
  });
});

describe('BL-007 criterion 1: recycled ids never alias over 1M create/destroy cycles', () => {
  it('issues no handle twice in 1,000,000 cycles', () => {
    const alloc = new EntityAllocator();
    const seen = new Set<EntityId>();
    let handle = alloc.create();
    seen.add(handle);

    for (let i = 1; i < 1_000_000; i += 1) {
      alloc.destroy(handle);
      handle = alloc.create();
      assert.equal(seen.has(handle), false, `handle ${handle} reissued at cycle ${i}`);
      seen.add(handle);
    }

    assert.equal(seen.size, 1_000_000);
    // 1M cycles over a 4,095-generation index means indices are retired and
    // the allocator moves on rather than wrapping. Both facts are load-bearing.
    assert.ok(alloc.retiredCount > 0, 'no index was retired, so generation must have wrapped');
    assert.equal(alloc.retiredCount, Math.floor(1_000_000 / MAX_GENERATION));
  });

  it('rejects a handle from a previous generation of a live index', () => {
    const alloc = new EntityAllocator();
    const stale = alloc.create();
    alloc.destroy(stale);
    const fresh = alloc.create();

    assert.equal(indexOf(fresh), indexOf(stale), 'the index should have been recycled');
    assert.notEqual(fresh, stale);
    assert.equal(alloc.isLive(stale), false);
    assert.equal(alloc.isLive(fresh), true);
    // The distinction a bare index cannot make: the slot is live, this handle
    // to it is not.
    assert.equal(alloc.destroy(stale), false);
    assert.equal(alloc.isLive(fresh), true, 'destroying a stale handle killed the live entity');
  });

  it('reports a double destroy rather than corrupting the count', () => {
    const alloc = new EntityAllocator();
    const e = alloc.create();
    assert.equal(alloc.destroy(e), true);
    assert.equal(alloc.destroy(e), false);
    assert.equal(alloc.liveCount, 0);
  });
});

describe('BL-007 criterion 2: live iteration is ascending index order, always', () => {
  it('is ascending after churn that leaves the free list out of order', () => {
    const alloc = new EntityAllocator();
    const handles = Array.from({ length: 12 }, () => alloc.create());

    // Free a scattered set. The free list is LIFO, so the next allocations
    // come back in reverse-destroy order -- the case where "allocation order"
    // and "ascending order" disagree.
    for (const i of [7, 2, 9, 4]) alloc.destroy(handles[i] ?? NULL_ENTITY);
    const reused = [alloc.create(), alloc.create(), alloc.create()];
    assert.deepEqual(
      reused.map(indexOf),
      [4, 9, 2],
      'free list should be LIFO; this test is about the order it is NOT',
    );

    const indices = [...alloc.liveEntities()].map(indexOf);
    assert.deepEqual(
      indices,
      [...indices].sort((a, b) => a - b),
    );
    assert.deepEqual(indices, [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11]);
    assert.equal(alloc.liveCount, indices.length);
  });

  it('yields exactly the live handles, with their current generations', () => {
    const alloc = new EntityAllocator();
    const a = alloc.create();
    const b = alloc.create();
    alloc.destroy(a);
    const c = alloc.create();

    assert.deepEqual([...alloc.liveEntities()], [c, b]);
    for (const e of alloc.liveEntities()) assert.equal(alloc.isLive(e), true);
  });

  it('is empty, not undefined, for a fresh allocator', () => {
    assert.deepEqual([...new EntityAllocator().liveEntities()], []);
  });
});

describe('BL-007 criterion 3: a handle survives cloning and hashing unchanged', () => {
  it('round-trips through structuredClone', () => {
    const alloc = new EntityAllocator();
    for (let i = 0; i < 3000; i += 1) alloc.create();
    const handles = [...alloc.liveEntities()];

    // A component may hold an EntityId as a reference to another entity
    // (`04` §4.3), so the shape that has to survive is a handle nested in
    // plain data, not only a bare number.
    const owner = handles[2999] ?? NULL_ENTITY;
    const component = { owner, targets: handles.slice(0, 4) };
    const cloned = structuredClone(component);

    assert.deepEqual(cloned, component);
    assert.equal(alloc.isLive(cloned.owner), true);
    assert.equal(generationOf(cloned.owner), generationOf(component.owner));
  });

  it('hashes identically before and after a clone, for every handle', () => {
    // worldHash is FNV-1a over a canonical serialisation (`04` §4.2 item 6),
    // so a handle that hashed differently after a save/load round-trip would
    // break determinism without breaking anything visible first.
    const alloc = new EntityAllocator();
    let handle = alloc.create();
    for (let i = 0; i < 5000; i += 1) {
      const cloned = structuredClone(handle);
      assert.equal(cloned, handle);
      assert.equal(hashU32(cloned), hashU32(handle));
      alloc.destroy(handle);
      handle = alloc.create();
    }
  });
});

describe('BL-007 criterion 4: exhaustion fails loudly instead of aliasing', () => {
  it('retires an index whose generation is spent rather than wrapping it', () => {
    const alloc = new EntityAllocator();
    let handle = alloc.create();
    assert.equal(indexOf(handle), 0);

    // MAX_GENERATION - 1 destroy/create pairs walk index 0 from generation 1
    // to MAX_GENERATION; the next destroy retires it.
    for (let i = 1; i < MAX_GENERATION; i += 1) {
      alloc.destroy(handle);
      handle = alloc.create();
    }
    assert.equal(indexOf(handle), 0);
    assert.equal(generationOf(handle), MAX_GENERATION);
    assert.equal(alloc.retiredCount, 0);

    alloc.destroy(handle);
    assert.equal(alloc.retiredCount, 1);

    const next = alloc.create();
    assert.equal(indexOf(next), 1, 'index 0 was reused after its generation was spent');
    assert.equal(alloc.isLive(handle), false);
  });

  it('throws, naming the limit, when the index space is spent', () => {
    // The allocator is asked for one handle past MAX_INDEX. This is the only
    // path in the module that cannot be recovered from, so it must be the one
    // path that throws.
    const alloc = new EntityAllocator();
    for (let i = 0; i <= MAX_INDEX; i += 1) alloc.create();
    assert.equal(alloc.capacity, MAX_INDEX + 1);
    assert.equal(alloc.liveCount, MAX_INDEX + 1);

    assert.throws(() => alloc.create(), /index space exhausted/);

    // Still usable afterwards: the throw did not corrupt the allocator.
    assert.equal(alloc.liveCount, MAX_INDEX + 1);
  });
});
