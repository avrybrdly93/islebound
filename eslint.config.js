// ESLint flat config — the machine-readable half of 06_ENGINEERING_STANDARDS.md
// and 04_TECHNICAL_ARCHITECTURE.md §5.
//
// What this file owns:
//   - typescript-eslint strict-type-checked, type-aware, across both packages
//   - the import-direction table from 04 §5, encoded in eslint-plugin-boundaries
//   - the sim/ purity rule from 04 §5 ("no file under src/sim/ may import three,
//     document, window, or Math.random")
//   - the three custom bans BL-002 names: Math.random anywhere,
//     dangerouslySetInnerHTML anywhere, and `new THREE.*` inside
//     update*/sync*/step* functions
//
// Every custom ban below has a deliberately-violating fixture under
// tools/lint-fixtures/ and is checked by tools/check-lint-rules.mjs, so a rule
// that silently stops matching fails the build rather than passing quietly.

import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * 04 §5's allowed import directions, verbatim. `dev` is absent from the source
 * tree today (no packages/client/src/dev yet) but is listed so the row exists
 * the day it lands rather than being rediscovered then.
 */
const ALLOWED_IMPORTS = [
  { from: 'core', allow: [] },
  { from: 'sim', allow: ['core', 'content'] },
  { from: 'render', allow: ['core', 'sim', 'platform'] },
  { from: 'ui', allow: ['core', 'platform'] },
  { from: 'audio', allow: ['core', 'platform'] },
  { from: 'input', allow: ['core'] },
  { from: 'platform', allow: ['core'] },
  { from: 'content', allow: [] },
  { from: 'dev', allow: ['core', 'sim', 'render', 'ui', 'audio', 'input', 'platform', 'content'] },
];

/**
 * `new THREE.Anything()` inside a function whose name starts with update/sync/step.
 * Per-frame allocation is the thing being banned (28_PERFORMANCE_OPTIMIZATION.md);
 * the function-name prefix is the convention 06 uses to mark per-frame entry
 * points. Covers declarations, function expressions and arrow functions assigned
 * to such a name, and methods/properties with such a name.
 */
const NEW_THREE_IN_FRAME_FN = [
  'FunctionDeclaration[id.name=/^(update|sync|step)/]',
  'VariableDeclarator[id.name=/^(update|sync|step)/]',
  'MethodDefinition[key.name=/^(update|sync|step)/]',
  'Property[key.name=/^(update|sync|step)/]',
]
  .map((ancestor) => `${ancestor} NewExpression[callee.object.name='THREE']`)
  .join(', ');

const CUSTOM_BANS = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message:
      'Math.random is banned project-wide: simulation must be deterministic (04 §1). Use rngFor(purpose, ...) from core/rng.',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
      'dangerouslySetInnerHTML is banned (31_SECURITY_CONSIDERATIONS.md). Render text as children; sanitise upstream if markup is genuinely required.',
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message:
      'dangerouslySetInnerHTML is banned (31_SECURITY_CONSIDERATIONS.md). Render text as children; sanitise upstream if markup is genuinely required.',
  },
  {
    selector: NEW_THREE_IN_FRAME_FN,
    message:
      'No three.js allocation inside an update*/sync*/step* function — these run every frame (28_PERFORMANCE_OPTIMIZATION.md). Hoist the object to module or instance scope and mutate it in place.',
  },
];

export default tseslint.config(
  {
    // Fixtures are violating code on purpose; tools/check-lint-rules.mjs lints
    // them explicitly with ESLint's `warnIgnored: false`/direct file list, so
    // ignoring them here keeps `pnpm lint` green without weakening anything.
    ignores: ['**/dist/**', '**/node_modules/**', 'tools/lint-fixtures/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.es2023 },
    },
    plugins: {
      boundaries,
      import: importPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      'boundaries/elements': [
        { type: 'core', pattern: 'packages/client/src/core' },
        { type: 'sim', pattern: 'packages/client/src/sim' },
        { type: 'render', pattern: 'packages/client/src/render' },
        { type: 'ui', pattern: 'packages/client/src/ui' },
        { type: 'audio', pattern: 'packages/client/src/audio' },
        { type: 'input', pattern: 'packages/client/src/input' },
        { type: 'platform', pattern: 'packages/client/src/platform' },
        { type: 'dev', pattern: 'packages/client/src/dev' },
        { type: 'content', pattern: 'packages/shared/src/content' },
      ],
      'boundaries/include': ['packages/**/*.ts', 'packages/**/*.tsx'],
      // Both eslint-plugin-boundaries and eslint-plugin-import need to resolve
      // an import specifier to a real file before they can classify it. Without
      // a resolver that understands extensionless TypeScript imports AND the
      // `@core/*`-style aliases from tsconfig.base.json, every dependency looks
      // "unknown" and boundaries/dependencies silently never fires -- which is
      // exactly the failure tools/check-lint-rules.mjs exists to catch, and did.
      'import/resolver': {
        typescript: {
          project: ['tsconfig.base.json', 'packages/*/tsconfig.json'],
          // Two package tsconfigs is the intended shape here (05 §1-2), not a
          // mistake to warn about on every run.
          noWarnOnMultipleProjects: true,
        },
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
      },
    },
    rules: {
      // 04 §5's table. `default: 'disallow'` means a direction that is not
      // listed is forbidden, so adding a module without adding its row fails
      // rather than silently permitting everything. `core` and `content` get
      // no policy at all -- they are allowed to import nothing, which the
      // default already says.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: ALLOWED_IMPORTS.filter(({ allow }) => allow.length > 0).map(
            ({ from, allow }) => ({
              from: { element: { type: from } },
              allow: { to: { element: { types: { anyOf: allow } } } },
            }),
          ),
        },
      ],

      'import/no-duplicates': 'error',
      'import/no-self-import': 'error',
      'import/order': ['error', { 'newlines-between': 'never' }],

      'no-restricted-syntax': ['error', ...CUSTOM_BANS],

      // 06 §2, the parts a linter can hold: const over let, no var, nesting
      // depth 3, no default exports outside React components and Vite entry
      // points (those get a local override where they appear).
      'prefer-const': 'error',
      'no-var': 'error',
      'max-depth': ['error', 3],
    },
  },

  {
    // Config and tooling files are JS, outside the app's tsconfig, so the
    // type-aware rules have no program to consult. Turning them off here is
    // what typescript-eslint prescribes for exactly this case -- it is not a
    // relaxation of the rules for any source file.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['**/*.tsx'],
    rules: reactHooks.configs.recommended.rules,
  },

  {
    // 04 §5's hard rule, stated there as its own sentence: "no file under
    // src/sim/ may import three, document, window, or Math.random". Math.random
    // is already banned everywhere above; the rest is scoped here.
    files: ['packages/client/src/sim/**/*.ts', 'packages/client/src/sim/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'sim/ is headless: no three.js (04 §1, §5).' },
            { name: 'react', message: 'sim/ is headless: no React (04 §5).' },
            {
              name: '@dimforge/rapier3d-compat',
              message:
                'sim/ owns the world state; physics is driven from the tick, not imported ad hoc (04 §5).',
            },
          ],
          patterns: [
            { group: ['three/*'], message: 'sim/ is headless: no three.js (04 §1, §5).' },
            {
              group: ['@render/*', '@ui/*'],
              message: 'sim/ may import core and content only (04 §5).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'sim/ is headless: no DOM (04 §1, §5).' },
        { name: 'window', message: 'sim/ is headless: no DOM (04 §1, §5).' },
        {
          name: 'performance',
          message: 'sim/ measures ticks, never wall-clock (CLAUDE.md, 04 §4).',
        },
      ],
    },
  },

  {
    // Config files and Node-side tooling: not part of the app's type graph, and
    // they legitimately run outside the browser.
    files: ['*.config.js', '*.config.ts', 'packages/*/vite.config.ts', 'tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Last: turns off every stylistic rule Prettier owns, so the two never
  // disagree about formatting (06 §2 makes Prettier the authority).
  prettierConfig,
);
