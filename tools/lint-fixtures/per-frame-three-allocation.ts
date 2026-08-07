// Fixture for BL-002: allocating a THREE object inside a per-frame path.
// Four shapes, because a function's name lives on a different AST node in
// each and the rule needs a selector for every one.

declare const THREE: { Vector3: new (x: number, y: number, z: number) => unknown };

export function updateCamera(): unknown {
  return new THREE.Vector3(0, 0, 0);
}

export const syncMeshes = (): unknown => new THREE.Vector3(1, 1, 1);

export class Mesher {
  stepChunk(): unknown {
    // Nested two blocks deep: the selector must be a descendant match, not a
    // direct-child one, because the real allocation is always inside a loop.
    for (let i = 0; i < 1; i += 1) {
      if (i === 0) {
        return new THREE.Vector3(2, 2, 2);
      }
    }
    return undefined;
  }
}

export const meshers = {
  updateAll(): unknown {
    return new THREE.Vector3(3, 3, 3);
  },
};
