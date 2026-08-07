// Proves the custom lint rules of BL-002 actually fire.
//
// Owns: the "a deliberate violation of each custom rule is caught" half of
// BL-002's acceptance criteria.
// Reads: `tools/lint-fixtures/*`, and the real `eslint.config.js` — the point
// is to test the config the repository actually uses, not a copy of it.
// Writes: nothing. Exits non-zero on the first unmet expectation.
//
// Why a script and not a test: `pnpm test` does not exist yet (the Vitest
// harness is BL-015), and pulling a test framework forward would expand this
// task past its acceptance criteria. When BL-015 lands, this file is a
// candidate to become a `.test.ts` — the expectation table below is already
// shaped like one.
//
// Run with `pnpm lint:rules` (Node's `--experimental-strip-types`, no new
// dependency).

import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

interface Expectation {
  /** Fixture path, relative to the repository root. */
  readonly fixture: string;
  /** The rule that must report. */
  readonly ruleId: string;
  /** A distinctive substring of the message, so a *different* violation of the same rule does not count. */
  readonly messageIncludes: string;
  /** Minimum number of reports. Above 1 where the fixture covers several syntactic shapes of one rule. */
  readonly atLeast: number;
  /** What breaks in the product if this rule stops working. */
  readonly guards: string;
}

const EXPECTATIONS: readonly Expectation[] = [
  {
    fixture: 'tools/lint-fixtures/math-random.ts',
    ruleId: 'no-restricted-syntax',
    messageIncludes: 'Math.random is banned',
    atLeast: 1,
    guards: 'determinism: an unseeded draw makes a replay diverge and a bug report unreproducible',
  },
  {
    fixture: 'tools/lint-fixtures/dangerously-set-inner-html.tsx',
    ruleId: 'no-restricted-syntax',
    messageIncludes: 'dangerouslySetInnerHTML is banned',
    atLeast: 1,
    guards: 'XSS via the JSX attribute form',
  },
  {
    fixture: 'tools/lint-fixtures/dangerously-set-inner-html-prop.ts',
    ruleId: 'no-restricted-syntax',
    messageIncludes: 'dangerouslySetInnerHTML is banned',
    atLeast: 1,
    guards: 'XSS via a props object, which a JSX-attribute-only selector would miss',
  },
  {
    fixture: 'tools/lint-fixtures/per-frame-three-allocation.ts',
    ruleId: 'no-restricted-syntax',
    messageIncludes: 'No allocation in per-frame paths',
    // Four shapes in the fixture: function declaration, arrow assigned to a
    // const, class method, object method. Asserting the count is what catches
    // a selector list that quietly lost one of them.
    atLeast: 4,
    guards: 'the frame budget: a per-frame allocation is a GC pause the player feels',
  },
];

async function main(): Promise<number> {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    // The fixtures are in `ignores` so `pnpm lint` does not fail on them.
    // Linting them anyway is this script's entire job.
    ignore: false,
  });

  let failures = 0;

  for (const expectation of EXPECTATIONS) {
    const [result] = await eslint.lintFiles([expectation.fixture]);
    const matching =
      result?.messages.filter(
        (message) =>
          message.ruleId === expectation.ruleId &&
          message.message.includes(expectation.messageIncludes),
      ) ?? [];

    if (matching.length >= expectation.atLeast) {
      console.log(
        `  ok   ${expectation.fixture} — ${String(matching.length)}x ${expectation.ruleId} (${expectation.messageIncludes})`,
      );
      continue;
    }

    failures += 1;
    console.error(
      `  FAIL ${expectation.fixture} — expected >= ${String(expectation.atLeast)} report(s) of ` +
        `${expectation.ruleId} containing ${JSON.stringify(expectation.messageIncludes)}, got ${String(matching.length)}.`,
    );
    console.error(`       This rule guards ${expectation.guards}.`);
    for (const message of result?.messages ?? []) {
      console.error(`       saw: ${message.ruleId ?? '<parse>'} — ${message.message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${String(failures)} custom lint rule(s) did not fire. The config is broken.`);
    return 1;
  }

  console.log(`\nAll ${String(EXPECTATIONS.length)} custom lint rule fixtures were caught.`);
  return 0;
}

process.exitCode = await main();
