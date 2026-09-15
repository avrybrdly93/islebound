// Proves the root `lint` script still runs a format check. Refs BL-079.
//
// Owns: BL-079's acceptance criteria.
// Reads: the real root `package.json` — the point is to check the script the
// repository actually has, not a copy of the list.
// Writes: nothing.
//
// WHAT WENT WRONG, AND WHY ONE STRING IS WORTH A TEST. `pnpm format:check`
// existed as a script for months while nothing ran it, and four test files went
// unformatted — two of them added by a session whose own log reported the count
// as unchanged, because it had no way to see them. BL-077 fixed that by folding
// `prettier --check .` into `pnpm lint`, which is structural rather than
// advisory (decision 0035). But it is *one string in `package.json`*, and an
// edit that tidies `lint` back to `eslint .` puts the repository exactly where
// it started, silently and with nothing failing. Decision 0029 is the reason to
// take that seriously rather than to trust it: this repository breached an
// unchecked soft limit fourteen times.
//
// WHY THIS IS A TEST AND NOT A LINE IN `pnpm lint`, WHICH IS THE ANSWER THAT
// LOOKS OBVIOUSLY RIGHT. Extending the script to
// `eslint . && prettier --check . && node ... check-lint-script.ts` does not
// work, and not for a reason of taste. **The edit this guard exists to catch is
// somebody rewriting `lint`, and that edit deletes the guard in the same stroke
// as the format check.** A guard living inside the string it guards is removed
// by the change it is meant to report. So it has to be run by a different
// member of the verify block, and `pnpm typecheck` (a recursive `tsc`) hosts no
// runtime assertion — which leaves `pnpm test`.
//
// WHY NOT `tools/check-doc-commands.ts`, WHICH ALREADY READS THESE SCRIPTS.
// It is run by `pnpm lint:docs`, and `lint:docs` is **not** in the verify block
// — it is named in the prose beneath it. Hosting the guard there would
// reproduce BL-077's exact shape one level up: a check that exists and that
// nothing is obliged to run. BL-079's second criterion is precisely this.
//
// THE RESIDUAL, DECLARED. This file is reached through `test:node`'s glob, so
// the guard now leans on that glob the way the format check leaned on `lint`'s
// string. It is a smaller hole and it is not closed, and it cannot be closed
// from here: a test in `tools/` cannot notice that the glob stopped selecting
// `tools/`. The closure is BL-019's CI, where a check that silently stops
// running shows up as a job that stops reporting.
//
// WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT. The assertion is that `lint`
// reaches a **formatting check over the repository**, by either of the two
// spellings the repository actually uses — `prettier --check <path>` directly,
// or the `format:check` script that is itself that command. It is deliberately
// not a string equality against today's value: `lint` gaining a third step, or
// `--check` gaining a flag, is not the regression, and a test that fails on
// those gets weakened by the next person who hits it. It is also not a check
// that Prettier specifically is the formatter; `runsFormatCheck` resolves
// through `scripts` so a future `format:check` implemented differently still
// satisfies it, as long as `lint` still reaches it.
//
// `--write` is rejected, and that is the one case where being liberal would be
// wrong: a `lint` that *formats* rather than checking reports nothing, leaves a
// dirty tree, and is exactly the silent-pass this file exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const manifestPath = fileURLToPath(new URL('package.json', repoRoot));

interface Manifest {
  readonly scripts?: Record<string, string>;
}

function readScripts(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  return manifest.scripts ?? {};
}

/** A command that checks formatting without writing: `prettier --check <path>`. */
const FORMAT_CHECK = /(^|\s)prettier\s+[^&|]*--check(\s|$)/;

/** A command that rewrites files. Never satisfies the guard, however it is reached. */
const FORMAT_WRITE = /(^|\s)prettier\s+[^&|]*--write(\s|$)/;

/** A `pnpm <script>` / `npm run <script>` call, for following one script into another. */
const SCRIPT_CALL = /(?:^|&&|\|\||;)\s*(?:pnpm|npm)\s+(?:run\s+)?([\w:.-]+)/g;

/**
 * Whether `scriptName` reaches a formatting check, following script calls.
 *
 * Follows rather than string-matches because both spellings are real here:
 * `lint` runs `prettier --check .` directly today, and `format:check` is that
 * same command under a name. A guard that only understood one would be a guard
 * against one particular way of writing the right thing.
 *
 * `seen` stops a script that calls itself — directly or through a cycle — from
 * recursing forever. A cycle is a broken manifest, not a format check, so it
 * returns false rather than throwing: the assertion message is more useful than
 * a stack trace.
 */
export function runsFormatCheck(
  scriptName: string,
  scripts: Record<string, string>,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (seen.has(scriptName)) return false;
  const body = scripts[scriptName];
  if (body === undefined) return false;
  if (FORMAT_WRITE.test(body)) return false;
  if (FORMAT_CHECK.test(body)) return true;

  const next = new Set(seen);
  next.add(scriptName);
  for (const match of body.matchAll(SCRIPT_CALL)) {
    if (runsFormatCheck(match[1] ?? '', scripts, next)) return true;
  }
  return false;
}

test('the root lint script reaches a format check', () => {
  const scripts = readScripts();
  assert.ok(
    scripts.lint !== undefined,
    'the root package.json has no `lint` script at all; the verify block in ' +
      'AI_DEVELOPMENT_WORKFLOW.md §6 opens with `pnpm lint`',
  );
  assert.ok(
    runsFormatCheck('lint', scripts),
    'the root `lint` script no longer reaches a format check. It is ' +
      `currently ${JSON.stringify(scripts.lint)}. BL-077 folded ` +
      '`prettier --check .` into it (decision 0035) precisely so formatting ' +
      'could not go unchecked again; restore it, or move the format check ' +
      'somewhere else the verify block reaches and update this guard to ' +
      'follow it.',
  );
});

// BL-069's Surprise 1, one level up again: a green run of a checker does not
// verify the checker. These drive `runsFormatCheck` over manifests the
// repository does not have, so the assertion above is known to be capable of
// failing rather than merely observed to pass.
test('the guard fails on the exact edit BL-079 exists to catch', () => {
  // The regression, verbatim: somebody "tidies" lint back to eslint alone.
  assert.equal(runsFormatCheck('lint', { lint: 'eslint .' }), false);
});

test('the guard accepts both spellings the repository actually uses', () => {
  // Today's value.
  assert.equal(runsFormatCheck('lint', { lint: 'eslint . && prettier --check .' }), true);
  // The indirect form, which is just as good and which a later tidy-up might
  // well prefer: lint calls the script that is the format check.
  assert.equal(
    runsFormatCheck('lint', {
      lint: 'eslint . && pnpm format:check',
      'format:check': 'prettier --check .',
    }),
    true,
  );
  // And `npm run`, one more level down.
  assert.equal(
    runsFormatCheck('lint', {
      lint: 'eslint . && npm run format:check',
      'format:check': 'prettier --check .',
    }),
    true,
  );
});

test('a format script that writes never counts as a check', () => {
  // The case where being liberal would be actively wrong: a `lint` that formats
  // instead of checking reports nothing and leaves a dirty tree, which is the
  // silent pass this whole file exists to prevent.
  assert.equal(runsFormatCheck('lint', { lint: 'eslint . && prettier --write .' }), false);
  assert.equal(
    runsFormatCheck('lint', { lint: 'eslint . && pnpm format', format: 'prettier --write .' }),
    false,
  );
});

test('the guard is not fooled by a format check that lint does not reach', () => {
  // BL-077's original defect exactly: the script exists, nothing runs it.
  assert.equal(
    runsFormatCheck('lint', { lint: 'eslint .', 'format:check': 'prettier --check .' }),
    false,
  );
});

test('the guard tolerates a manifest that is broken rather than merely wrong', () => {
  assert.equal(runsFormatCheck('lint', {}), false);
  // A cycle is a broken manifest, not a format check. Returning false gets the
  // assertion's message printed; recursing forever gets a stack overflow.
  assert.equal(runsFormatCheck('lint', { lint: 'pnpm lint' }), false);
  assert.equal(runsFormatCheck('lint', { lint: 'pnpm other', other: 'pnpm lint' }), false);
});

test('the guard does not match a bare mention of prettier', () => {
  // `eslint-config-prettier` appears in this repository's lint setup and is not
  // a format check; neither is a comment or an install command.
  assert.equal(runsFormatCheck('lint', { lint: 'eslint . --config eslint-prettier.js' }), false);
  assert.equal(runsFormatCheck('lint', { lint: 'echo prettier' }), false);
});
