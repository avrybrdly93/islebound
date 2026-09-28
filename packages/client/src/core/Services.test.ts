import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DuplicateServiceError, Services, UnregisteredServiceError } from '@core/Services';

/**
 * BL-009 criterion 1: "Accessing an unregistered service throws a clear error
 * naming the service."
 *
 * The criterion is about a *message*, so the assertions are about the message
 * and not only about the throw. "Clear" is read as two things a reader can
 * check: the error names the key that was asked for, and it says what *was*
 * registered — because the usual causes are a typo and a root that wired
 * things in the wrong order, and the second half is what distinguishes them.
 *
 * The `undefined` case is the one worth knowing about. A registry that asks
 * `if (!value) throw` reports "no service registered under x" for a service
 * somebody did register, which sends the reader to the composition root to
 * look for a call that is already there. Membership is asked of the map.
 */

interface TestServices {
  clock: { now(): number };
  label: string;
  optional: string | undefined;
}

describe('Services: the unregistered-service error (criterion 1)', () => {
  it('throws, and names the service that was asked for', () => {
    const services = new Services<TestServices>();

    assert.throws(
      () => services.get('clock'),
      (error: unknown) => {
        assert.ok(error instanceof UnregisteredServiceError);
        assert.equal(error.service, 'clock');
        assert.match(error.message, /"clock"/);
        return true;
      },
    );
  });

  it('lists what is registered, so a typo is visible in the message', () => {
    const services = new Services<TestServices>();
    services.register('label', 'island');

    assert.throws(
      () => services.get('clock'),
      (error: unknown) => {
        assert.ok(error instanceof UnregisteredServiceError);
        assert.deepEqual(error.registered, ['label']);
        assert.match(error.message, /registered: label/);
        return true;
      },
    );
  });

  it('says so plainly when nothing at all is registered', () => {
    // The empty case reads badly if it is written as an empty list, and the
    // empty case is the common one — a `get` before the root has run.
    const services = new Services<TestServices>();
    assert.throws(() => services.get('clock'), /nothing is registered/);
  });

  it('does not report a service registered as undefined as missing', () => {
    // The distinguishing case for "membership is asked of the map". A registry
    // that tested the VALUE would throw here, with a message naming a service
    // the caller did register.
    const services = new Services<TestServices>();
    services.register('optional', undefined);

    assert.equal(services.has('optional'), true);
    assert.equal(services.get('optional'), undefined);
  });
});

describe('Services: registration', () => {
  it('returns what was registered, under the type the map declares', () => {
    const services = new Services<TestServices>();
    const clock = { now: () => 42 };
    services.register('clock', clock);

    // Both lines are the assertion: `now()` only compiles if `get` narrowed to
    // the map's entry rather than returning `unknown`, so this case fails
    // `pnpm typecheck` if the generic ever loosens.
    assert.equal(services.get('clock').now(), 42);
    assert.equal(services.get('clock'), clock);
  });

  it('refuses a second registration under the same key', () => {
    const services = new Services<TestServices>();
    services.register('label', 'first');

    assert.throws(
      () => {
        services.register('label', 'second');
      },
      (error: unknown) => {
        assert.ok(error instanceof DuplicateServiceError);
        assert.equal(error.service, 'label');
        return true;
      },
    );
    assert.equal(services.get('label'), 'first');
  });

  it('replaces only when asked to, and replace() is the way to ask', () => {
    const services = new Services<TestServices>();
    services.register('label', 'first');
    services.replace('label', 'second');

    assert.equal(services.get('label'), 'second');
  });

  it('reports its keys sorted, so a diagnostic does not depend on wiring order', () => {
    const a = new Services<TestServices>();
    a.register('label', 'x');
    a.register('clock', { now: () => 0 });

    const b = new Services<TestServices>();
    b.register('clock', { now: () => 0 });
    b.register('label', 'x');

    assert.deepEqual(a.keys(), ['clock', 'label']);
    assert.deepEqual(a.keys(), b.keys());
  });

  it('reports has() as false before registration and true after', () => {
    const services = new Services<TestServices>();
    assert.equal(services.has('label'), false);
    services.register('label', 'x');
    assert.equal(services.has('label'), true);
  });
});
