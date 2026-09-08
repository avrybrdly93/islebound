// There is exactly one workflow document, and every reference to it resolves.
//
// BL-073's second acceptance criterion, given teeth. The bug it is against:
// `.github/AI_DEVELOPMENT_WORKFLOW` — no extension, CRLF, 81 lines — sat
// beside the canonical `docs/AI_DEVELOPMENT_WORKFLOW.md` for weeks while five
// documents told every session to read `.github/AI_DEVELOPMENT_WORKFLOW.md`,
// a path that existed in neither form. Nothing noticed, because the only
// document check in the repository (`check-doc-commands.ts`) reads `pnpm`
// commands and covered the `docs/` copy alone.
//
// **And the copy had already rotted, which is why this is a check and not an
// edit.** Normalised for line endings the two differed in exactly one hunk:
// BL-062's note saying which commands do not exist yet and which backlog item
// builds each. The copy was a strict subset — a document that had silently
// stopped saying the thing a previous session added it to say. Deleting it
// fixes today; this file is what stops the next copy.
//
// TWO RULES.
//
// 1. **One document.** No file anywhere in the tree is named
//    `AI_DEVELOPMENT_WORKFLOW` in any extension, except the canonical one.
//    A second copy is the failure this exists to prevent, and it is caught by
//    its name rather than by its content: a copy that has drifted far enough
//    to look like a different document is worse, not better.
//
// 2. **Every reference resolves.** In the documents that *instruct* a reader,
//    a path naming the workflow document must be one that exists.
//
// WHY RULE 2 HAS AN ESCAPE HATCH, AND WHY IT IS THE ONE THIS REPOSITORY
// ALREADY USES. `docs/32_BACKLOG.md` and `docs/34_DEVELOPMENT_LOG.md` name the
// broken path on purpose — a backlog item describes the bug it is about, and a
// log records what was true when it was written. A rule that forced those to
// be rewritten would be destroying the record to satisfy a checker. So a
// mention is allowed when a `BL-###` id appears beside it, in the same
// paragraph or the one that follows: the same "name the item beside it"
// contract `check-doc-commands.ts` applies to a command that does not exist
// yet, and for the same reason — a document may name something absent as long
// as it says which item that absence belongs to.
//
// That is deliberately *not* a per-document exclusion list. An exclusion list
// says "this file may rot"; this says "any file may describe a broken path,
// provided it says which item the description belongs to". A live instruction
// — "read `.github/AI_DEVELOPMENT_WORKFLOW.md` first" — carries no id, and is
// caught.
//
// Why a script and not a test: the same reason `check-doc-commands.ts` and
// `check-lint-rules.ts` give — `pnpm test` runs `node --test` over
// `packages/*/src/**`, and this reads repository-root files no package owns.
// Run by `pnpm lint:docs`, alongside the command check.

import { readdirSync, readFileSync, statSync } from 'node:fs';

/** The one workflow document, relative to the repository root. */
const CANONICAL = 'docs/AI_DEVELOPMENT_WORKFLOW.md';

/** Any file whose basename is the workflow document's, in any extension or none. */
const WORKFLOW_FILENAME = /^AI_DEVELOPMENT_WORKFLOW(\.[A-Za-z0-9]+)?$/;

/** A path mentioning the workflow document, wherever it appears in a line. */
const WORKFLOW_REFERENCE = /[A-Za-z0-9_./-]*AI_DEVELOPMENT_WORKFLOW(?:\.[A-Za-z0-9]+)?/g;

/** A backlog id, which is what licenses a mention of a path that does not exist. */
const BACKLOG_ID = /\bBL-\d{3}\b/;

/** Directories never worth walking. */
const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
]);

/**
 * Documents whose workflow references are checked.
 *
 * Every markdown file in the repository except the ones under a skipped
 * directory — discovered rather than listed, because the failure BL-073 is
 * about was a file nobody had added to a list. `docs/32_BACKLOG.md` and
 * `docs/34_DEVELOPMENT_LOG.md` are in scope like everything else; what keeps
 * their descriptions of the bug legal is the `BL-###` beside them, not an
 * exemption.
 */
function markdownFiles(directory: string, root: URL): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const relative = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...markdownFiles(`${relative}/`, root));
      continue;
    }
    if (entry.name.endsWith('.md')) found.push(relative);
  }
  return found;
}

/** Every file in the tree whose basename names the workflow document. */
function workflowDocuments(directory: string, root: URL): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const relative = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...workflowDocuments(`${relative}/`, root));
      continue;
    }
    if (WORKFLOW_FILENAME.test(entry.name)) found.push(relative);
  }
  return found;
}

/**
 * The text a `BL-###` may live in for a reference on line `index`: the run of
 * non-blank lines around it, plus the next such run.
 *
 * Deliberately the same shape as `check-doc-commands.ts`'s `annotationScope`,
 * including that it looks *forward* and not back — a marker in the preceding
 * paragraph would let an unrelated earlier mention excuse a later reference,
 * and a document reads top to bottom. Duplicated rather than shared because
 * these are two standalone scripts with no module between them; if a third
 * wants it, that is when it moves.
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

interface Finding {
  readonly doc: string;
  readonly line: number;
  readonly why: string;
}

const repoRoot = new URL('..', import.meta.url);

function exists(relative: string): boolean {
  try {
    statSync(new URL(relative, repoRoot));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a reference as written against the repository root.
 *
 * References in these documents are written repository-relative
 * (`docs/AI_DEVELOPMENT_WORKFLOW.md`) or bare (`AI_DEVELOPMENT_WORKFLOW.md`,
 * meaning "the workflow document" rather than a path). A bare one is resolved
 * against the canonical location, so prose that names the document without a
 * path is not a finding — the rule is about paths that do not resolve, not
 * about how a sentence refers to a file.
 */
function resolves(reference: string): boolean {
  const trimmed = reference.replace(/^\.\//, '');
  if (!trimmed.includes('/')) return trimmed === CANONICAL.split('/').pop();
  return exists(trimmed);
}

function findingsIn(doc: string): Finding[] {
  const lines = readFileSync(new URL(doc, repoRoot), 'utf8').split('\n');
  const findings: Finding[] = [];

  for (const [index, line] of lines.entries()) {
    const seen = new Set<string>();
    for (const match of line.matchAll(WORKFLOW_REFERENCE)) {
      const reference = match[0];
      if (resolves(reference)) continue;
      // One finding per distinct broken reference per line: a line naming the
      // same wrong path twice has one problem, not two.
      if (seen.has(reference)) continue;
      seen.add(reference);
      if (BACKLOG_ID.test(annotationScope(lines, index))) continue;
      findings.push({
        doc,
        line: index + 1,
        why: `names \`${reference}\`, which does not exist. The workflow document is \`${CANONICAL}\`. If this line is describing the broken path on purpose, name the \`BL-###\` it belongs to beside it`,
      });
    }
  }
  return findings;
}

const documents = workflowDocuments('', repoRoot);
const stray = documents.filter((path) => path !== CANONICAL);
const findings = markdownFiles('', repoRoot).flatMap(findingsIn);

if (stray.length > 0 || !documents.includes(CANONICAL) || findings.length > 0) {
  if (!documents.includes(CANONICAL)) {
    console.error(`${CANONICAL} is missing — it is the one workflow document.`);
  }
  for (const path of stray) {
    console.error(
      `${path}: a second workflow document. There is exactly one, at ${CANONICAL}; ` +
        `delete this or make it a pointer (BL-073 is why this check exists — the last ` +
        `copy silently lost a paragraph the canonical one had gained).`,
    );
  }
  for (const finding of findings) {
    console.error(`${finding.doc}:${finding.line}: ${finding.why}.`);
  }
  process.exit(1);
}

console.log(
  `check-workflow-doc: one workflow document (${CANONICAL}), and every reference to it in ` +
    `${markdownFiles('', repoRoot).length} markdown file(s) resolves.`,
);
