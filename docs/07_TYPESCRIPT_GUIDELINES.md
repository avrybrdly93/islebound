# 07 — TypeScript Guidelines

Purpose: the type-level conventions that make this codebase safe to modify by an agent that cannot hold the whole project in its head. The type system is our primary defence against regressions.

---

## 1. Compiler configuration (binding)

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,      // arr[i] is T | undefined — this catches real bugs
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "useDefineForClassFields": true
  }
}
```

`noUncheckedIndexedAccess` is the one people are tempted to disable. Do not. In a game with dense entity arrays and chunk grids, out-of-range access is the most common class of bug.

## 2. Modelling domain data

### 2.1 Branded IDs

Entity IDs and content IDs are numbers/strings but must not be interchangeable.

```ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EntityId = Brand<number, 'EntityId'>;
export type ItemId   = Brand<string, 'ItemId'>;
export type NodeId   = Brand<string, 'NodeId'>;
export type Tick     = Brand<number, 'Tick'>;

export const asItemId = (s: string): ItemId => s as ItemId;
```

This has caught real bugs (passing a slot index where an entity id was expected). Cost: occasional casts at boundaries, always in a single `as*` helper.

### 2.2 Discriminated unions everywhere

Intents, events, item kinds, AI states, network messages — all discriminated unions on a `type` field, with `switch` statements that are exhaustively checked.

```ts
export type Intent =
  | { type: 'move'; dir: Vec2; sprint: boolean }
  | { type: 'interact'; target: EntityId }
  | { type: 'gatherStart'; target: EntityId }
  | { type: 'gatherCancel' }
  | { type: 'craft'; recipe: RecipeId; station: EntityId | null; count: number }
  | { type: 'buildPlace'; piece: PieceId; pos: Vec3; rotY: number; variant: number }
  | { type: 'buildRemove'; target: EntityId }
  | { type: 'inventoryMove'; from: SlotRef; to: SlotRef; count: number }
  | { type: 'plant'; seed: ItemId; tile: TileRef }
  | { type: 'castLine'; power: number }
  ;

export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}
```

Every `switch` over a union ends with `default: return assertNever(intent);`. When someone adds a variant, every incomplete switch becomes a compile error. This is the mechanism that makes adding features safe.

### 2.3 Readonly by default for content

```ts
export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly stackSize: number;
  readonly tags: readonly ItemTag[];
  readonly icon: string;
  readonly tool?: Readonly<ToolProps>;
}

export const ITEMS = {
  'item.wood': { id: asItemId('item.wood'), name: 'Wood', stackSize: 99, tags: ['material'], icon: 'wood' },
  // …
} as const satisfies Record<string, ItemDef>;
```

`as const satisfies` gives both exact literal types (so `keyof typeof ITEMS` is a precise union) and structural validation at compile time. Use this pattern for **every** content table.

### 2.4 Components are plain, flat, serialisable

```ts
// GOOD
export interface Growth { stage: number; ticksInStage: number; watered: boolean; }

// BAD — class instance, method, nested reference
export class Growth { constructor(public crop: CropDef) {} advance() {} }
```

Rule: if `structuredClone(component)` loses information, the component is wrong.

## 3. Nullability

- Prefer `T | null` for "intentionally absent" and `T | undefined` only for "not provided" (optional params).
- Never use `!` non-null assertion in `sim/` or `core/`. In `render/` it is allowed for three.js objects that are guaranteed by construction, with a comment.
- Use narrowing helpers rather than casts:

```ts
export function expect<T>(v: T | null | undefined, msg: string): T {
  if (v == null) throw new Error(`Invariant: ${msg}`);
  return v;
}
```

## 4. Result type for fallible operations

```ts
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
export const Ok  = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Used for: intent validation, crafting attempts, placement checks, save load, asset load. Callers must handle both branches — `noFallthroughCasesInSwitch` plus lint keeps this honest.

```ts
const r = tryCraft(world, playerId, recipeId);
if (!r.ok) { world.events.emit({ type: 'craft:refused', reason: r.error }); return; }
```

## 5. Generic constraints, sparingly

Generics are for containers and the ECS, not for domain logic. If a function has more than two type parameters, it is probably too clever. The ECS store is the one place deep generics are justified:

```ts
export interface ComponentDef<T> { readonly name: string; readonly create: () => T; }
export function defineComponent<T>(name: string, create: () => T): ComponentDef<T>;
export function store<T>(def: ComponentDef<T>): ComponentStore<T>;
```

## 6. Type guards and content validation

Hand-written guards live next to their types. No runtime schema library (zod, valibot) — the content is authored in TypeScript, so it is already validated at compile time; guards exist only for data crossing an untrusted boundary (save files, network messages).

```ts
export function isSaveV3(v: unknown): v is SaveV3 {
  return typeof v === 'object' && v !== null
    && (v as SaveV3).version === 3
    && typeof (v as SaveV3).tick === 'number'
    && Array.isArray((v as SaveV3).entities);
}
```

Network message validation in Phase 7 is stricter and generated — see `37_NETWORK_PROTOCOL.md`.

## 7. Math types

Use plain object literals, not classes, in `sim/`:

```ts
export interface Vec3 { x: number; y: number; z: number; }
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export function addTo(out: Vec3, a: Vec3): Vec3 { out.x += a.x; out.y += a.y; out.z += a.z; return out; }
```

- All math functions are **out-parameter style** to avoid allocation.
- Conversion to `THREE.Vector3` happens only in `render/`, via `toThree(v, target)`.
- Never store a `THREE.Vector3` in a component.

## 8. Enums

Do not use TypeScript `enum` (they generate runtime code and behave oddly with `isolatedModules`). Use const objects with `as const` and derived unions:

```ts
export const Weather = { Clear: 'clear', Cloudy: 'cloudy', Rain: 'rain', Storm: 'storm', Fog: 'fog', Aurora: 'aurora' } as const;
export type Weather = (typeof Weather)[keyof typeof Weather];
```

## 9. React-specific typing

- Function components typed by their props interface; never `React.FC` (it adds implicit children).
- Props interfaces named `XxxProps`, exported only if reused.
- Event handlers named `onXxx`; internal handlers `handleXxx`.
- View models are plain data selected from sim events; no React state should ever be the source of truth for game state.

```ts
interface SlotProps { stack: ItemStackView | null; selected: boolean; onSelect: (index: number) => void; index: number; }
export function Slot({ stack, selected, onSelect, index }: SlotProps) { /* … */ }
```

## 10. Anti-patterns (auto-reject in review)

| Anti-pattern | Instead |
|---|---|
| `any`, `as any`, `Function`, `object` | `unknown` + guard, or a precise type |
| `// @ts-ignore` | `@ts-expect-error` with reason + backlog ID |
| Optional properties used as state flags (`isReady?: boolean`) | explicit `boolean` with a default |
| Deep nested optionals (`a?.b?.c?.d`) | flatten the model |
| Stringly-typed IDs without brands | branded types |
| `Object.assign` onto components | explicit field writes |
| Type assertions to satisfy the compiler | fix the model |
| Utility types stacked 4 deep | a named interface |
| `export type * from './x'` barrels | direct imports |

## 11. Testing types

Type-level regressions are real regressions. Keep a `types.test-d.ts` per package using `expectTypeOf` from Vitest for: intent exhaustiveness, content table shapes, save schema versions, and network message unions.
