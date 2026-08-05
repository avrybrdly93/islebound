import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config (BL-002).
 *
 * Three jobs, in order of how much they matter:
 *   1. `eslint-plugin-boundaries` encodes the import-direction table from
 *      `docs/04_TECHNICAL_ARCHITECTURE.md` §5. That table is binding, and a
 *      table nobody enforces stops being true within a phase or two.
 *   2. The three project-specific bans: `Math.random` and `new THREE.*` in
 *      per-frame functions (`docs/06_ENGINEERING_STANDARDS.md` §1 and §8), and
 *      `dangerouslySetInnerHTML` (`docs/31_SECURITY_CONSIDERATIONS.md`).
 *   3. `@typescript-eslint` strict-type-checked plus `eslint-plugin-import`,
 *      the general-purpose layer.
 *
 * `tools/check-lint-rules.mjs` lints one fixture per custom rule and asserts
 * each one fires — a rule that silently stops matching looks exactly like
 * clean code, so the rules themselves are tested.
 */

/** Directories from `05_CODEBASE_STRUCTURE.md` §2 that the boundary table governs. */
const CLIENT_SRC = 'packages/client/src';

/** Everything the `04` §5 table names, plus the composition root (see below). */
const ELEMENT_TYPES = [
  'core',
  'sim',
  'render',
  'ui',
  'audio',
  'input',
  'platform',
  'content',
  'dev',
];

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
});

/**
 * The `04` §5 table, verbatim. An element type with no entry here inherits
 * `default: 'disallow'`, so `core` and `content` — the two leaves, which import
 * nothing internal — are expressed by their absence.
 *
 * Types are declared for directories that do not exist yet (`audio`, `input`,
 * `platform`, `dev`). Declaring them now costs nothing and means the first file
 * dropped into `src/audio/` is governed on arrival rather than whenever someone
 * remembers to come back here.
 */
const POLICIES = [
  allow('sim', ['core', 'content']),
  allow('render', ['core', 'sim', 'platform']),
  allow('ui', ['core', 'platform']),
  allow('audio', ['core', 'platform']),
  allow('input', ['core']),
  allow('platform', ['core']),
  allow('dev', ELEMENT_TYPES),
  // The composition root (`main.ts`, later `Game.ts`) wires every subsystem
  // together, which is exactly what `05` §2 says it is for. `04` §5's table
  // does not name it — logged as a documentation gap in `34`, and resolved here
  // the only way that lets the documented architecture wire itself up. It is a
  // *file* category rather than an element: those files sit directly in `src/`
  // and belong to no layer.
  {
    from: { file: { categories: 'composition-root' } },
    allow: { to: { element: { types: { anyOf: ELEMENT_TYPES } } } },
  },

  // The table governs *internal* direction. Third-party packages are a separate
  // question, so allow them by default and then carve out the one prohibition
  // §5 states outright.
  { allow: { to: { module: { origin: 'external' } } } },
  {
    from: { element: { type: 'sim' } },
    disallow: {
      to: { module: { origin: 'external', source: ['three', 'three/*', 'react', 'react-*'] } },
    },
    message:
      'sim/ stays pure (04 §5, 06 §1): no three, no React. Presentation reads sim state; it never lives inside it.',
  },
];

/**
 * `new THREE.*` is banned inside per-frame functions (`06` §8). The four
 * selectors cover the four ways such a function gets its name: a function
 * declaration, a `const update = () => {}`, a class method, and an object
 * literal method.
 *
 * Scope note: this matches the namespace form the docs use throughout
 * (`new THREE.Vector3()`, see `08` §4 and §6). A named import (`import
 * { Vector3 } from 'three'; new Vector3()`) is not caught —
 * `no-restricted-syntax` matches syntax, and cannot tell where an identifier
 * came from. Filed as BL-045.
 */
// Exported so `tools/check-lint-rules.mjs` tests these exact definitions
// rather than a copy that can drift away from them.
const PER_FRAME_FN = String.raw`[id.name=/^(update|sync|step)/]`;
const PER_FRAME_KEY = String.raw`[key.name=/^(update|sync|step)/]`;
const NEW_THREE = `NewExpression[callee.object.name='THREE']`;
const THREE_IN_PER_FRAME_MESSAGE =
  'No allocation in per-frame paths (06 §8): hoist this THREE object to module scope or take it from a pool.';
const DANGEROUS_HTML_MESSAGE =
  'dangerouslySetInnerHTML is banned (31 §3): render text as text, not as markup.';

export const RESTRICTED_SYNTAX = [
  {
    selector: `MemberExpression[object.name='Math'][property.name='random']`,
    message:
      'Math.random breaks determinism (06 §1). Use rngFor(purpose, ...) so the same seed replays the same world.',
  },
  {
    selector: `JSXAttribute[name.name='dangerouslySetInnerHTML']`,
    message: DANGEROUS_HTML_MESSAGE,
  },
  {
    // The same escape hatch spelled as an object property — props built up
    // before the JSX, or spread in from elsewhere.
    selector: `Property[key.name='dangerouslySetInnerHTML']`,
    message: DANGEROUS_HTML_MESSAGE,
  },
  {
    selector: `FunctionDeclaration${PER_FRAME_FN} ${NEW_THREE}`,
    message: THREE_IN_PER_FRAME_MESSAGE,
  },
  {
    selector: `VariableDeclarator${PER_FRAME_FN} ${NEW_THREE}`,
    message: THREE_IN_PER_FRAME_MESSAGE,
  },
  {
    selector: `MethodDefinition${PER_FRAME_KEY} ${NEW_THREE}`,
    message: THREE_IN_PER_FRAME_MESSAGE,
  },
  {
    selector: `Property${PER_FRAME_KEY} ${NEW_THREE}`,
    message: THREE_IN_PER_FRAME_MESSAGE,
  },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'tools/lint-fixtures/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { boundaries },
    settings: {
      // Both eslint-plugin-import and eslint-plugin-boundaries resolve module
      // specifiers through this. Without it the `@core/*`-style aliases from
      // `tsconfig.base.json` resolve to nothing, dependencies are unclassified,
      // and the boundary rule below silently passes everything — verified: a
      // sim -> render import went unreported until this was added.
      'import/resolver': {
        typescript: { project: ['tsconfig.base.json'] },
      },
      'boundaries/elements': [
        { type: 'core', pattern: `${CLIENT_SRC}/core` },
        { type: 'sim', pattern: `${CLIENT_SRC}/sim` },
        { type: 'render', pattern: `${CLIENT_SRC}/render` },
        { type: 'ui', pattern: `${CLIENT_SRC}/ui` },
        { type: 'audio', pattern: `${CLIENT_SRC}/audio` },
        { type: 'input', pattern: `${CLIENT_SRC}/input` },
        { type: 'platform', pattern: `${CLIENT_SRC}/platform` },
        { type: 'dev', pattern: `${CLIENT_SRC}/dev` },
        { type: 'content', pattern: 'packages/shared/src/content' },
      ],
      // `main.ts`/`Game.ts` sit directly in `src/`, inside no layer.
      'boundaries/files': [{ category: 'composition-root', pattern: `${CLIENT_SRC}/*.ts` }],
      // Only source files are classified; configs and build scripts sit outside
      // the architecture and would otherwise trip `no-unknown-files`.
      'boundaries/include': ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: POLICIES }],
      // A file under `packages/*/src` matching no element type is a file the
      // boundary table does not govern — which is how enforcement quietly
      // erodes. Fail instead, so adding a directory means deciding where it
      // sits in the table.
      'boundaries/no-unknown-files': 'error',
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
      // TypeScript resolves modules itself, including the `@core/*`-style
      // aliases from `tsconfig.base.json`; a second resolver duplicating that
      // only adds a way for the two to disagree.
      'import/no-unresolved': 'off',
    },
  },

  {
    // Build and tooling files: node scripts and configs, not game code, so
    // neither the boundary table nor the type-aware rules apply to them.
    files: ['*.js', '*.mjs', 'tools/**/*.mjs', 'packages/*/vite.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: {
      // Node and TypeScript both resolve these imports; the plugin's own
      // resolver would need a third configuration to agree with them.
      'import/no-unresolved': 'off',
    },
  },

  // Must come last: turns off every stylistic rule Prettier owns.
  prettierConfig,
);
