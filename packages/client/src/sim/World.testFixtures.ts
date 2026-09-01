/**
 * Shared fixtures for the `World` suites (`World.test.ts` and
 * `World.step.test.ts`).
 *
 * Extracted by BL-069, which split a 547-line `World.test.ts` in two to get it
 * under the 500-line hard limit `max-lines` now enforces. The two halves both
 * build worlds and both reach for the same component defs and the same empty
 * world, so the alternative was two copies that drift.
 *
 * Not a barrel file: it declares these values, it does not re-export somebody
 * else's. Same standing as `core/math/allocationHarness.ts`, which
 * `EventBus.test.ts` has imported since BL-003.
 */

import { defineComponent } from '@sim/ecs/ComponentDef';
import type { RegisteredSystem } from '@sim/systems/order';
import { World } from '@sim/World';

export interface Vec {
  x: number;
  y: number;
}

export const Transform = defineComponent<Vec>('Transform');
export const Velocity = defineComponent<Vec>('Velocity');
export const PlayerTag = defineComponent<true>('PlayerTag');
export const Health = defineComponent<number>('Health');

/** A system that appends its name to `log` when it runs. */
export function recorder(name: string, log: string[]): RegisteredSystem<Record<never, never>> {
  return {
    name,
    run: () => {
      log.push(name);
    },
  };
}

/** A world with no systems — the shape every non-`step` case wants. */
export function emptyWorld(): World {
  return new World([]);
}
