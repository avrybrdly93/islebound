// BL-074 design probe 2. Not committed. Characterises the stray-sample tail
// under deliberate contention, which is the regime the 1-in-20 flake lives in
// and which the uncontended probe cannot see.

import { Worker } from 'node:worker_threads';

import { keepAlive, measureAttributedAllocation } from '@core/math/allocationHarness';
import { clamp, damp, lerp, moveTowards, smoothstep } from '@core/math/scalar';
import { add, addScaled, cross, lerpV3, normalize, v3 } from '@core/math/vec3';

const outA = v3(1.5, 2.5, 3.5);
const outB = v3(4.5, 5.5, 6.5);
const outC = v3(0.5, 0.5, 0.5);

const ROUNDS = Number(process.env.ROUNDS ?? '8');
const HOGS = Number(process.env.HOGS ?? '4');

// Each hog allocates hard and continuously, which is what a contended full
// suite looks like to the profiler: other frames, other garbage, and CPU
// competition that stretches the measured window.
const HOG_SOURCE = `
  const ring = new Array(4096).fill(null);
  let k = 0;
  for (;;) {
    for (let i = 0; i < 200000; i++) {
      ring[k] = { a: i + 0.5, b: [i, i + 1], c: 'x'.repeat(8) };
      k = (k + 1) & 4095;
    }
  }
`;

const hogs: Worker[] = [];
for (let i = 0; i < HOGS; i++) hogs.push(new Worker(HOG_SOURCE, { eval: true }));

const free: number[] = [];
const controls: number[] = [];

try {
  for (let round = 0; round < ROUNDS; round++) {
    const control = await measureAttributedAllocation((i) => {
      keepAlive({ x: i + 0.5, y: 2.5, z: 3.5 });
    });
    controls.push(control.attributedBytes);

    for (const op of [
      (i: number) => void clamp(i % 20, 2, 15),
      (i: number) => void lerp(0, 10, (i % 100) / 100),
      (i: number) => void smoothstep(0, 1, (i % 100) / 100),
      (i: number) => void moveTowards(i % 10, 10, 0.5),
      (i: number) => void damp(i % 10, 0, 5, 1 / 30),
      () => void add(outC, outA, outB),
      () => void addScaled(outC, outA, outB, 0.5),
      () => void cross(outC, outA, outB),
      () => void normalize(outC, outA),
      (i: number) => void lerpV3(outC, outA, outB, (i % 100) / 100),
    ]) {
      const r = await measureAttributedAllocation(op);
      free.push(r.attributedBytes);
    }
  }
} finally {
  for (const hog of hogs) await hog.terminate();
}

const sorted = [...free].sort((a, b) => a - b);
const nonzero = sorted.filter((v) => v > 0);
console.log(`\n${HOGS} allocating hog threads, ${ROUNDS} rounds x 10 allocation-free operations\n`);
console.log(`control        min ${Math.min(...controls)}  max ${Math.max(...controls)}`);
console.log(`alloc-free     n ${free.length}  zero ${free.length - nonzero.length}  nonzero ${nonzero.length}`);
console.log(`alloc-free     max ${sorted[sorted.length - 1]}`);
console.log(`nonzero values ${nonzero.join(',') || '(none)'}`);
const oldAllowances = controls.map((c) => c / 100);
console.log(
  `\nold allowance (control/100): min ${Math.min(...oldAllowances).toFixed(2)} max ${Math.max(...oldAllowances).toFixed(2)}`,
);
const worstStray = sorted[sorted.length - 1] ?? 0;
console.log(
  `old rule verdict: a stray of ${worstStray} against an allowance of ${Math.min(...oldAllowances).toFixed(2)} -> ${worstStray > Math.min(...oldAllowances) ? 'FAILS' : 'passes'}`,
);
