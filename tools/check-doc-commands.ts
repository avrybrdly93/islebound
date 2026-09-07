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
// FILTERED COMMANDS. `pnpm --filter <selector> <script>` runs a script from a
// *workspace package's* manifest, not the root's, so the rule above has to be
// applied against a different `package.json`. BL-072 added it, and it was the
// half worth doing: until then `PNPM_COMMAND`'s `(?!--)` skipped the flag and
// the filtered form was never read as a command at all — the check reported
// clean over `tasks/phase_7_multiplayer.md`'s
// `pnpm --filter server sim-smoke` by construction rather than by inspection.
//
// A SELECTOR MATCHES THE UNSCOPED TAIL, AND THAT WAS MEASURED RATHER THAN
// ASSUMED. `tasks/phase_7_multiplayer.md` writes `--filter server` while
// `packages/server/README.md` says the package will be `@halcyon/server`, and
// the root `package.json`'s own `dev` script writes the scoped form
// (`pnpm --filter @halcyon/client dev`) — which reads like a document naming
// a selector that cannot match. It is not: `pnpm --filter client typecheck`
// resolves to `@halcyon/client`, `--filter shared` to `@halcyon/shared`, and
// `--filter nonexistentpkg` reports "No projects matched the filters". So
// `selectPackage` accepts the full name or the unscoped tail, and the
// documents are right as written. Had this been reasoned about instead of
// run, the check would have enforced an invented convention across five
// documents.
//
// WHAT THE SELECTOR SUPPORT DELIBERATELY DOES NOT DO, stated because a silent
// blind spot in a check is worse than a declared one. pnpm's selector syntax
// is much larger than a name: globs (`@halcyon/*`), path selectors
// (`./packages/server`), dependency traversal (`...pkg`, `pkg...`), and
// `[<since>]` change selectors. None is supported, and none appears in any
// covered document. A selector this file cannot resolve is reported as
// unresolvable rather than skipped — the failure mode of the thing it
// replaced was skipping, and quietly ignoring a form it does not understand
// would rebuild exactly that.
//
// WHY THE COVERED LIST IS EVERY AGENT-FACING DOC AND NOT EVERY MARKDOWN FILE.
// BL-062 covered the two agent-facing documents its criteria named. BL-070
// added `README.md` and the two `tasks/*.md` that name the same commands.
// BL-072 added the remaining six `tasks/*.md`, which is every phase task file.
// `docs/*.md` beyond `AI_DEVELOPMENT_WORKFLOW.md` are still uncovered and
// several name these same commands — `docs/16_CRAFTING_SYSTEM.md`,
// `docs/36_MULTIPLAYER_ARCHITECTURE.md` and `docs/39_CONTENT_AUTHORING_GUIDE.md`
// among them. That is BL-072's discovered work and is filed, not ridden along
// (`35_AI_AGENT_RULES.md` §3). Adding a file here is a one-line diff, which is
// the point of the list being explicit.
//
// BL-070's real finding was not the list. `README.md` is the first covered
// document written for a human rather than for an agent following a verify
// block, and it broke an assumption this check had been making for free:
// that every `pnpm <word>` in a covered document is a command. Its "Tech at
// a glance" line says "pnpm workspace" as a plain noun phrase. See
// `commandText` — the scan is now restricted to fenced blocks and inline
// code spans, which is where a command a reader is meant to type always
// lives.
//
// Why a script and not a test: the same reason `check-lint-rules.ts` gives —
// `pnpm test` is an alias for `node --test` over `packages/*/src/**`, and
// this check reads repository-root files that no package owns. When BL-015
// lands a real test harness, this file is a candidate to become a
// `.test.ts`; the expectation below is already shaped like one.
//
// Run with `pnpm lint:docs` (Node's `--experimental-strip-types`, no new
// dependency).

import { readdirSync, readFileSync } from 'node:fs';

/** Documents whose `pnpm` commands are checked, relative to the repository root. */
const COVERED_DOCS: readonly string[] = [
  'CLAUDE.md',
  'docs/AI_DEVELOPMENT_WORKFLOW.md',
  'README.md',
  'tasks/phase_0_foundation.md',
  'tasks/phase_1_player_and_world.md',
  'tasks/phase_2_resources.md',
  'tasks/phase_3_crafting.md',
  'tasks/phase_4_building.md',
  'tasks/phase_5_life_simulation.md',
  'tasks/phase_6_polish.md',
  'tasks/phase_7_multiplayer.md',
];

/** Matches `pnpm <script>` — the script name only, stopping before any flag or argument. */
const PNPM_COMMAND = /\bpnpm\s+(?!--)([a-z][a-z0-9:-]*)/g;

/**
 * Matches `pnpm --filter <selector> <script>` (or `-F`), capturing both.
 *
 * Deliberately matched *before* `PNPM_COMMAND` and the matched text removed,
 * so the two rules cannot both fire on one reference. Without that, the
 * unfiltered pattern's `(?!--)` would still skip the flag and find nothing —
 * but a future relaxation of it would silently produce two findings for one
 * command, which is the kind of double-report that gets a check ignored.
 */
const PNPM_FILTERED_COMMAND =
  /\bpnpm\s+(?:--filter|-F)[=\s]+("[^"]+"|'[^']+'|[^\s]+)\s+([a-z][a-z0-9:-]*)/g;

/** Opens or closes a fenced code block. */
const FENCE = /^\s*```/;

/** An inline code span: the text between a matched pair of single backticks. */
const CODE_SPAN = /`([^`]+)`/g;

/**
 * The parts of `line` that are a *command reference* rather than prose.
 *
 * Inside a fenced block the whole line is code. Outside one, only the inline
 * code spans are — and that distinction is load-bearing rather than tidiness.
 * BL-070 extended COVERED_DOCS to `README.md`, whose "Tech at a glance" line
 * reads "Vite · pnpm workspace · three.js": prose, describing what kind of
 * repository this is. A whole-line search reads it as `pnpm workspace` and
 * reports a missing script, and no ignore-list entry fixes the class — the
 * next sentence to say "the pnpm store" or "pnpm workspaces" breaks it again.
 *
 * The narrowing is strictly safe for what the check is for: every real
 * reference in every covered document is already written as code, because a
 * command a reader is meant to type is formatted as one. It removes false
 * positives without weakening the rule — a document cannot escape the check
 * by putting a command in backticks, which is the only way anyone writes one.
 */
function commandText(line: string, insideFence: boolean): string[] {
  if (insideFence) return [line];
  return [...line.matchAll(CODE_SPAN)].map((match) => match[1] ?? '');
}

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
  ['assets:build', 'BL-071'],
  ['tools:balance', 'BL-075'],
]);

/**
 * The same promise, for filtered commands, keyed `<selector> <script>`.
 *
 * A separate table rather than a shared one because the key is a pair: two
 * packages may each have a `build` script, only one of which is unbuilt, and
 * a table keyed on the script name alone could not say which.
 */
const UNBUILT_FILTERED_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['server sim-smoke', 'BL-076'],
]);

/** A workspace package: the directory it lives in, its manifest name, and its scripts. */
interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
  readonly scripts: ReadonlySet<string>;
}

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
 * Every `packages/*` directory that is actually a pnpm workspace member.
 *
 * A directory without a `package.json` is **not** a member — `packages/server`
 * is one today, deliberately: its README says it "is not yet a pnpm workspace
 * member" until Phase 7 opens. So it is skipped here rather than treated as an
 * empty package, which keeps `--filter server` unresolvable and routes it
 * through the forward-reference table, where it belongs.
 *
 * `pnpm-workspace.yaml` says `packages/*` and this reads `packages/*`. If that
 * glob ever grows a second entry, this is the line that has to follow it — and
 * the failure mode is a package reported unresolvable, which is loud.
 */
function workspacePackages(): readonly WorkspacePackage[] {
  const found: WorkspacePackage[] = [];
  for (const entry of readdirSync(new URL('packages/', repoRoot), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let raw: string;
    try {
      raw = read(`packages/${entry.name}/package.json`);
    } catch {
      continue;
    }
    const manifest = JSON.parse(raw) as { name?: string; scripts?: Record<string, string> };
    found.push({
      directory: entry.name,
      name: manifest.name ?? entry.name,
      scripts: new Set(Object.keys(manifest.scripts ?? {})),
    });
  }
  return found;
}

/**
 * The package a `--filter` selector names, or `undefined`.
 *
 * Matches the full manifest name (`@halcyon/client`) or its unscoped tail
 * (`client`) — which is pnpm's own behaviour, measured rather than assumed;
 * see the module header. The directory name is accepted too, and for these
 * packages it coincides with the tail.
 *
 * Returns `undefined` for anything else, **including** the selector forms this
 * file does not support (globs, path selectors, `...` traversal). The caller
 * reports that as unresolvable rather than skipping it.
 */
function selectPackage(
  packages: readonly WorkspacePackage[],
  selector: string,
): WorkspacePackage | undefined {
  const wanted = selector.replace(/^["']|["']$/g, '');
  return packages.find(
    (pkg) =>
      pkg.name === wanted ||
      pkg.name.replace(/^@[^/]+\//, '') === wanted ||
      pkg.directory === wanted,
  );
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

/**
 * Findings for the `pnpm --filter <selector> <script>` references in `texts`,
 * and the same texts with those references blanked out so the unfiltered rule
 * below cannot fire on them a second time.
 *
 * The whole rule lives here rather than being split between this function and
 * its caller. A first draft put the "no row" half here and the "row exists but
 * the item is not named beside it" half in the loop below, and the split had a
 * real consequence: a **stale** row — one left behind after the script landed
 * — was suppressed whenever the document still carried the annotation, which
 * is precisely when a stale row is most likely to be there. One place, one
 * decision.
 */
function filteredFindings(
  doc: string,
  lines: readonly string[],
  index: number,
  texts: readonly string[],
  packages: readonly WorkspacePackage[],
): { readonly findings: Finding[]; readonly remaining: string[] } {
  const findings: Finding[] = [];
  const remaining = texts.map((text) =>
    text.replace(PNPM_FILTERED_COMMAND, (whole, rawSelector: string, script: string) => {
      const selector = rawSelector.replace(/^["']|["']$/g, '');
      const named = `--filter ${selector} ${script}`;
      const owner = UNBUILT_FILTERED_COMMANDS.get(`${selector} ${script}`);
      const pkg = selectPackage(packages, selector);
      const blank = ' '.repeat(whole.length);

      const report = (why: string): void => {
        findings.push({ doc, script: named, line: index + 1, why });
      };

      if (pkg !== undefined && pkg.scripts.has(script)) {
        // Built and present. A row here is a stale promise, and it is reported
        // unconditionally: the table is how a forward reference is approved,
        // and one left behind after the script lands quietly pre-approves the
        // next regression.
        if (owner !== undefined) {
          report(
            `it exists in ${pkg.name}, so its UNBUILT_FILTERED_COMMANDS row naming ${owner} is stale and should be deleted`,
          );
        }
        return blank;
      }

      if (owner === undefined) {
        report(
          pkg === undefined
            ? `no workspace package matches the selector \`${selector}\`, and there is no row in UNBUILT_FILTERED_COMMANDS naming the backlog item that will add it`
            : `${pkg.name} has no \`${script}\` script and there is no row in UNBUILT_FILTERED_COMMANDS naming the backlog item that will add it`,
        );
        return blank;
      }

      // A filtered forward reference has to name its item beside itself, on
      // the same terms as an unfiltered one. `annotationScope` is shared, so
      // the two rules cannot drift apart on what "beside" means.
      if (!annotationScope(lines, index).includes(owner)) {
        report(
          `it is not built yet and ${owner} — the item that will build it — is not named beside it`,
        );
      }
      return blank;
    }),
  );
  return { findings, remaining };
}

function findingsIn(
  doc: string,
  scripts: ReadonlySet<string>,
  packages: readonly WorkspacePackage[],
): Finding[] {
  const lines = read(doc).split('\n');
  const findings: Finding[] = [];
  let insideFence = false;

  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    const filtered = filteredFindings(doc, lines, index, commandText(line, insideFence), packages);
    findings.push(...filtered.findings);

    const seen = new Set<string>();
    for (const match of filtered.remaining.flatMap((text) => [...text.matchAll(PNPM_COMMAND)])) {
      const script = match[1];
      if (script === undefined) continue;
      if (PNPM_BUILTINS.has(script)) continue;
      if (scripts.has(script)) continue;
      // One finding per script per line: a line naming the same unbuilt
      // command twice has one problem, not two.
      if (seen.has(script)) continue;
      seen.add(script);

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
const packages = workspacePackages();
const findings = COVERED_DOCS.flatMap((doc) => findingsIn(doc, scripts, packages));

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `${finding.doc}:${finding.line}: names \`pnpm ${finding.script}\`, but ${finding.why}.`,
    );
  }
  console.error(
    `\n${findings.length} unbuildable command reference(s). Either add the script (to package.json, or to the ` +
      `filtered package's own manifest), or add a row to UNBUILT_COMMANDS / UNBUILT_FILTERED_COMMANDS and name ` +
      `that backlog item beside the command (BL-062 is why this check exists).`,
  );
  process.exit(1);
}

console.log(
  `check-doc-commands: ${COVERED_DOCS.length} document(s) clean — every \`pnpm\` command they name either exists or names its backlog item.`,
);
