import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineComponent } from '@sim/ecs/ComponentDef';

interface Transform {
  x: number;
  y: number;
  z: number;
}

const Transform = defineComponent<Transform>('Transform');

/**
 * `defineComponent`'s own behaviour, separated from the store's by BL-068.
 *
 * There is one rule to check and it is the empty-name guard. It matters more
 * than its size suggests: a def's `name` is the save key (`23`) and the debug
 * label (`13`), so a nameless component produces a save file keyed on `""`
 * and an overlay row labelled nothing — and both fail silently, at a distance,
 * long after the call that caused them.
 *
 * What is deliberately *not* checked here is uniqueness. Two defs with the
 * same name are two different components, because the registry keys on object
 * identity; that collision is `ComponentRegistry`'s to catch, and its test
 * file is where the case lives.
 */
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
