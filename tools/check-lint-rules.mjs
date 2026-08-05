#!/usr/bin/env node
/**
 * Tests the project-specific lint rules (BL-002).
 *
 * `pnpm lint` proves the codebase is clean. It cannot prove the rules still
 * work: a selector that quietly stops matching — a plugin upgrade, a renamed
 * AST node, a typo — produces exactly the same silence as compliant code. So
 * each rule gets a fixture containing both violating and compliant code, and
 * this script asserts the rule fires on the former and stays quiet on the
 * latter. Over-broad selectors are as much a failure as absent ones.
 *
 * It imports `RESTRICTED_SYNTAX` from `eslint.config.js`, so it tests the
 * shipping rule definitions rather than a copy that could drift.
 *
 * The fixtures deliberately violate the rules, so `eslint.config.js` ignores
 * `tools/lint-fixtures/` and this script lints them through a small standalone
 * config: parser only, no type information, no other rules. `pnpm test`
 * (vitest) does not exist until BL-015 — when it does, this becomes a test
 * file and the script goes away.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { RESTRICTED_SYNTAX } from '../eslint.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'tools/lint-fixtures';

/**
 * What each fixture must produce. `violations` is the exact number of reports
 * expected: an exact count is what catches a selector that has grown to match
 * the compliant cases too.
 */
const EXPECTATIONS = [
  {
    fixture: `${FIXTURES}/math-random.ts`,
    rule: 'Math.random',
    violations: 1,
    messageIncludes: 'Math.random breaks determinism',
  },
  {
    fixture: `${FIXTURES}/dangerously-set-inner-html.tsx`,
    rule: 'dangerouslySetInnerHTML',
    violations: 2,
    messageIncludes: 'dangerouslySetInnerHTML is banned',
  },
  {
    fixture: `${FIXTURES}/three-in-per-frame.ts`,
    rule: 'new THREE.* in update*/sync*/step*',
    violations: 4,
    messageIncludes: 'No allocation in per-frame paths',
  },
];

const eslint = new ESLint({
  cwd: ROOT,
  // The fixtures are ignored by the project config on purpose; lint them anyway.
  ignore: false,
  overrideConfigFile: true,
  overrideConfig: {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: { 'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX] },
  },
});

let failed = 0;

for (const expected of EXPECTATIONS) {
  const [result] = await eslint.lintFiles([expected.fixture]);
  const messages = result?.messages ?? [];

  if (messages.length !== expected.violations) {
    failed++;
    console.error(
      `FAIL  ${expected.rule}: expected ${expected.violations} violation(s) in ` +
        `${expected.fixture}, got ${messages.length}.`,
    );
    for (const message of messages) {
      console.error(`        line ${message.line}: ${message.message}`);
    }
    continue;
  }

  const offMessage = messages.find((m) => !m.message.includes(expected.messageIncludes));
  if (offMessage) {
    failed++;
    console.error(
      `FAIL  ${expected.rule}: a report in ${expected.fixture} did not carry the expected ` +
        `guidance (line ${offMessage.line}): ${offMessage.message}`,
    );
    continue;
  }

  console.log(
    `ok    ${expected.rule}: ${expected.violations} violation(s) caught, compliant code quiet.`,
  );
}

/**
 * The boundary table (`04` §5) needs the same treatment, and for a sharper
 * reason: while this was being written, `boundaries/dependencies` reported
 * *nothing* for a sim -> render import, because module specifiers were not
 * being resolved and an unclassified dependency is not a violation. A rule
 * that passes everything looks identical to a codebase with no violations.
 *
 * This check runs the real project config — resolver, elements, policies —
 * against a file written into `src/sim/` for the duration of the check and
 * removed immediately after. A synthetic path would not do: the element type
 * comes from where the file actually is.
 */
const BOUNDARY_FIXTURE = path.join(ROOT, 'packages/client/src/sim/__boundary_check__.ts');
const BOUNDARY_FIXTURE_SOURCE = [
  '// Temporary fixture written by tools/check-lint-rules.mjs. If you are',
  '// reading this in a working tree, the check crashed; delete the file.',
  "import { RENDER_MODULE } from '@render/_scaffold';",
  '',
  "export const SIM_BOUNDARY_CHECK = 'sim' + RENDER_MODULE;",
  '',
].join('\n');

const projectEslint = new ESLint({ cwd: ROOT });
let boundaryMessages = [];
try {
  fs.writeFileSync(BOUNDARY_FIXTURE, BOUNDARY_FIXTURE_SOURCE);
  const [boundaryResult] = await projectEslint.lintFiles([BOUNDARY_FIXTURE]);
  boundaryMessages = boundaryResult?.messages ?? [];
} finally {
  fs.rmSync(BOUNDARY_FIXTURE, { force: true });
}

const boundaryViolation = boundaryMessages.find((m) => m.ruleId === 'boundaries/dependencies');
if (boundaryViolation) {
  console.log(
    'ok    boundary table: a sim -> render import is reported by boundaries/dependencies.',
  );
} else {
  failed++;
  console.error(
    'FAIL  boundary table: a sim -> render import was NOT reported. The boundary rule is not ' +
      'enforcing anything — check that the import resolver still resolves the @-aliases.',
  );
  for (const message of boundaryMessages) {
    console.error(`        line ${message.line}: ${message.ruleId ?? 'parse'} ${message.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} lint-rule check(s) failed.`);
  process.exit(1);
}

console.log(
  `\nAll ${EXPECTATIONS.length} project-specific lint rules verified, plus the boundary table.`,
);
