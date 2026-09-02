// Proves the agent-facing docs do not name a `pnpm` script that does not exist.
//
// Owns: BL-062's acceptance criteria, as a check rather than as a one-time
// edit. The bug BL-062 records is that `CLAUDE.md` and
// `docs/AI_DEVELOPMENT_WORKFLOW.md` tell every session to run three commands
// the repository does not have, and an agent following the block literally
// gets three command-not-found errors with no way to tell which are expected.
// Fixing the wording once fixes today; this file is what stops it coming
// back, and it is the regression check `29_TESTING_STRATEGY.md` §9's *Bug
// fix* row requires.
//
// Reads: the two documents below, and the real root `package.json` — the
// point is to check the scripts the repository actually has, not a copy of
// the list.
// Writes: nothing. Exits non-zero on the first unmet expectation.
//
// THE RULE. Every `pnpm <script>` a covered document names must either
//
//   (a) exist in the root `package.json`'s `scripts`, or
//   (b) have a row in UNBUILT_COMMANDS naming the backlog item that will
//       build it, AND carry *that* backlog id in the same paragraph or the
//       one immediately after.
//
// The table is what makes (b) a check rather than a formality. An earlier
// draft asked only for "some `BL-###` nearby", and a perturbation exposed it
// immediately: deleting `BL-014` from the note left `BL-017` and `BL-062`
// still in the paragraph, and the check stayed green while the document had
// stopped saying which item builds `pnpm sim`. Naming the expected id per
// script is the same shape `check-lint-rules.ts`'s expectation table uses,
// and for the same reason.
//
// The "or the one immediately after" half is not laxity. A command block is
// fenced, and the natural place to explain a fenced block is the prose under
// it — separated by the blank line that ends the fence's paragraph. Requiring
// the marker strictly inside the paragraph would force `BL-014` into the
// middle of a command an agent is meant to copy, or force the explanation to
// abut the fence with no blank line. Both are worse documents, and a check
// that makes documents worse gets deleted.
//
// (b) is what makes a Phase-0 repository honest rather than merely quiet: the
// unbuilt commands are unbuilt *on purpose*, and the useful thing to tell a
// session is not "do not run this" but "this arrives with BL-014".
//
// WHY THE COVERED LIST IS TWO FILES AND NOT EVERY MARKDOWN FILE. BL-062's
// description names exactly two documents and its criteria say "both docs".
// `README.md` and `tasks/*.md` name the same commands and are deliberately
// out of this task's scope (`35_AI_AGENT_RULES.md` §3 forbids the
// ride-along); extending COVERED_DOCS to them is BL-070. Adding a file here
// is a one-line diff, which is the point of the list being explicit.
//
// Why a script and not a test: the same reason `check-lint-rules.ts` gives —
// `pnpm test` is an alias for `node --test` over `packages/*/src/**`, and
// this check reads repository-root files that no package owns. When BL-015
// lands a real test harness, this file is a candidate to become a
// `.test.ts`; the expectation below is already shaped like one.
//
// Run with `pnpm lint:docs` (Node's `--experimental-strip-types`, no new
// dependency).

import { readFileSync } from 'node:fs';

/** Documents whose `pnpm` commands are checked, relative to the repository root. */
const COVERED_DOCS: readonly string[] = ['CLAUDE.md', 'docs/AI_DEVELOPMENT_WORKFLOW.md'];

/** Matches `pnpm <script>` — the script name only, stopping before any flag or argument. */
const PNPM_COMMAND = /\bpnpm\s+(?!--)([a-z][a-z0-9:-]*)/g;

/**
 * Script names that are pnpm's own, not this repository's, so `package.json`
 * is the wrong place to look for them.
 */
const PNPM_BUILTINS: ReadonlySet<string> = new Set([
  'install',
  'add',
  'remove',
  'run',
  'exec',
  'dlx',
  'why',
  'up',
  'outdated',
]);

/**
 * Commands the documents name on purpose that the repository has not built
 * yet, and the backlog item that will build each.
 *
 * A row here is a promise, not permission: the check still requires the
 * document to say so where the command is named. Adding a row is how a new
 * forward reference gets approved, and it is a visible diff.
 */
const UNBUILT_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['sim', 'BL-014'],
  ['check:bundle', 'BL-018'],
]);

interface Finding {
  readonly doc: string;
  readonly script: string;
  readonly line: number;
  readonly why: string;
}

const repoRoot = new URL('..', import.meta.url);

function read(relative: string): string {
  return readFileSync(new URL(relative, repoRoot), 'utf8');
}

function definedScripts(): ReadonlySet<string> {
  const manifest = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
  return new Set(Object.keys(manifest.scripts ?? {}));
}

/**
 * The text a `BL-###` marker may live in for a command on line `index`: the
 * run of non-blank lines around it, plus the next such run.
 *
 * See the module header for why the following paragraph counts. Note it is
 * the *following* one only — a marker in the paragraph before would let an
 * unrelated earlier mention excuse a later command, and the direction of a
 * document is top to bottom.
 */
function annotationScope(lines: readonly string[], index: number): string {
  let start = index;
  while (start > 0 && lines[start - 1]?.trim() !== '') start -= 1;
  let end = index;
  while (end + 1 < lines.length && lines[end + 1]?.trim() !== '') end += 1;

  let nextStart = end + 1;
  while (nextStart < lines.length && lines[nextStart]?.trim() === '') nextStart += 1;
  let nextEnd = nextStart;
  while (nextEnd + 1 < lines.length && lines[nextEnd + 1]?.trim() !== '') nextEnd += 1;

  return lines.slice(start, Math.min(nextEnd + 1, lines.length)).join('\n');
}

function findingsIn(doc: string, scripts: ReadonlySet<string>): Finding[] {
  const lines = read(doc).split('\n');
  const findings: Finding[] = [];

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(PNPM_COMMAND)) {
      const script = match[1];
      if (script === undefined) continue;
      if (PNPM_BUILTINS.has(script)) continue;
      if (scripts.has(script)) continue;

      const owner = UNBUILT_COMMANDS.get(script);
      if (owner === undefined) {
        findings.push({
          doc,
          script,
          line: index + 1,
          why: `it is not a script in package.json and has no row in UNBUILT_COMMANDS naming the backlog item that will build it`,
        });
        continue;
      }

      if (!annotationScope(lines, index).includes(owner)) {
        findings.push({
          doc,
          script,
          line: index + 1,
          why: `it is not built yet and ${owner} — the item that will build it — is not named beside it`,
        });
      }
    }
  }
  return findings;
}

const scripts = definedScripts();
const findings = COVERED_DOCS.flatMap((doc) => findingsIn(doc, scripts));

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `${finding.doc}:${finding.line}: names \`pnpm ${finding.script}\`, but ${finding.why}.`,
    );
  }
  console.error(
    `\n${findings.length} unbuildable command reference(s). Either add the script to package.json, or add a row to ` +
      `UNBUILT_COMMANDS and name that backlog item beside the command (BL-062 is why this check exists).`,
  );
  process.exit(1);
}

console.log(
  `check-doc-commands: ${COVERED_DOCS.length} document(s) clean — every \`pnpm\` command they name either exists or names its backlog item.`,
);
