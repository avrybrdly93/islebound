import { register } from 'node:module';

/**
 * Registers `aliasResolver.mjs` as a module-resolution hook (BL-004).
 *
 * A separate two-line file because `register` must run in the main thread
 * *before* the first aliased import is evaluated, while the hook itself runs
 * on a loader thread — the two cannot be the same module. Wired via
 * `node --import ./tools/registerAliases.ts`. Deleted together with the hook
 * when BL-015 brings in Vitest.
 *
 * TypeScript rather than `.mjs` since BL-081: Node strips the types before
 * running this, and being `.ts` is what puts it inside `tools/tsconfig.json`'s
 * existing `include` with no new compiler flag. Decision 0037.
 */
register('./aliasResolver.ts', import.meta.url);
