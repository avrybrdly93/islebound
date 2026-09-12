// BL-074 design probe. Not committed. Characterises what the sampling
// profiler actually attributes, so the replacement boundary is placed from
// data rather than picked.

import {
  keepAlive,
  measureAttributedAllocation,
} from '@core/math/allocationHarness';
import { clamp, lerp } from '@core/math/scalar';
import { add, normalize, v3 } from '@core/math/vec3';
import { createSpring3, stepSpring3 } from '@core/math/spring';

const outA = v3(1.5, 2.5, 3.5);
const outB = v3(4.5, 5.5, 6.5);
const outC = v3(0.5, 0.5, 0.5);
const spring3 = createSpring3(1.5, 2.5, 3.5);

const ROUNDS = Number(process.env.ROUNDS ?? '12');

interface Row {
  readonly name: string;
  readonly values: number[];
}

const rows: Row[] = [];

function record(name: string, value: number): void {
  let row = rows.find((r) => r.name === name);
  if (!row) {
    row = { name, values: [] };
    rows.push(row);
  }
  row.values.push(value);
}

for (let round = 0; round < ROUNDS; round++) {
  const control = await measureAttributedAllocation((i) => {
    keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
  });
  record('CONTROL (allocates per call)', control.attributedBytes);

  // A control that allocates far less often than once per call: one object
  // every 1000 iterations. This is the case a boundary must still catch if it
  // claims to detect "allocates on the per-frame path".
  const sparse = await measureAttributedAllocation((i) => {
    if (i % 1000 === 0) keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
  });
  record('SPARSE control (1 alloc per 1000 calls)', sparse.attributedBytes);

  const rarer = await measureAttributedAllocation((i) => {
    if (i % 10000 === 0) keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
  });
  record('RARE control (1 alloc per 10000 calls)', rarer.attributedBytes);

  for (const [name, op] of [
    ['clamp', (i: number) => void clamp(i % 20, 2, 15)],
    ['lerp', (i: number) => void lerp(0, 10, (i % 100) / 100)],
    ['add', () => void add(outC, outA, outB)],
    ['normalize', () => void normalize(outC, outA)],
    ['stepSpring3', () => void stepSpring3(spring3, 0.5, 1.5, 2.5, 12.5, 1 / 30)],
  ] as const) {
    const r = await measureAttributedAllocation(op as (i: number) => void);
    record(name, r.attributedBytes);
  }
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\n${ROUNDS} rounds, default options (200k iters, interval 1024, warmup 50k, 3 repeats)\n`);
console.log(`${pad('operation', 40)} ${pad('min', 10)} ${pad('max', 10)} ${pad('nonzero', 9)} values`);
for (const row of rows) {
  const min = Math.min(...row.values);
  const max = Math.max(...row.values);
  const nonzero = row.values.filter((v) => v > 0).length;
  console.log(
    `${pad(row.name, 40)} ${pad(String(min), 10)} ${pad(String(max), 10)} ${pad(`${nonzero}/${row.values.length}`, 9)} ${row.values.join(',')}`,
  );
}
