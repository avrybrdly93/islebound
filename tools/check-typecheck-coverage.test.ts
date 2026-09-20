// Proves every `tools/*.ts` file is still reached by `pnpm typecheck`. Refs BL-080.
//
// Owns: BL-080's fifth criterion — the guard, in the shape BL-079 left one.
// Reads: `tools/package.json`, `tools/tsconfig.json`, `pnpm-workspace.yaml`,
// the root `package.json`, and the real contents of `tools/`. The point is to
// check the repository it is in, not a copy of its own expectations.
// Writes: nothing.
//
// WHAT WENT WRONG, AND WHY A DIRECTORY LISTING IS WORTH A TEST. Four
// TypeScript files sat in `tools/` for months with **nothing type-checking any
// of them**. They run under `node --experimental-strip-types`, which *erases*
// annotations rather than checking them, and ESLint lints the directory — so
// the files were covered by one gate and not the other, which is exactly why
// nobody noticed. The typecheck this task added found two real errors on its
// first run, in `check-lint-script.test.ts`, a file four days old.
//
// THE REACH IS NOW STRUCTURAL, AND THAT IS WHAT THIS GUARDS. `pnpm typecheck`
// is `pnpm -r --if-present run typecheck`, and `tools/` answers it because it
// is a workspace package with a `typecheck` script. Nothing in the root script
// names `tools`. That is the strength of the mechanism and also the thing that
// can be undone by deleting one file: remove `tools/package.json`, or drop
// `tools` from `pnpm-workspace.yaml`, and `pnpm typecheck` goes back to
// reporting two packages and a clean exit — **the silent pass**, which is the
// one outcome this repository has now produced four times (BL-077, BL-079,
// BL-080, and decision 0029's fourteen unchecked breaches).
//
// WHY IT LIVES IN `pnpm test` AND NOT IN `pnpm typecheck`, WHICH LOOKS LIKE THE
// OBVIOUS HOME. BL-079's finding, applied again: **a guard cannot live inside
// the thing it guards.** A check that runs as part of the `tools` project's own
// typecheck is deleted by the same edit that deletes the project. `pnpm lint`
// would work, but `pnpm test` is where the sibling guard already is, and both
// are members of the verify block (`AI_DEVELOPMENT_WORKFLOW.md` §6).
//
// WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT. The assertion is that every
// `.ts` file under `tools/` is **selected by the `tools` project's `include`**,
// and that the project is reachable from the recursive script. It is
// deliberately not a fixed list of four filenames — a fifth file is the
// ordinary case and a guard that fails on it gets weakened by whoever adds one.
// It is also not an assertion that the compiler is `tsc`: the script is
// resolved and required to run *a* type-checker over *this* project, so a
// future move to a different checker satisfies it as long as the reach holds.
//
// HAND-WRITTEN JAVASCRIPT IS NOW IN SCOPE, WHICH IS WHAT BL-081 CHANGED. Until
// then `aliasResolver.mjs` and `registerAliases.mjs` were not `.ts`, so this
// guard did not ask them to be, and the paragraph here said so rather than
// leaving it to silence. Both are `.ts` now (decision 0037), which means the
// `.ts` assertion below already covers them -- but only for as long as nobody
// adds a third `.mjs`. So the last case asserts the *decision* instead of the
// current file list: the repository has exactly one hand-written JavaScript
// file, `eslint.config.js`, and anything else is a file nothing type-checks.
// That is the answer to BL-081's general question, made checkable, because
// stating a rule without checking it is this repository's one recurring defect
// (BL-077, BL-079, BL-080, BL-081 -- four in a row).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolsDir = new URL('./', import.meta.url);
const repoRoot = new URL('../', import.meta.url);

interface Manifest {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
}

function readJson(url: URL): unknown {
  return JSON.parse(stripJsonComments(readFileSync(fileURLToPath(url), 'utf8')));
}

/**
 * Remove `//` line comments so a commented `tsconfig.json` parses.
 *
 * Crude on purpose and safe for the input: it skips anything inside a string
 * literal, which is the only place a `//` could legitimately appear in these
 * files. A full JSONC parser would be a dependency for one file.
 */
export function stripJsonComments(source: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    // `noUncheckedIndexedAccess` is on and a non-null assertion is a lint
    // error here (`06`), so the bound is re-stated rather than asserted away.
    if (ch === undefined) break;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Every `.ts` file directly under `tools/`, which is where they all live. */
function toolsTypeScriptFiles(): string[] {
  return readdirSync(fileURLToPath(toolsDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Whether a tsconfig `include` glob selects `fileName`.
 *
 * Only the two forms this repository uses are understood — a recursive
 * `*.ts` glob and a bare filename — because a general glob matcher here would be a second
 * implementation of something `tsc` already owns, and the guard's job is to
 * notice the file being dropped, not to reimplement resolution.
 */
export function includeSelects(patterns: readonly string[], fileName: string): boolean {
  return patterns.some((pattern) => {
    if (pattern === fileName || pattern === `./${fileName}`) return true;
    const suffix = pattern.replace(/^\.\//, '').replace(/^\*\*\//, '');
    if (suffix.startsWith('*.')) return fileName.endsWith(suffix.slice(1));
    return false;
  });
}

test('tools is a workspace package the recursive typecheck reaches', () => {
  const workspace = readFileSync(fileURLToPath(new URL('pnpm-workspace.yaml', repoRoot)), 'utf8');
  assert.match(
    workspace,
    /^\s*-\s*'?tools'?\s*$/m,
    'pnpm-workspace.yaml no longer lists `tools`, so `pnpm -r` cannot reach it ' +
      'and nothing type-checks tools/*.ts again. This is BL-080 reopening.',
  );

  const manifest = readJson(new URL('package.json', toolsDir)) as Manifest;
  const typecheck = manifest.scripts?.['typecheck'];
  assert.ok(
    typecheck !== undefined && typecheck.trim() !== '',
    'tools/package.json has no `typecheck` script, so `pnpm -r --if-present ' +
      'run typecheck` skips it silently — the exact silent pass BL-080 was filed for.',
  );
  assert.match(
    typecheck,
    /tsconfig\.json/,
    `tools/package.json's typecheck script no longer names a tsconfig; it is ` +
      `currently ${JSON.stringify(typecheck)}.`,
  );
});

test('the root typecheck script is still the recursive one', () => {
  const root = readJson(new URL('package.json', repoRoot)) as Manifest;
  const script = root.scripts?.['typecheck'];
  assert.ok(script !== undefined, 'the root package.json has no `typecheck` script at all');
  assert.match(
    script,
    /pnpm\s+-r\b/,
    'the root `typecheck` no longer runs recursively, so a per-package script ' +
      `is no longer reached by it. It is currently ${JSON.stringify(script)}. ` +
      'If the mechanism moved, move this guard with it.',
  );
});

test('every tools/*.ts file is selected by the tools tsconfig', () => {
  const config = readJson(new URL('tsconfig.json', toolsDir)) as { include?: string[] };
  const include = config.include ?? [];
  assert.ok(include.length > 0, 'tools/tsconfig.json has no `include`, so it compiles nothing');

  const files = toolsTypeScriptFiles();
  assert.ok(files.length > 0, 'no .ts files found under tools/, which cannot be right');
  for (const file of files) {
    assert.ok(
      includeSelects(include, file),
      `tools/${file} is not selected by tools/tsconfig.json's include ` +
        `(${JSON.stringify(include)}), so nothing type-checks it. Add it, or ` +
        'widen the include.',
    );
  }
});

// BL-069's Surprise 1 again: a green run of a checker does not verify the
// checker. These drive the two pure helpers over inputs the repository does not
// have, so the assertions above are known to be capable of failing.

test('includeSelects rejects a glob that does not cover the file', () => {
  assert.equal(includeSelects(['**/*.ts'], 'check-lint-rules.ts'), true);
  assert.equal(includeSelects(['src'], 'check-lint-rules.ts'), false);
  assert.equal(includeSelects(['**/*.mts'], 'check-lint-rules.ts'), false);
  assert.equal(includeSelects([], 'check-lint-rules.ts'), false);
});

test('includeSelects accepts an explicitly named file', () => {
  assert.equal(includeSelects(['check-lint-rules.ts'], 'check-lint-rules.ts'), true);
  assert.equal(includeSelects(['./check-lint-rules.ts'], 'check-lint-rules.ts'), true);
  assert.equal(includeSelects(['check-doc-commands.ts'], 'check-lint-rules.ts'), false);
});

test('stripJsonComments leaves a // inside a string alone', () => {
  assert.equal(stripJsonComments('{"a": "http://x"}'), '{"a": "http://x"}');
  assert.equal(stripJsonComments('{"a": 1} // trailing').trim(), '{"a": 1}');
  assert.equal(stripJsonComments('{"a": "he said \\"//\\""}'), '{"a": "he said \\"//\\""}');
});

/**
 * Extensions a hand-written JavaScript file can carry. `.jsx` is included even
 * though this repository has never had one: the guard is about the rule, and a
 * rule that names three of four extensions is an invitation.
 */
const JS_EXTENSIONS: readonly string[] = ['.js', '.mjs', '.cjs', '.jsx'];

/**
 * The one file the decision exempts, as a repo-relative path.
 *
 * `eslint.config.js` is ESLint's own entry point, loaded by ESLint rather than
 * by `node --import`, and making it `.ts` needs a `jiti` dev dependency that
 * `35` §4 puts behind justification for a file that configures the linter and
 * ships nowhere. Decision 0037 records that trade; this constant is what stops
 * the exemption from quietly growing a second member.
 */
const ALLOWED_JS: readonly string[] = ['eslint.config.js'];

/**
 * Every tracked file's repo-relative path, from git rather than from a walk.
 *
 * `git ls-files` is the right set rather than a convenient one: it is exactly
 * "files a person wrote and committed", so `node_modules`, `dist` and any
 * generated output are excluded by the same rule that excludes them from
 * review, with no ignore list here to drift out of sync with `.gitignore`. The
 * cost is that this case needs a git checkout; in a source tarball it throws
 * rather than passing vacuously, which is the safer of the two failures for a
 * guard.
 */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line !== '');
}

test('the only hand-written JavaScript in the repository is the one file the decision exempts', () => {
  const js = trackedFiles().filter((file) =>
    JS_EXTENSIONS.some((extension) => file.endsWith(extension)),
  );
  const unexpected = js.filter((file) => !ALLOWED_JS.includes(file)).sort();

  assert.deepEqual(
    unexpected,
    [],
    'these JavaScript files are type-checked by nothing: ' +
      `${JSON.stringify(unexpected)}. Decision 0037 says this repository is ` +
      'TypeScript, with eslint.config.js the single named exception, because ' +
      'a language no gate checks is the defect BL-077, BL-079, BL-080 and ' +
      'BL-081 each found one instance of. Convert the file, or amend the ' +
      'decision and this list together.',
  );

  // The exemption is checked in the other direction too: a stale entry here
  // would silently allow a file that no longer exists to be re-added.
  for (const allowed of ALLOWED_JS) {
    assert.ok(
      js.includes(allowed),
      `ALLOWED_JS lists ${allowed}, which is not a tracked file any more. ` +
        'Remove it from the list rather than leaving a standing exemption.',
    );
  }
});

test('tools/ holds no JavaScript at all, so its tsconfig include covers all of it', () => {
  const entries = readdirSync(fileURLToPath(toolsDir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const js = entries.filter((name) => JS_EXTENSIONS.some((ext) => name.endsWith(ext))).sort();

  assert.deepEqual(
    js,
    [],
    `tools/ contains JavaScript: ${JSON.stringify(js)}. tools/tsconfig.json ` +
      'selects `**/*.ts`, so these are outside `pnpm typecheck` entirely — the ' +
      'exact hole BL-081 closed by converting aliasResolver and registerAliases.',
  );

  // And the reason that matters: every test in the repository loads through
  // `tools/registerAliases.ts`, named by the root `test:node` script. A mistake
  // there fails the verify block pointing at the wrong file.
  const root = readJson(new URL('package.json', repoRoot)) as Manifest;
  const testNode = root.scripts?.['test:node'] ?? '';
  assert.match(
    testNode,
    /--import\s+\.\/tools\/registerAliases\.ts\b/,
    'the root `test:node` script no longer imports tools/registerAliases.ts. ' +
      `It is currently ${JSON.stringify(testNode)}. If the loader moved or was ` +
      'renamed, move this guard with it — and if it went back to JavaScript, ' +
      'read decision 0037 first.',
  );
});

test('JS_EXTENSIONS and the path helper behave on inputs the repository does not have', () => {
  // BL-069's Surprise 1 again, applied to the two assertions above: neither is
  // exercised by a failing case in this tree, so they are exercised here.
  assert.equal(
    JS_EXTENSIONS.some((ext) => 'tools/aliasResolver.mjs'.endsWith(ext)),
    true,
  );
  assert.equal(
    JS_EXTENSIONS.some((ext) => 'tools/aliasResolver.ts'.endsWith(ext)),
    false,
  );
  // `.ts` must not be caught by the `.js`-family test through a suffix
  // accident, and neither must a file whose name merely contains one.
  assert.equal(
    JS_EXTENSIONS.some((ext) => 'packages/client/src/mjsThings.ts'.endsWith(ext)),
    false,
  );
  assert.equal(path.extname('eslint.config.js'), '.js');
});
