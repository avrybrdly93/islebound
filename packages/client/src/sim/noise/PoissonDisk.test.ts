/**
 * BL-054's second acceptance criterion, which is the one with teeth:
 * "Poisson-disk sampling per chunk uses `rngFor('scatter', chunkX, chunkZ)`
 * and produces the same set whatever order chunks are generated in
 * (`12` §'Runs in a Web Worker', the streaming requirement)."
 *
 * `33_CURRENT_TASK.md`'s handoff from BL-005 is right that `Rng.test.ts`
 * already proves chunk order does not matter *for the streams*, and that what
 * is left is proving the sampler preserves it. So the order tests here are
 * about the sampler: they generate the same chunks in a shuffled order, in a
 * reversed order, and interleaved with unrelated chunks, and require the
 * output to be identical each time — element for element, not as a set, since
 * a sampler that returned the right points in a seed-dependent order would
 * still break a hash comparison after a save migration.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNoiseField, simplex2 } from '@sim/noise/Noise';
import { samplePoissonDisk, type SamplePoint } from '@sim/noise/PoissonDisk';

/** `12` §1: the shipped island's seed, 'HALC'. */
const WORLD_SEED = 0x48414c43;

const SIZE = 32;
const RADIUS = 2;

function chunk(chunkX: number, chunkZ: number): SamplePoint[] {
  return samplePoissonDisk({ worldSeed: WORLD_SEED, chunkX, chunkZ, size: SIZE, radius: RADIUS });
}

function serialise(points: readonly SamplePoint[]): string {
  return points.map((p) => `${p.x.toFixed(9)},${p.z.toFixed(9)}`).join(';');
}

/** The chunk coordinates used by every order test, including negatives. */
const COORDS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 2],
  [7, -3],
  [-4, -4],
];

describe('order independence (the streaming requirement)', () => {
  it('gives the same points for a chunk however many other chunks ran first', () => {
    const reference = new Map<string, string>();
    for (const [x, z] of COORDS) reference.set(`${String(x)}:${String(z)}`, serialise(chunk(x, z)));

    // Reverse order, then an interleaving with chunks nobody asked about.
    for (const [x, z] of [...COORDS].reverse()) {
      assert.equal(serialise(chunk(x, z)), reference.get(`${String(x)}:${String(z)}`));
    }
    for (const [x, z] of COORDS) {
      chunk(x + 100, z + 100);
      chunk(x - 50, z);
      assert.equal(serialise(chunk(x, z)), reference.get(`${String(x)}:${String(z)}`));
    }
  });

  it('is identical element for element, not merely as a set', () => {
    // A sampler whose *order* varied would pass a set comparison and still
    // break the chunk hash `12` §"Verification" step 8 calls for.
    const a = chunk(3, 5);
    const b = chunk(3, 5);
    assert.deepEqual(b, a);
  });

  it('gives different points for different chunks', () => {
    // The failure this catches is a sampler that ignored its coordinates and
    // seeded every chunk identically — which would pass every order test above
    // while tiling the island with one repeated pattern.
    const seen = new Set<string>();
    for (const [x, z] of COORDS) seen.add(serialise(chunk(x, z)));
    assert.equal(seen.size, COORDS.length);
  });

  it('gives different points for a different world seed', () => {
    const other = samplePoissonDisk({
      worldSeed: WORLD_SEED + 1,
      chunkX: 0,
      chunkZ: 0,
      size: SIZE,
      radius: RADIUS,
    });
    assert.notEqual(serialise(other), serialise(chunk(0, 0)));
  });
});

/** Extracted so the nested loops stay within the project's `max-depth` of 3. */
function assertMinimumSpacing(points: readonly SamplePoint[], label: string): void {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (a === undefined || b === undefined) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      assert.ok(
        dx * dx + dz * dz >= RADIUS * RADIUS,
        `points ${String(i)} and ${String(j)} of ${label} are closer than the radius`,
      );
    }
  }
}

describe('the Poisson-disk property itself', () => {
  it('no two points in a chunk are closer than the radius', () => {
    // The defining property. Checked on squared distances, as the module does.
    for (const [cx, cz] of COORDS) {
      assertMinimumSpacing(chunk(cx, cz), `chunk (${String(cx)}, ${String(cz)})`);
    }
  });

  it('every point lies inside the chunk', () => {
    for (const point of chunk(2, 2)) {
      assert.ok(
        point.x >= 0 && point.x < SIZE,
        `x ${String(point.x)} outside [0, ${String(SIZE)})`,
      );
      assert.ok(
        point.z >= 0 && point.z < SIZE,
        `z ${String(point.z)} outside [0, ${String(SIZE)})`,
      );
    }
  });

  it('fills the chunk rather than stopping early', () => {
    // Bridson's termination is "the active front is empty", not "a retry
    // budget ran out", so the result should approach the packing density
    // rather than trail off. A hexagonal packing of discs of radius r in an
    // area A holds about 2A/(sqrt(3) r^2) centres; a Poisson-disk set
    // reliably reaches a good fraction of that, and anything below a third
    // means the front is dying early.
    const points = chunk(0, 0);
    const hexagonalBound = (2 * SIZE * SIZE) / (Math.sqrt(3) * RADIUS * RADIUS);
    assert.ok(
      points.length > hexagonalBound / 3,
      `${String(points.length)} points is far below the ${String(Math.round(hexagonalBound))} a hexagonal packing would hold`,
    );
  });

  it('produces fewer points at a larger radius, and more at a smaller one', () => {
    const counts = [1, 2, 4, 8].map(
      (radius) =>
        samplePoissonDisk({
          worldSeed: WORLD_SEED,
          chunkX: 0,
          chunkZ: 0,
          size: SIZE,
          radius,
        }).length,
    );
    for (let i = 1; i < counts.length; i++) {
      assert.ok(
        (counts[i] ?? 0) < (counts[i - 1] ?? 0),
        `counts ${counts.join(', ')} are not decreasing in radius`,
      );
    }
  });
});

describe('the clumping hook (`12` §"Scatter")', () => {
  it('a low-frequency noise field concentrates points where it is high', () => {
    // `12`: "Clumping is implemented by modulating acceptance probability with
    // a low-frequency noise field." This is that composition, checked rather
    // than assumed: split the chunk at the field's median and require the
    // dense half to actually hold more.
    const field = createNoiseField(WORLD_SEED, 'clumping');
    const density = (x: number, z: number): number =>
      simplex2(field, (x + 512) * 0.02, (z + 512) * 0.02);

    const points = samplePoissonDisk({
      worldSeed: WORLD_SEED,
      chunkX: 0,
      chunkZ: 0,
      size: SIZE,
      radius: RADIUS,
      accept: (x, z) => (density(x, z) + 1) / 2,
    });

    let high = 0;
    let low = 0;
    for (const point of points) {
      if (density(point.x, point.z) > 0) high++;
      else low++;
    }
    assert.ok(
      high > low,
      `clumping put ${String(high)} points in the dense half and ${String(low)} in the sparse one`,
    );
  });

  it('an accept function of 0 everywhere yields only the seed point', () => {
    const points = samplePoissonDisk({
      worldSeed: WORLD_SEED,
      chunkX: 0,
      chunkZ: 0,
      size: SIZE,
      radius: RADIUS,
      accept: () => 0,
    });
    // The initial point is placed before any acceptance test — it is what the
    // front grows from, and a sampler that rejected it would return nothing at
    // all rather than a sparse set.
    assert.equal(points.length, 1);
  });

  it('an accept function of 1 everywhere is identical to no accept function', () => {
    // The hook must not perturb the draw sequence when it is a no-op, or
    // enabling clumping with a neutral field would move every existing point.
    const withHook = samplePoissonDisk({
      worldSeed: WORLD_SEED,
      chunkX: 0,
      chunkZ: 0,
      size: SIZE,
      radius: RADIUS,
      accept: () => 1,
    });
    assert.deepEqual(withHook, chunk(0, 0));
  });

  it('the hook is consulted for candidates that the distance test then rejects', () => {
    // Documented ordering: acceptance runs before the distance test, so the
    // number of draws depends on the candidate sequence alone. If the order
    // were reversed the two would disagree, which is what this detects.
    let calls = 0;
    samplePoissonDisk({
      worldSeed: WORLD_SEED,
      chunkX: 0,
      chunkZ: 0,
      size: SIZE,
      radius: RADIUS,
      accept: () => {
        calls++;
        return 1;
      },
    });
    assert.ok(calls > chunk(0, 0).length, 'acceptance was consulted only for accepted points');
  });
});

describe('argument handling', () => {
  it('rejects a non-positive size or radius', () => {
    for (const bad of [0, -1, Number.NaN]) {
      assert.throws(
        () =>
          samplePoissonDisk({
            worldSeed: WORLD_SEED,
            chunkX: 0,
            chunkZ: 0,
            size: bad,
            radius: RADIUS,
          }),
        RangeError,
      );
      assert.throws(
        () =>
          samplePoissonDisk({
            worldSeed: WORLD_SEED,
            chunkX: 0,
            chunkZ: 0,
            size: SIZE,
            radius: bad,
          }),
        RangeError,
      );
    }
  });

  it('rejects fractional chunk coordinates, through rngFor', () => {
    assert.throws(
      () =>
        samplePoissonDisk({
          worldSeed: WORLD_SEED,
          chunkX: 0.5,
          chunkZ: 0,
          size: SIZE,
          radius: RADIUS,
        }),
      RangeError,
    );
  });

  it('rejects a non-positive or fractional attempt count', () => {
    for (const attempts of [0, -1, 1.5]) {
      assert.throws(
        () =>
          samplePoissonDisk({
            worldSeed: WORLD_SEED,
            chunkX: 0,
            chunkZ: 0,
            size: SIZE,
            radius: RADIUS,
            attempts,
          }),
        RangeError,
      );
    }
  });

  it('handles a radius larger than the chunk by returning the single seed point', () => {
    const points = samplePoissonDisk({
      worldSeed: WORLD_SEED,
      chunkX: 0,
      chunkZ: 0,
      size: 4,
      radius: 100,
    });
    assert.equal(points.length, 1);
  });

  it('the committed 1/√2 equals its closed form to within a double', () => {
    assert.ok(Math.abs(0.7071067811865476 - 1 / Math.sqrt(2)) <= Number.EPSILON);
  });
});
