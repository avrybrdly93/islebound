import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * A module-resolution hook that teaches Node the `@core/*` … `@content/*`
 * aliases (BL-004).
 *
 * ## Why this exists
 *
 * The tree imports by alias (`04` §5 / CLAUDE.md: "Imports via `@core/*`,
 * `@sim/*`, `@render/*`, `@ui/*`, `@content/*`"). TypeScript resolves them from
 * `tsconfig.base.json` `paths` and Vite from its own `resolve.alias` map, but
 * **Node resolves neither** — so a `node --test` run over the source cannot
 * load a single module that imports a sibling by alias. This hook is what makes
 * `pnpm test:node` possible before Vitest lands.
 *
 * ## Its expiry date
 *
 * BL-015 brings in Vitest sharing the Vite config, at which point the test run
 * resolves aliases the same way the app does and this file should be deleted
 * along with the `test:node` script. It is deliberately minimal so that
 * deleting it is easy: no watch mode, no reporters, no coverage logic — Node
 * supplies all three.
 *
 * ## The third alias map
 *
 * `vite.config.ts` already carries a hand-synced copy of `tsconfig.base.json`'s
 * `paths`, with a comment saying so. This is now the third copy, and three is
 * where hand-syncing stops being reasonable — filed as a backlog item rather
 * than fixed here, since consolidating them touches the Vite config and the
 * tsconfig, neither of which is BL-004's business.
 */

const ROOT = new URL('../', import.meta.url);

/** Mirrors `tsconfig.base.json` → `compilerOptions.paths`. */
const ALIASES = {
  '@core/': 'packages/client/src/core/',
  '@sim/': 'packages/client/src/sim/',
  '@render/': 'packages/client/src/render/',
  '@ui/': 'packages/client/src/ui/',
  '@content/': 'packages/shared/src/content/',
};

/**
 * Appends the extension the source omits.
 *
 * The tree writes extensionless specifiers (`@core/math/scalar`), which is what
 * `moduleResolution: "bundler"` allows and what Vite serves. Node needs a real
 * file, so try the specifier as given, then `.ts`, then `.tsx`, then an
 * `index.ts` — in that order, and give up rather than guess if none exists, so
 * a typo surfaces as "cannot find module" and not as a confusing later error.
 */
function resolveFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      return candidate;
    }
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  for (const [prefix, target] of Object.entries(ALIASES)) {
    if (!specifier.startsWith(prefix)) continue;

    const rest = specifier.slice(prefix.length);
    const basePath = fileURLToPath(new URL(`${target}${rest}`, ROOT));
    const file = resolveFile(basePath);
    if (file === null) {
      throw new Error(
        `aliasResolver: "${specifier}" maps to ${basePath}, which does not exist as a file, ` +
          'a .ts/.tsx file, or a directory with an index.ts',
      );
    }
    // No `format`: Node infers it from the extension, which is what routes a
    // `.ts` file through its own type stripping. Pinning `'module'` here
    // skipped the stripper and failed on the first `export interface`.
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
