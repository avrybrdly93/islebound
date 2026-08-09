import { register } from 'node:module';

/**
 * Registers `aliasResolver.mjs` as a module-resolution hook (BL-004).
 *
 * A separate two-line file because `register` must run in the main thread
 * *before* the first aliased import is evaluated, while the hook itself runs
 * on a loader thread — the two cannot be the same module. Wired via
 * `node --import ./tools/registerAliases.mjs`. Deleted together with the hook
 * when BL-015 brings in Vitest.
 */
register('./aliasResolver.mjs', import.meta.url);
