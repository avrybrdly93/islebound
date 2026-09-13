import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type ComponentDef, defineComponent } from '@sim/ecs/ComponentDef';
import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import { EntityAllocator } from '@sim/ecs/EntityAllocator';
import { type AnyComponentDef, QueryCache } from '@sim/ecs/Query';
import { World } from '@sim/World';

/**
 * BL-065: which end of the def family `QueryCache.query` takes.
 *
 * **A separate file rather than more cases in `Query.test.ts`, for the reason
 * `Query.limit.test.ts` gives.** That file sits at 494 lines against a 500-line
 * hard limit (`max-lines` at `error`, decision 0029) and this block does not
 * fit in six. Split at the seam this item creates, which is also a different
 * concern from the intersection semantics `Query.test.ts` grades: this file is
 * about the *type* a def arrives as, and asserts nothing about which entities
 * come back beyond enough to prove the call compiled and ran.
 *
 * **Most of what this task changed is invisible in a green suite, which is why
 * this file exists.** `AnyComponentDef` moved from `ComponentDef<never>` — the
 * bottom of the family — to `ComponentDef<unknown>`, the top. Every runtime
 * behaviour is identical; what changed is that a caller holding a real
 * `ComponentDef<Vec>` no longer has to cast. A revert to the bottom would leave
 * every existing assertion passing and simply stop compiling, in 48 diffuse
 * errors across three files with nothing saying why. The cases below are the
 * one place that says why.
 *
 * **The `@ts-expect-error` cases *are* tests**, in the style
 * `ComponentRegistry.test.ts` and `EventBus.test.ts` established: if the
 * direction of the widening is ever reversed or doubled, they stop erroring and
 * the file fails to compile.
 */

interface Vec {
  x: number;
  y: number;
}

const Transform = defineComponent<Vec>('Transform');
const PlayerTag = defineComponent<true>('PlayerTag');
const Renderable = defineComponent<{ mesh: string }>('Renderable');

function fixture(): {
  allocator: EntityAllocator;
  registry: ComponentRegistry;
  queries: QueryCache;
} {
  const allocator = new EntityAllocator();
  const registry = new ComponentRegistry(allocator);
  return { allocator, registry, queries: new QueryCache(allocator, registry) };
}

describe('QueryCache.query takes the top of the def family (BL-065)', () => {
  it('accepts differently-typed defs together with no assertion at the call site', () => {
    // This is the acceptance criterion, executable. Three defs with three
    // unrelated value types -- an object, a literal `true`, a different object
    // -- handed straight to `query`. Under `ComponentDef<never>` not one of
    // them was assignable and every line here needed an `as`.
    const { allocator, registry, queries } = fixture();
    const entity = allocator.create();
    registry.store(Transform).set(entity, { x: 1, y: 2 });
    registry.store(PlayerTag).set(entity, true);
    registry.store(Renderable).set(entity, { mesh: 'player' });

    assert.deepEqual([...queries.query(Transform, PlayerTag, Renderable)], [entity]);
  });

  it('accepts a def whose value type is itself `unknown`', () => {
    // The top of the family is a member of it. Worth pinning because a
    // parameter type that excluded its own witness would be a sign the
    // widening had been written as a constraint rather than as a position.
    const { allocator, registry, queries } = fixture();
    const Opaque: ComponentDef<unknown> = defineComponent<unknown>('Opaque');
    const entity = allocator.create();
    registry.store(Opaque).set(entity, 'anything');

    assert.deepEqual([...queries.query(Opaque)], [entity]);
  });

  it('is reached from `World.query` with no cast in between', () => {
    // `World.query` already took `ComponentDef<unknown>` (BL-061) and carried
    // one erasing `as` to reach the cache. That cast is deleted; this is the
    // whole path it stood on, exercised end to end.
    const world = new World([]);
    const entity = world.createEntity();
    world.store(Transform).set(entity, { x: 0, y: 0 });
    world.store(PlayerTag).set(entity, true);

    assert.deepEqual([...world.query(Transform, PlayerTag)], [entity]);
  });

  it('widened in one direction only', () => {
    // The pins below are the reason `AnyComponentDef`'s doc says *which
    // position* it is for. Widening a parameter type is safe because a def
    // flows *in*; the same type flowing *out* into a typed slot is not, and
    // these fail to compile if that ever becomes possible.
    const anyDef: AnyComponentDef = Transform;

    // @ts-expect-error -- the top is not assignable to a specific member: a
    // `ComponentDef<unknown>` could be any component, and this slot wants Vec
    const narrowed: ComponentDef<Vec> = anyDef;

    // @ts-expect-error -- nor to the old bottom, which is what this task moved
    // away from; nothing but itself is assignable to `ComponentDef<never>`
    const bottom: ComponentDef<never> = anyDef;

    // Reads, not calls, in the style `ComponentRegistry.test.ts` uses: the
    // erasure is type-level only and these are all the same object at runtime.
    assert.equal(narrowed.name, 'Transform');
    assert.equal(bottom.name, 'Transform');
    assert.equal(anyDef.name, 'Transform');
  });
});
