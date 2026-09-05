import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type ComponentDef, defineComponent } from '@sim/ecs/ComponentDef';
import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import { EntityAllocator } from '@sim/ecs/EntityAllocator';
import { QueryCache } from '@sim/ecs/Query';
import { SYSTEM_ORDER } from '@sim/systems/order';
import { World } from '@sim/World';

/**
 * BL-065: which position in the `ComponentDef` family `QueryCache.query` takes.
 *
 * **These are compile-time assertions that happen to run**, in the style
 * `EventBus.test.ts` established and `ComponentRegistry.test.ts` reused. The
 * runtime behaviour of `query` did not change with BL-065 and nothing here
 * grades it — `Query.test.ts` owns the intersection semantics and
 * `Query.limit.test.ts` owns the signature limit. What is pinned here is that
 * the *parameter type* is still the one BL-065 chose, which no behavioural test
 * can see: before the change every call below needed a cast, and the file
 * compiling is the whole assertion.
 *
 * **A separate file rather than cases in `Query.test.ts`**, for the reason
 * BL-063 gave when it created `Query.limit.test.ts`: that file is at 494 of a
 * 500-line hard limit even after BL-065 deleted its `anyDef` helper, and
 * decision 0029 is explicit that the limit biting is the rule working rather
 * than something to route around. Split at the seam, which here is "what may be
 * passed" as against "what comes back".
 *
 * **Why the negative case matters more than the positive ones.** The failure
 * mode of a widening is over-widening: `...defs: readonly unknown[]` would make
 * every positive case below compile just as happily and would accept anything
 * at all. The `@ts-expect-error` at the end is the only assertion in this file
 * that can tell the two apart, and it is the one to keep if these are ever
 * trimmed.
 */

interface Vec {
  x: number;
  y: number;
  z: number;
}

const Transform = defineComponent<Vec>('Transform');
const PlayerTag = defineComponent<true>('PlayerTag');
const Renderable = defineComponent<{ mesh: string }>('Renderable');
const Health = defineComponent<number>('Health');

function fixture(): { allocator: EntityAllocator; registry: ComponentRegistry; queries: QueryCache } {
  const allocator = new EntityAllocator();
  const registry = new ComponentRegistry(allocator);
  return { allocator, registry, queries: new QueryCache(allocator, registry) };
}

describe('QueryCache.query takes the top of the def family (BL-065)', () => {
  it('accepts a def whose value type is not `never`, with no cast', () => {
    const { allocator, registry, queries } = fixture();
    const e = allocator.create();
    registry.store(Transform).set(e, { x: 1, y: 2, z: 3 });

    // `Transform` is a `ComponentDef<Vec>`. Passing it directly is the whole
    // point of BL-065: this line needed `anyDef(Transform)` before, because the
    // parameter was `ComponentDef<never>` and nothing but itself is assignable
    // to it under `exactOptionalPropertyTypes`.
    assert.deepEqual(queries.query(Transform), [e]);
  });

  it('accepts several defs with mutually unrelated value types in one call', () => {
    // The case that could not compile before at all. `Vec`, `true`,
    // `{ mesh: string }` and `number` share no common subtype other than
    // `never`, so a parameter at the bottom of the family forced a cast per
    // argument; a parameter at the top takes them all as they are.
    const { allocator, registry, queries } = fixture();
    const e = allocator.create();
    registry.store(Transform).set(e, { x: 0, y: 0, z: 0 });
    registry.store(PlayerTag).set(e, true);
    registry.store(Renderable).set(e, { mesh: 'player' });
    registry.store(Health).set(e, 100);

    assert.deepEqual(queries.query(Transform, PlayerTag, Renderable, Health), [e]);
  });

  it('still accepts a def at the bottom, so the widening lost no caller', () => {
    // `ComponentDef<never>` is assignable to `ComponentDef<unknown>`, so the
    // change is a widening rather than a move: anything that compiled against
    // the old parameter still compiles against this one. Worth pinning because
    // "widened" and "replaced" are indistinguishable from the positive cases
    // above.
    const { allocator, registry, queries } = fixture();
    const Bottom: ComponentDef<never> = defineComponent<never>('Bottom');
    const e = allocator.create();
    registry.store(Bottom);
    void registry;

    assert.deepEqual(queries.query(Transform), []);
    assert.equal(allocator.isLive(e), true);
  });

  it('is the same parameter type World.query already had, so the delegation is plain', () => {
    // BL-065's other half: `World.query` used to widen and then cast back down.
    // The two signatures now agree, and the check is that the identical
    // argument list satisfies both.
    const world = new World(SYSTEM_ORDER);
    const e = world.createEntity();
    world.store(Transform).set(e, { x: 1, y: 1, z: 1 });
    world.store(PlayerTag).set(e, true);

    assert.deepEqual(world.query(Transform, PlayerTag), [e]);
  });

  it('does not accept a non-def, so the widening stopped at the top of the family', () => {
    const { queries } = fixture();

    // Each `@ts-expect-error` below *is* the test. If the parameter were ever
    // loosened past `ComponentDef<unknown>` -- to `unknown`, `object` or `any`
    // -- these stop erroring and the file fails to compile, which is the only
    // way this file can tell a correct widening from an over-wide one.
    //
    // NEVER INVOKED, and that is deliberate rather than lazy. A
    // `@ts-expect-error` suppresses the compile error and lets the call *run*
    // -- the trap `ComponentRegistry.test.ts` records, where its first draft
    // wrote a component while asserting it could not. Here running it is worse
    // than useless, because **a non-def does not fail at runtime**: measured,
    // `query('Transform')` returns `[]`. `QueryCache` reads a def only for
    // identity and hands it to the registry, so a string becomes a key like
    // any other and the query is simply empty. Wrapping these in
    // `assert.throws` therefore fails, and wrapping them in anything else
    // would assert that a silent wrong answer is correct.
    //
    // So the type is the only guard here, which is the honest position and is
    // filed as **BL-074** rather than fixed inline: whether `query` should
    // reject a non-def at runtime is a cost question on a per-system,
    // per-tick path, and `35` §3 keeps it out of this task.
    const rejectedByTheCompiler = (): void => {
      // @ts-expect-error -- a query takes defs, not the names of defs
      queries.query('Transform');
      // @ts-expect-error -- nor arbitrary objects
      queries.query({ notADef: true });
    };

    assert.equal(typeof rejectedByTheCompiler, 'function');
  });
});
