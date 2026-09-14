// Proves the root `lint` script still runs a format check. Refs BL-079.
//
// Owns: BL-079's acceptance criteria.
//
// THE BUG THIS GUARDS. BL-077 found that `prettier --check .` existed as a
// script and nothing ran it, so four files sat misformatted with every gate
// green. Decision 0035 fixed that structurally, by folding the format check
// into `pnpm lint`. But the fix is one string in one `package.json`, and an
// edit that "tidies" `lint` back to `eslint .` puts the repository exactly
// where it started — silently, with nothing failing. That is the same class of
// defect BL-077 itself was: a rule nobody checks.
//
// Reads: the real root `package.json`. Not a copy of it, and not a constant
// mirroring it — a guard that asserted against its own transcription of the
// script would pass forever while the repository changed underneath it.
//
// ## Why this is a test and not a lint rule, which is most of BL-079
//
// The obvious host is `pnpm lint` itself — an ESLint rule reading
// `package.json`, or another `&&` clause, or folding `lint:rules` into `lint`.
// Every one of those is **self-defeating**, and the reason generalises past
// this item:
//
//   A GUARD MUST NOT BE REACHABLE ONLY THROUGH THE THING IT GUARDS.
//
// The single edit BL-079 exists to catch is `"lint": "eslint ."`. If the guard
// runs as part of `lint`, that edit removes the format check *and the guard
// that would have noticed*, in one stroke, and the tree goes quiet exactly as
// it did before BL-077.
//
// The verify block (`CLAUDE.md`) is `pnpm lint && pnpm typecheck && pnpm test`.
// `typecheck` cannot see a `package.json` script string — there is no type to
// assert against. So `test` is the only entry in the block that both reaches
// this guard and survives an edit to `lint`, which is BL-079's second
// criterion read literally.
//
// `tools/check-doc-commands.ts` was the filing note's suggested host and is
// **not** used, for a second reason on top of the first: it is run by
// `pnpm lint:docs`, which is not in the verify block either (it is named in
// the prose beneath it), so hosting there would reproduce BL-077's shape one
// level up. The note said as much and asked whoever took this to say how they
// avoided it. This is how.
//
// ## What is deliberately NOT asserted
//
// **Not `lint === 'eslint . && prettier --check .'`.** Pinning the exact string
// would fail on a harmless reordering and would have to be edited by anybody
// adding a legitimate clause — a guard that cries wolf gets deleted, which is
// the failure mode `06` §5 cares about more than a missed regression.
//
// **Not the literal text `prettier`.** The repository's formatter is named in
// one place, the `format:check` script, and this guard asks whether `lint` runs
// *that*. Swapping formatters in both scripts together is a legitimate change
// and passes; stripping the check out of `lint` alone is the bug and fails.
//
// ## Why it lives in `dev/`, which is this layer's first inhabitant
//
// `pnpm test` globs `packages/*/src/**/*.test.ts`, so a guard it runs has to
// sit under a package's `src/`. `tools/` — where `check-doc-commands.ts` and
// `check-lint-rules.ts` live, and where this file's *concern* belongs — is not
// in that glob, and widening the glob would mean editing the `test` script,
// which is the one script nothing guards.
//
// Of the packages, only `client` carries `@types/node`, and this guard needs
// `node:fs` to read a file. `shared` was tried first and fails both `typecheck`
// and `lint` on four unresolvable `node:` imports; adding `@types/node` to
// `shared` to host one file is a dependency added for a test's convenience and
// `CLAUDE.md` is explicit about not adding dependencies.
//
// Within `client`, `dev/` is the right layer and is not invented for this:
// `04_TECHNICAL_ARCHITECTURE.md` §5 already declares it, and the ESLint
// boundaries config already carries its rule (`dev` may import from every
// layer, which is what a developer-tooling layer is). This file is simply its
// first inhabitant. Nothing here is bundled — `vite build` reaches only what
// `main.ts` imports, and no source imports a `.test.ts`.
//
// ## Residual exposure, recorded rather than hidden
//
// Nothing guards the `test` script. An edit narrowing `test:node`'s glob would
// drop this file the same way an edit to `lint` drops the format check. That
// regress terminates only at CI — BL-019 — and is filed rather than chased.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The root `package.json`, read from disk.
 *
 * Located by walking up from this file rather than from `process.cwd()`, so the
 * guard says the same thing whatever directory the runner was started in.
 */
function readRootScripts(): Record<string, string> {
  const here = fileURLToPath(import.meta.url);
  const root = here.slice(0, here.indexOf('/packages/'));
  assert.notEqual(root, here, 'this guard expects to live under packages/');
  const raw = readFileSync(`${root}/package.json`, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  assert.ok(
    typeof parsed === 'object' && parsed !== null && 'scripts' in parsed,
    'the root package.json has no `scripts` object',
  );
  // No cast: `assert.ok` above is a type predicate, so `parsed` is already
  // narrowed to an object carrying a `scripts` key of unknown type.
  const { scripts } = parsed;
  assert.ok(
    typeof scripts === 'object' && scripts !== null,
    'the root package.json `scripts` is not an object',
  );
  return scripts as Record<string, string>;
}

describe('the root lint script still runs a format check (BL-079)', () => {
  const scripts = readRootScripts();

  it('has both scripts BL-077 and decision 0035 rely on', () => {
    // If either name disappears the assertions below would compare undefined
    // against undefined and pass, which is the shape of a guard that has
    // stopped guarding.
    assert.equal(typeof scripts['lint'], 'string', 'the root `lint` script is gone');
    assert.equal(
      typeof scripts['format:check'],
      'string',
      'the root `format:check` script is gone; BL-077 fixed it existing and being unrun, not it existing',
    );
  });

  it('runs whatever `format:check` runs, rather than a hard-coded formatter name', () => {
    // The formatter is named once, in `format:check`. Asking whether `lint`
    // runs *that* means swapping formatters in both scripts stays legal and
    // stripping the check out of `lint` alone does not.
    const lint = scripts['lint'] ?? '';
    const formatCheck = (scripts['format:check'] ?? '').trim();
    assert.ok(
      lint.includes(formatCheck) || lint.includes('format:check'),
      `the root \`lint\` script no longer runs a format check.\n` +
        `  lint:         ${lint}\n` +
        `  format:check: ${formatCheck}\n` +
        `BL-077 folded the format check into \`lint\` (decision 0035) because a ` +
        `script nothing runs is a script that does not exist. Re-add it, or ` +
        `record in 40_DECISION_LOG.md why the repository no longer wants it.`,
    );
  });

  it('still runs ESLint too, so the fold did not replace one gate with the other', () => {
    // BL-077's change is additive. A `lint` that ran only the format check
    // would satisfy the assertion above and lose the larger half of the gate.
    assert.match(
      scripts['lint'] ?? '',
      /\beslint\b/,
      'the root `lint` script no longer runs ESLint',
    );
  });
});
