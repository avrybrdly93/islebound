// Proves the type-aware lint rules still report over `tools/`. Refs BL-083.
//
// Owns: BL-083's acceptance criteria.
// Reads: `tools/lint-typed-fixtures/floating-promise.ts` and the real
// `eslint.config.js`, through the ESLint API. The point is to exercise the
// config the repository actually uses, not a copy of its expectations.
// Writes: nothing.
//
// WHAT WENT WRONG, AND WHY ONE GLOB IS WORTH A TEST. BL-082 removed
// `tools/**/*.ts` from `eslint.config.js`'s `disableTypeChecked` block,
// switching a whole class of rule back on over four scripts and two test
// files — and it found six real errors on its first run. Nothing stopped a
// later edit putting the glob back. That failure is silent in the worst way:
// `pnpm lint` exits 0, `pnpm lint:rules` passes, `pnpm typecheck` passes, and
// the only difference is that the rules stop reporting. This repository has
// now produced that shape seven times (BL-077, BL-079, BL-080, BL-081,
// BL-082, decision 0029's fourteen unchecked breaches, and this).
//
// WHY THIS IS A TEST AND NOT A ROW IN `tools/check-lint-rules.ts`, WHICH IS
// WHERE BL-083'S OWN NOTES POINT. That file's `EXPECTATIONS` table is shaped
// exactly like this assertion, and it is still the wrong home: it is run by
// `pnpm lint:rules`, which is **not** in the verify block
// (`AI_DEVELOPMENT_WORKFLOW.md` §6 is `pnpm lint && pnpm typecheck && pnpm
// test`; `lint:rules` is named in the prose beneath it, exactly where
// `lint:docs` sits). `tools/check-lint-script.test.ts`'s header already
// rejected that position for BL-079's guard, in as many words: hosting it
// there "would reproduce BL-077's exact shape one level up: a check that
// exists and that nothing is obliged to run." BL-083's first criterion allows
// either home, so this is a choice inside the criteria rather than a
// deviation from them.
//
// WHY A FLOATING PROMISE. The fixture has to violate a rule that *cannot* be
// reported without type information — knowing `work()` returns a `Promise` is
// the entire finding. A syntactic rule would report identically with
// type-awareness off and prove nothing: BL-082's Surprise 7, where a control
// failed for the wrong reason and looked exactly like a control that worked.
// Verified by running the control against the old state rather than by
// reading the rule's documentation: with `tools/**/*.ts` restored to the
// `disableTypeChecked` block, ESLint reports **nothing at all** on the
// fixture, and with it removed the rule reports once.
//
// THE SECOND CASE IS BL-083'S THIRD CRITERION AND IS NOT DECORATION. The
// syntactic rules were never switched off over `tools/`, so if the fixture
// happened to trip one, this file could stay green through exactly the
// regression it exists to catch. It asserts they report nothing here.
//
// THE RESIDUAL, DECLARED, AND IT IS THE SAME ONE ITS SIBLING DECLARES. This
// file is reached through `test:node`'s `tools/**/*.test.ts` glob, so the
// guard leans on that glob the way BL-079's leaned on `lint`'s string. It is
// a smaller hole, it is not closed, and it cannot be closed from here. The
// closure is BL-019's CI, where a check that silently stops running shows up
// as a job that stops reporting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/** The fixture, repository-relative, as ESLint wants it. */
const FIXTURE = 'tools/lint-typed-fixtures/floating-promise.ts';

/**
 * The rule the guard turns on. Type-aware, so `disableTypeChecked` silences
 * it; `no-restricted-syntax` and the rest of the custom four cannot report it.
 */
const TYPE_AWARE_RULE = '@typescript-eslint/no-floating-promises';

/** What breaks in the product if this stops reporting. */
const GUARDS =
  'a whole class of lint rule silently stops reporting over tools/ — the directory ' +
  'that holds every gate `pnpm test` and `pnpm lint:rules` load through, and where ' +
  'turning these rules on found six real errors on the first run (BL-082)';

async function lintFixture(): Promise<readonly ESLint.LintResult['messages'][number][]> {
  const eslint = new ESLint({
    cwd: repoRoot,
    // The fixture is in `ignores` so `pnpm lint` does not fail on a
    // deliberate violation. Linting it anyway is this file's entire job —
    // the same trick `tools/check-lint-rules.ts` plays on the other fixtures.
    ignore: false,
  });
  const [result] = await eslint.lintFiles([FIXTURE]);
  assert.ok(
    result !== undefined,
    `ESLint returned no result for ${FIXTURE}; is the file still there?`,
  );
  return result.messages;
}

test('a type-aware rule still reports on a tools/ file inside the tools project', async () => {
  const messages = await lintFixture();

  const fatal = messages.filter((message) => message.fatal === true);
  assert.equal(
    fatal.length,
    0,
    `${FIXTURE} failed to parse, so no rule could report on it. That is the other ` +
      `way this guard goes red: it means the file left tools/tsconfig.json's include, ` +
      `or joined the disableTypeChecked block. Saw: ${JSON.stringify(fatal.map((m) => m.message))}`,
  );

  const matching = messages.filter((message) => message.ruleId === TYPE_AWARE_RULE);
  assert.ok(
    matching.length >= 1,
    `${TYPE_AWARE_RULE} did not report on ${FIXTURE}, so the type-aware rules are off ` +
      `over tools/ again — BL-082 reopening, and BL-083 is the guard you are reading. ` +
      `Check eslint.config.js's disableTypeChecked block for a \`tools/**/*.ts\` or ` +
      `\`tools/lint-typed-fixtures/**\` entry. This rule guards ${GUARDS}. ` +
      `Saw: ${JSON.stringify(messages.map((m) => `${m.ruleId ?? '<parse>'}: ${m.message}`))}`,
  );
});

test('the syntactic rules report nothing on that fixture, so they cannot mask the regression', async () => {
  const messages = await lintFixture();

  // BL-083's third criterion. `no-restricted-syntax` carries all four custom
  // rules and was never switched off over `tools/`, so a fixture that tripped
  // one could keep this file green through the exact regression it guards.
  const syntactic = messages.filter((message) => message.ruleId === 'no-restricted-syntax');
  assert.equal(
    syntactic.length,
    0,
    `${FIXTURE} now trips a custom syntactic rule. Those were never disabled over ` +
      `tools/, so a fixture that trips one can stay green with the type-aware rules ` +
      `off. Remove the syntactic violation rather than relaxing this assertion. ` +
      `Saw: ${JSON.stringify(syntactic.map((m) => m.message))}`,
  );
});

test('the fixture is the only thing it needs to be: one finding, and it is the type-aware one', async () => {
  const messages = await lintFixture();

  // Not a style preference. A fixture that accumulates unrelated findings
  // stops being evidence about one rule, and the first case above would then
  // pass on a file whose violation had been replaced by a different one.
  assert.deepEqual(
    messages.map((message) => message.ruleId),
    [TYPE_AWARE_RULE],
    `${FIXTURE} should report exactly one finding, ${TYPE_AWARE_RULE}. If a new rule ` +
      `landed that also reports here, either narrow the fixture or widen this list ` +
      `deliberately — do not let it drift.`,
  );
});
