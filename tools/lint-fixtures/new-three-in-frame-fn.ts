// FIXTURE — deliberately violates the "no new THREE.* inside update*/sync*/step*"
// ban (no-restricted-syntax). Linted only by tools/check-lint-rules.mjs.
declare const THREE: { Vector3: new () => unknown };

export function updateCamera(): unknown {
  return new THREE.Vector3();
}

export const syncMeshes = (): unknown => new THREE.Vector3();
