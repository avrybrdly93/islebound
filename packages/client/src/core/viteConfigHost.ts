/**
 * The Vite adapter {@link createConfigStore} needs, and the only place in
 * `core/` that names a bundler's hot-module API (BL-009).
 *
 * Split out of `Config.ts` for the reason `browserFrameHost.ts` was split out
 * of `Loop.ts`: that file claims, in its module comment, that it names no
 * bundler identifier, and a claim like that is worth more when it is a
 * property of the file than a property of a paragraph. With this adapter here,
 * `Config.ts` contains no `import.meta` at all and a reader can grep.
 *
 * ## This adapter has never run
 *
 * Said plainly rather than left to be discovered. There is no composition root
 * (BL-088) and nothing consumes a tunable yet, so nothing calls this function
 * in a browser or anywhere else — exactly the position `browserFrameHost.ts`
 * has been in since BL-008. The logic is four lines and the risk is not in the
 * logic; it is that the whole path is unobserved. BL-089 records that.
 *
 * ## `hot` is a parameter because `import.meta` is not portable
 *
 * `import.meta.hot` is a Vite extension, and `import.meta` itself is a syntax
 * error under some module targets. Taking the object as an argument keeps this
 * file loadable under `node --test` — which is what lets the test below assert
 * the adapter's *shape* even though nothing exercises it for real — and leaves
 * the one `import.meta.hot` reference in the composition root, which is a
 * bundled module by construction.
 */

import type { ConfigReloadSource } from '@core/Config';

/**
 * The part of Vite's `import.meta.hot` this adapter uses.
 *
 * Declared here rather than imported from `vite/client` so that `core/` gains
 * no dependency, per `04` §5 — a structural type over two fields cannot drift
 * far, and the accept overload used is the stable one.
 */
export interface ViteHotContext {
  accept(dependency: string, callback: (module: unknown) => void): void;
}

/**
 * Adapts a Vite hot context into a {@link ConfigReloadSource}.
 *
 * @param hot - `import.meta.hot`, or `undefined` in a production build.
 * @param dependency - the specifier of the content module, e.g.
 *   `'@content/config.ts'`. Vite resolves it relative to the *calling* module,
 *   which is why the caller passes it rather than this file naming it.
 * @param select - pulls the config out of the re-evaluated module. Passed in
 *   because the export's name belongs to the content module, not to `core/`.
 *
 * A `hot` of `undefined` yields a source that never calls back, which is the
 * correct production behaviour and means a caller needs no branch of its own.
 */
export function viteConfigReloadSource<C>(
  hot: ViteHotContext | undefined,
  dependency: string,
  select: (module: unknown) => C | undefined,
): ConfigReloadSource<C> {
  return {
    onReload(listener) {
      hot?.accept(dependency, (module) => {
        const next = select(module);
        // Vite calls back with `undefined` when the update was rejected and
        // the page is about to reload anyway. Passing that on would replace a
        // live config with nothing, which is worse than doing nothing.
        if (next !== undefined) {
          listener(next);
        }
      });
    },
  };
}
