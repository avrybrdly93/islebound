// Fixture for BL-002: no allocation in per-frame paths (06 §8).
// Linted by tools/check-lint-rules.mjs, ESLint-ignored everywhere else.

declare const THREE: {
  Vector3: new (x?: number, y?: number, z?: number) => object;
};

// VIOLATION: allocation inside a function declaration named update*.
export function updateCamera(): object {
  return new THREE.Vector3(0, 1, 0);
}

// VIOLATION: same, as an arrow function assigned to sync*.
export const syncMeshes = (): object => new THREE.Vector3();

// VIOLATION: same, as a class method named step*.
export class Simulation {
  stepPresentation(): object {
    return new THREE.Vector3();
  }
}

// VIOLATION: same, as an object-literal method named update*.
export const system = {
  updateTransforms(): object {
    return new THREE.Vector3();
  },
};

// COMPLIANT: allocated once at module scope, reused per frame. Must not report.
const scratch = new THREE.Vector3();
export function updateFromScratch(): object {
  return scratch;
}

// COMPLIANT: allocation in a function that is not a per-frame path. Must not report.
export function buildInitialCamera(): object {
  return new THREE.Vector3(0, 0, 5);
}

// COMPLIANT: a non-THREE allocation in a per-frame path is a different concern
// and this rule must not claim it. Must not report.
export function updateLabels(): object {
  return new Map<string, number>();
}
