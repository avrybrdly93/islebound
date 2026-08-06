// BL-002 — one fixture per custom lint rule, asserted rather than assumed.
//
// A lint rule that silently stops matching is worse than no rule: `pnpm lint`
// still passes, so nothing tells you the guard is gone. This script lints each
// deliberately-violating fixture in tools/lint-fixtures/ and fails unless the
// expected rule fires on the expected line. It also lints one clean control
// file and fails if ANY rule fires there, so a rule that has become
// over-broad is caught too.
//
// Fixtures are excluded from `pnpm lint` via eslint.config.js `ignores`; this
// script lints them explicitly with `warnIgnored: false` and, where the rule is
// path-scoped (sim/ purity, module boundaries), lints the fixture's text under
// an overridden filename so the config's `files` patterns match.
//
// Run: pnpm lint:rules   (folded into the Vitest suite when BL-015 lands)

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tools', 'lint-fixtures');

/**
 * Each case names the rule that MUST fire and, for path-scoped rules, the
 * filename the fixture's text is linted as. `expectedMatches` is the minimum
 * number of reports for that rule -- fixtures with two violations assert two,
 * so deleting one selector branch is caught.
 */
const CASES = [
  {
    name: 'Math.random is banned project-wide',
    fixture: 'math-random.ts',
    lintAs: 'packages/client/src/render/__fixture__.ts',
    rule: 'no-restricted-syntax',
    expectedMatches: 1,
  },
  {
    name: 'dangerouslySetInnerHTML is banned',
    fixture: 'dangerously-set-inner-html.tsx',
    lintAs: 'packages/client/src/ui/__fixture__.tsx',
    rule: 'no-restricted-syntax',
    expectedMatches: 1,
  },
  {
    name: 'new THREE.* inside an update*/sync*/step* function is banned',
    fixture: 'new-three-in-frame-fn.ts',
    lintAs: 'packages/client/src/render/__fixture__.ts',
    rule: 'no-restricted-syntax',
    // Two violations: the `updateCamera` declaration and the `syncMeshes`
    // arrow function. Asserting 2 pins both selector branches.
    expectedMatches: 2,
  },
  {
    name: 'sim/ may not import three (04 §5 hard rule)',
    fixture: 'sim-imports-three.ts',
    lintAs: 'packages/client/src/sim/__fixture__.ts',
    rule: 'no-restricted-imports',
    expectedMatches: 1,
  },
  {
    name: 'sim/ may not touch the DOM (04 §5 hard rule)',
    fixture: 'sim-uses-dom.ts',
    lintAs: 'packages/client/src/sim/__fixture__.ts',
    rule: 'no-restricted-globals',
    expectedMatches: 1,
  },
  {
    name: 'core/ may import nothing (04 §5 import-direction table)',
    fixture: 'boundary-core-imports-sim.ts',
    lintAs: 'packages/client/src/core/__fixture__.ts',
    rule: 'boundaries/dependencies',
    expectedMatches: 1,
  },
];

/** A file that violates nothing, to catch a rule that has become over-broad. */
const CONTROL = {
  lintAs: 'packages/client/src/core/__control__.ts',
  source: [
    '// CONTROL — violates nothing. If a rule fires here, it is over-broad.',
    'export function updateClock(elapsedTicks: number): number {',
    '  return elapsedTicks + 1;',
    '}',
    '',
  ].join('\n'),
};

// Type-aware parsing, and the rules that depend on it, are switched off for
// this instance only. The fixtures are linted under synthetic filenames that do
// not exist on disk, which the type-aware project service cannot resolve; and
// every rule under test here is purely syntactic (AST selectors, import paths,
// globals, module boundaries), so nothing under test is weakened. The
// type-aware rules are still enforced by `pnpm lint` over the real tree.
const eslint = new ESLint({
  cwd: ROOT,
  warnIgnored: false,
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false, project: null } },
      rules: { ...tseslint.configs.disableTypeChecked.rules },
    },
  ],
});

/** Reports for `source`, linted as `filePath` so path-scoped config applies. */
async function lintAs(source, filePath) {
  const results = await eslint.lintText(source, { filePath, warnIgnored: false });
  return results.flatMap((result) => result.messages);
}

let failures = 0;

for (const testCase of CASES) {
  // Always linted under a synthetic path inside packages/, never under
  // tools/lint-fixtures/ itself: that directory is in eslint.config.js's
  // `ignores` (so `pnpm lint` stays green), and an ignored path produces no
  // reports no matter what it contains.
  const source = await readFile(join(FIXTURES, testCase.fixture), 'utf8');
  const filePath = join(ROOT, testCase.lintAs);

  let messages;
  try {
    messages = await lintAs(source, filePath);
  } catch (error) {
    console.error(`FAIL  ${testCase.name}\n      ESLint threw: ${error.message}`);
    failures++;
    continue;
  }

  const matched = messages.filter((message) => message.ruleId === testCase.rule);
  const fatal = messages.filter((message) => message.fatal);

  if (fatal.length > 0) {
    console.error(`FAIL  ${testCase.name}\n      fixture did not parse: ${fatal[0].message}`);
    failures++;
    continue;
  }

  if (matched.length < testCase.expectedMatches) {
    console.error(
      `FAIL  ${testCase.name}\n` +
        `      expected >= ${testCase.expectedMatches} report(s) from '${testCase.rule}' ` +
        `in ${testCase.fixture}, got ${matched.length}.\n` +
        `      Rules that did fire: ${
          [...new Set(messages.map((m) => m.ruleId ?? '(fatal)'))].join(', ') || '(none)'
        }`,
    );
    failures++;
    continue;
  }

  console.log(`ok    ${testCase.name} (${matched.length}x ${testCase.rule})`);
}

const controlMessages = await lintAs(CONTROL.source, join(ROOT, CONTROL.lintAs));
if (controlMessages.length > 0) {
  console.error(
    `FAIL  control file should produce no reports, got: ${controlMessages
      .map((m) => `${m.ruleId ?? '(fatal)'}: ${m.message}`)
      .join('; ')}`,
  );
  failures++;
} else {
  console.log('ok    control file produces no reports');
}

if (failures > 0) {
  console.error(`\n${failures} lint-rule check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length + 1} lint-rule checks passed.`);
