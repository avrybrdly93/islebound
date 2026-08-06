// FIXTURE — deliberately violates the sim/ purity rule (no-restricted-imports).
// Checked with an overridden filename so it is treated as living under
// packages/client/src/sim/. Linted only by tools/check-lint-rules.mjs.
import * as THREE from 'three';

export const scene = THREE;
