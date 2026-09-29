import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

/**
 * BL-010 criterion 2: "Debug calls are removed from the production bundle
 * (verified by a bundle grep test)."
 *
 * Owns: that criterion, end to end.
 * Reads: the real `packages/client/src/main.ts`, and two real Vite builds of
 * the real client. Nothing here is a fixture — the criterion names the
 * production bundle, so the production bundle is what is read.
 * Writes: two throwaway build outputs under the OS temp directory.
 *
 * WHY THIS IS NOT IN `Logger.test.ts`. `pnpm test` is `node --test`, where
 * `import.meta.env` does not exist; `Logger.ts` deliberately contains no
 * `import.meta` at all, and the stripping happens at the call site in the
 * composition root. BL-009 hit the same wall from the other side and answered
 * it by injecting the bundler's job and filing the gap (BL-089). **BL-010
 * cannot do that**, because "verified by a bundle grep test" names the
 * instrument. So the instrument is here, and `pnpm build` takes under two
 * seconds on this repository, which is what makes that affordable.
 *
 * ## The one-sided version of this test passes when the feature is absent
 *
 * "The production bundle does not contain `canvas attached...`" is also true
 * of a bundle built from a `main.ts` with no logging in it at all, of a grep
 * pointed at the wrong file, and of a build that silently failed. Every one
 * of those is a green test and a broken claim. So the check has three parts,
 * and the first two exist to make the third mean something:
 *
 *   1. **The probe exists.** The dev-only messages are parsed OUT OF
 *      `main.ts` rather than copied here, so the test cannot drift from the
 *      source, and finding none is a failure rather than a vacuous pass.
 *   2. **They survive a build that should keep them.** A development-mode
 *      build must contain every one of them. This is what proves the grep can
 *      see a string that is there.
 *   3. **They are gone from the production build**, which is the criterion.
 *
 * Deleting the `if (import.meta.env.DEV)` block from `main.ts` therefore does
 * not make this file pass. It fails at part 1, by name.
 */

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLIENT_DIR = join(REPO_ROOT, 'packages', 'client');
const MAIN_PATH = join(CLIENT_DIR, 'src', 'main.ts');
const VITE_BIN = join(CLIENT_DIR, 'node_modules', '.bin', 'vite');

/** The guard whose body a production build must fold away. */
const DEV_GUARD = 'if (import.meta.env.DEV) {';

/**
 * A message literal in the production bundle that is NOT inside the guard.
 *
 * The positive control for the grep itself: if this one is missing, the test
 * is reading the wrong file or a build that did not include `main.ts`, and
 * the absence of everything else says nothing at all.
 */
const ALWAYS_SHIPPED_MESSAGE = 'client booted';

const buildDirs: string[] = [];

after(() => {
  for (const dir of buildDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The message literals of every `debug`/`trace` call inside `main.ts`'s
 * development-only block.
 *
 * Parsed rather than copied, so this file and the source cannot disagree —
 * the same reason `check-lint-script.test.ts` reads the real `package.json`
 * instead of a transcription of it. Brace-counted rather than regex-matched
 * across the whole file, because a regex for "the block" would also match a
 * nested one and silently widen what this test believes it is checking.
 */
function devOnlyMessages(source: string): string[] {
  const start = source.indexOf(DEV_GUARD);
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  for (let i = start + DEV_GUARD.length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, `unbalanced braces after "${DEV_GUARD}" in main.ts`);

  const block = source.slice(start, end);
  const messages: string[] = [];
  const call = /\.(?:debug|trace)\(\s*'([^']+)'/g;
  let match = call.exec(block);
  while (match !== null) {
    messages.push(match[1] ?? '');
    match = call.exec(block);
  }
  return messages;
}

/** Runs one client build into a fresh temp directory and returns its JS. */
function buildBundleText(mode: 'production' | 'development'): string {
  const outDir = mkdtempSync(join(tmpdir(), `islebound-${mode}-`));
  buildDirs.push(outDir);

  execFileSync(VITE_BIN, ['build', '--mode', mode, '--outDir', outDir, '--emptyOutDir'], {
    cwd: CLIENT_DIR,
    stdio: 'pipe',
    // Vite decides `import.meta.env.DEV` from NODE_ENV as well as from
    // `--mode`, and `vite build` defaults NODE_ENV to production. Without
    // this the development arm emits a byte-identical bundle to the
    // production one and the control silently stops controlling — measured,
    // not assumed: the two builds produced the same content hash.
    env: { ...process.env, NODE_ENV: mode },
  });

  const assets = join(outDir, 'assets');
  const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
  assert.ok(scripts.length > 0, `no JS emitted by the ${mode} build`);
  return scripts.map((name) => readFileSync(join(assets, name), 'utf8')).join('\n');
}

describe('BL-010 criterion 2 — debug calls are stripped from the production bundle', () => {
  const source = readFileSync(MAIN_PATH, 'utf8');
  const messages = devOnlyMessages(source);

  it('main.ts still has development-only log calls to strip', () => {
    // Part 1. A grep over a bundle that never contained a debug call proves
    // nothing, so the probe's existence is asserted before its absence is.
    assert.ok(
      source.includes(DEV_GUARD),
      `main.ts no longer contains "${DEV_GUARD}"; BL-010 criterion 2 has nothing to verify`,
    );
    assert.ok(
      messages.length > 0,
      "no debug/trace call found inside main.ts's development-only block; " +
        'this test would pass vacuously',
    );
  });

  it('a development build keeps every one of them', () => {
    // Part 2, the control: it proves the grep can find a string that is
    // present, so part 3's absence is evidence of removal rather than of a
    // broken search.
    const bundle = buildBundleText('development');
    assert.ok(
      bundle.includes(ALWAYS_SHIPPED_MESSAGE),
      `the development bundle does not contain "${ALWAYS_SHIPPED_MESSAGE}"; ` +
        'this test is reading the wrong output',
    );
    for (const message of messages) {
      assert.ok(bundle.includes(message), `development bundle is missing "${message}"`);
    }
  });

  it('the production build contains none of them, and still contains what ships', () => {
    // Part 3, the criterion.
    const bundle = buildBundleText('production');
    assert.ok(
      bundle.includes(ALWAYS_SHIPPED_MESSAGE),
      `the production bundle does not contain "${ALWAYS_SHIPPED_MESSAGE}"; ` +
        'this test is reading the wrong output',
    );
    for (const message of messages) {
      assert.ok(
        !bundle.includes(message),
        `production bundle still contains the development-only message "${message}"`,
      );
    }
  });
});
