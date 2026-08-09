import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EASINGS,
  type EasingName,
  applyEasing,
  backOut,
  elasticOut,
  linear,
} from '@core/math/easing';
import {
  FNV_OFFSET_BASIS,
  hashByte,
  hashNumberInto,
  hashString,
  hashStringInto,
  hashToHex,
  hashU32,
  hashU32Into,
  hashWords,
} from '@core/math/hash';

const names = Object.keys(EASINGS) as EasingName[];

describe('easing curves', () => {
  it('every curve starts at 0 and ends at 1', () => {
    // The property that matters: a curve missing an endpoint produces a pop at
    // the start or end of an animation, which is the artefact easing exists to
    // remove. Asserted over the whole table, so a curve added later is covered
    // without anyone remembering to add a case.
    for (const name of names) {
      const f = EASINGS[name];
      assert.ok(Math.abs(f(0)) < 1e-12, `${name}(0) = ${f(0)}`);
      assert.ok(Math.abs(f(1) - 1) < 1e-12, `${name}(1) = ${f(1)}`);
    }
  });

  it('every curve is finite across the unit interval', () => {
    for (const name of names) {
      for (let i = 0; i <= 100; i++) {
        const value = EASINGS[name](i / 100);
        assert.ok(Number.isFinite(value), `${name}(${i / 100}) = ${value}`);
      }
    }
  });

  it('linear is the identity', () => {
    for (const t of [0, 0.3, 0.5, 1]) assert.equal(linear(t), t);
  });

  it('the in/out pairs are mirror images', () => {
    // easeOut(t) === 1 - easeIn(1 - t) is the definition of the pair, and it is
    // the relation a hand-expanded polynomial most easily gets subtly wrong.
    const pairs: readonly (readonly [EasingName, EasingName])[] = [
      ['quadIn', 'quadOut'],
      ['cubicIn', 'cubicOut'],
      ['sineIn', 'sineOut'],
      ['expoIn', 'expoOut'],
      ['backIn', 'backOut'],
    ];
    for (const [inName, outName] of pairs) {
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const mirrored = 1 - EASINGS[inName](1 - t);
        assert.ok(
          Math.abs(EASINGS[outName](t) - mirrored) < 1e-12,
          `${outName}(${t}) = ${EASINGS[outName](t)}, mirror of ${inName} = ${mirrored}`,
        );
      }
    }
  });

  it('the inOut curves are symmetric about (0.5, 0.5)', () => {
    for (const name of ['quadInOut', 'cubicInOut', 'sineInOut'] as const) {
      const f = EASINGS[name];
      assert.ok(Math.abs(f(0.5) - 0.5) < 1e-12, `${name}(0.5) = ${f(0.5)}`);
      for (let i = 0; i <= 10; i++) {
        const t = i / 20;
        assert.ok(Math.abs(f(t) + f(1 - t) - 1) < 1e-12, `${name} is not symmetric at t=${t}`);
      }
    }
  });

  it('the non-overshooting curves are monotonic', () => {
    // backIn/backOut, elasticOut and bounceOut are excluded on purpose: the
    // first three overshoot and the last bounces, all by design, and a
    // monotonicity assertion over them would assert the opposite of what they
    // are for. Each is covered by its own case below instead.
    const OSCILLATING: ReadonlySet<string> = new Set([
      'backIn',
      'backOut',
      'elasticOut',
      'bounceOut',
    ]);
    const monotone = names.filter((name) => !OSCILLATING.has(name));
    for (const name of monotone) {
      const f = EASINGS[name];
      let previous = -Infinity;
      for (let i = 0; i <= 200; i++) {
        const value = f(i / 200);
        assert.ok(value >= previous - 1e-12, `${name} fell at t=${i / 200}`);
        previous = value;
      }
    }
  });

  it('backOut and elasticOut overshoot, which is the point of them', () => {
    let backMax = 0;
    let elasticMax = 0;
    for (let i = 0; i <= 200; i++) {
      backMax = Math.max(backMax, backOut(i / 200));
      elasticMax = Math.max(elasticMax, elasticOut(i / 200));
    }
    assert.ok(backMax > 1.05, `backOut peaked at ${backMax}`);
    assert.ok(elasticMax > 1.05, `elasticOut peaked at ${elasticMax}`);
  });

  it('bounceOut never exceeds 1 and does bounce', () => {
    let fell = false;
    let previous = 0;
    for (let i = 0; i <= 200; i++) {
      const value = EASINGS.bounceOut(i / 200);
      assert.ok(value <= 1 + 1e-12, `bounceOut exceeded 1 at t=${i / 200}`);
      if (value < previous - 1e-12) fell = true;
      previous = value;
    }
    assert.ok(fell, 'bounceOut never fell, so it is not bouncing');
  });
});

describe('applyEasing', () => {
  it('clamps its input but not its output', () => {
    assert.equal(applyEasing('linear', -3), 0);
    assert.equal(applyEasing('linear', 4), 1);
    // The overshoot survives, because a caller feeding it to an opacity must
    // clamp the output deliberately rather than have it silently flattened.
    let peak = 0;
    for (let i = 0; i <= 100; i++) peak = Math.max(peak, applyEasing('backOut', i / 100));
    assert.ok(peak > 1);
  });

  it('dispatches to the same function as a direct call', () => {
    for (const name of names) {
      assert.equal(applyEasing(name, 0.375), EASINGS[name](0.375));
    }
  });
});

describe('FNV-1a hashing', () => {
  it('reproduces the published FNV-1a 32-bit vectors for ASCII input', () => {
    // The one thing that makes this "FNV-1a" rather than "a hash we wrote":
    // published test vectors, computed by folding the UTF-16 low byte of each
    // ASCII character (the high byte is zero, so the two-byte fold below adds a
    // zero byte per character — which is why these are computed with an
    // ASCII-only helper rather than against `hashString`).
    const asciiFnv1a = (s: string): number => {
      let h = FNV_OFFSET_BASIS;
      for (let i = 0; i < s.length; i++) h = hashByte(h, s.charCodeAt(i));
      return h;
    };
    assert.equal(asciiFnv1a(''), 0x811c9dc5);
    assert.equal(asciiFnv1a('a'), 0xe40c292c);
    assert.equal(asciiFnv1a('foobar'), 0xbf9cf968);
  });

  it('returns an unsigned 32-bit value', () => {
    for (const s of ['', 'a', 'item.pine_plank', 'node.oak_tree', 'é中']) {
      const h = hashString(s);
      assert.ok(Number.isInteger(h), `${s} hashed to a non-integer`);
      assert.ok(h >= 0 && h <= 0xffffffff, `${s} hashed to ${h}, outside u32`);
    }
  });

  it('is deterministic and order-sensitive', () => {
    assert.equal(hashString('item.wood'), hashString('item.wood'));
    assert.notEqual(hashString('item.wood'), hashString('item.woodd'));
    assert.notEqual(hashString('ab'), hashString('ba'));
    assert.notEqual(hashWords(1, 2, 3), hashWords(3, 2, 1));
  });

  it('does not collide over a large content-id-shaped corpus', () => {
    // Not a cryptographic claim — just the accidental-collision check that
    // matters for `04`'s worldHash and `17`'s grid keys.
    const seen = new Set<number>();
    for (let i = 0; i < 20_000; i++) seen.add(hashString(`item.thing_${i}`));
    assert.equal(seen.size, 20_000);
  });

  it('folds continue a running hash, so composite keys are one pass', () => {
    const composed = hashStringInto(hashStringInto(FNV_OFFSET_BASIS, 'item.'), 'wood');
    assert.equal(composed, hashString('item.wood'));
  });

  it('distinguishes 0 from -0, which a decimal-string hash would not', () => {
    // The reason numbers are hashed by their IEEE bits: `String(-0) === "0"`,
    // and two world states that differ only in a sign of zero must not hash the
    // same. (Whether `-0` should reach world state at all is BL-051.)
    assert.notEqual(hashNumberInto(FNV_OFFSET_BASIS, 0), hashNumberInto(FNV_OFFSET_BASIS, -0));
  });

  it('folds NaN to a single canonical value', () => {
    assert.equal(
      hashNumberInto(FNV_OFFSET_BASIS, NaN),
      hashNumberInto(FNV_OFFSET_BASIS, Number.NaN),
    );
  });

  it('hashes numbers distinctly and stably', () => {
    const values = [0, 1, -1, 0.1, 0.1 + 0.2, 0.3, 1e308, -1e-308, Infinity, -Infinity];
    const hashes = values.map((v) => hashNumberInto(FNV_OFFSET_BASIS, v));
    assert.equal(new Set(hashes).size, values.length, 'two distinct numbers hashed alike');
    // 0.1 + 0.2 !== 0.3 in IEEE, and the hash must reflect that rather than the
    // decimal rendering.
    assert.notEqual(
      hashNumberInto(FNV_OFFSET_BASIS, 0.1 + 0.2),
      hashNumberInto(FNV_OFFSET_BASIS, 0.3),
    );
    // Stable across calls, which the shared module-level DataView could break.
    assert.equal(hashNumberInto(FNV_OFFSET_BASIS, 0.1), hashes[3]);
  });

  it('hashU32 masks to 32 bits', () => {
    assert.equal(hashU32(-1), hashU32(0xffffffff));
    assert.equal(hashU32Into(FNV_OFFSET_BASIS, 7), hashU32(7));
  });

  it('renders eight hex digits, zero-padded', () => {
    assert.equal(hashToHex(0).length, 8);
    assert.equal(hashToHex(0), '00000000');
    assert.equal(hashToHex(0xdeadbeef), 'deadbeef');
    assert.equal(hashToHex(0x0000000f), '0000000f');
    for (const s of ['a', 'b', 'item.wood']) {
      assert.match(hashToHex(hashString(s)), /^[0-9a-f]{8}$/);
    }
  });
});
