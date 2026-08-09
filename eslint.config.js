// Flat ESLint config for Halcyon Isle. Refs BL-002.
//
// Owns: the lint half of `06_ENGINEERING_STANDARDS.md` §5's CI gate table.
// Encodes: `04_TECHNICAL_ARCHITECTURE.md` §5 (module boundaries, binding),
//          `05_CODEBASE_STRUCTURE.md` §8 (import rules),
//          `06_ENGINEERING_STANDARDS.md` §1–2 (non-negotiables, code style).
//
// Three things this file deliberately does NOT do, so their absence reads as a
// decision rather than an oversight:
//
//  * It does not format. Prettier owns formatting (`.prettierrc.json`), and
//    `eslint-config-prettier` is applied last to switch off every ESLint rule
//    that would disagree with it.
//  * It does not enforce `sim/` purity on its own. The boundaries rules below
//    stop `sim/` importing `three`/`render`/`ui`, but `06` §5 lists a separate
//    `tools/check-sim-purity.ts` gate for the rest (DOM globals, `Date.now`),
//    and that script is its own backlog item.
//  * It does not load `eslint-plugin-react-hooks`, which `06` §2 lists. There
//    is no React in the tree yet (BL-003 adds it) and BL-002's acceptance
//    criteria do not name it. Filed as BL-045.

import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * The layers of `04` §5, matched by path. `type` is the boundary element name
 * used by the dependency rules below.
 *
 * The pattern list is longer than `04` §5's tree because two of its layers do
 * not live under `packages/client/src/`: `content/` is in `packages/shared`
 * (it is shared with the future server), and that is what the `@content/*`
 * alias points at. Everything else is one directory per layer.
 */
const LAYERS = [
  { type: 'core', pattern: 'packages/client/src/core/**' },
  { type: 'sim', pattern: 'packages/client/src/sim/**' },
  { type: 'render', pattern: 'packages/client/src/render/**' },
  { type: 'ui', pattern: 'packages/client/src/ui/**' },
  { type: 'audio', pattern: 'packages/client/src/audio/**' },
  { type: 'input', pattern: 'packages/client/src/input/**' },
  { type: 'platform', pattern: 'packages/client/src/platform/**' },
  { type: 'dev', pattern: 'packages/client/src/dev/**' },
  { type: 'content', pattern: 'packages/shared/src/content/**' },
];

/**
 * `04` §5's allowed-import table, transcribed. Any pair not listed here is a
 * lint error, which is the point: the table is binding and adding to it needs
 * human approval (`35` §4.4).
 *
 * `render` and `ui` are allowed to import `sim` for *types only* — `04` §5
 * says "sim exposing types to render/ui is allowed; render/ui calling mutating
 * sim functions is not". A boundaries rule cannot tell a type import from a
 * value import, so the type-only half is carried by
 * `@typescript-eslint/consistent-type-imports` plus review; the boundary rule
 * here only opens the door, it does not police what walks through it. Noted
 * rather than silently approximated.
 */
const ALLOWED_IMPORTS = [
  { from: 'core', allow: [] },
  { from: 'sim', allow: ['core', 'content'] },
  { from: 'render', allow: ['core', 'sim', 'platform'] },
  { from: 'ui', allow: ['core', 'platform', 'sim'] },
  { from: 'audio', allow: ['core', 'platform'] },
  { from: 'input', allow: ['core'] },
  { from: 'platform', allow: ['core'] },
  { from: 'content', allow: [] },
  { from: 'dev', allow: LAYERS.map((layer) => layer.type) },
];

/**
 * npm packages `sim/` may not import, from `04` §5's "sim MAY NOT import:
 * three, react, DOM". The layer table above only governs first-party imports;
 * without this, `sim/` importing three.js directly would sail through.
 */
const PACKAGES_BANNED_FROM_SIM = ['three', 'react', 'react-dom'];

/**
 * The three custom bans BL-002 names, as `no-restricted-syntax` selectors.
 *
 * Selectors rather than a bespoke ESLint plugin: a plugin would be a package,
 * a build step and a test harness of its own, and these three rules are each
 * one AST shape. Fewer moving parts wins (`35` §5).
 */
const RESTRICTED_SYNTAX = [
  {
    // Determinism. Every random draw in the simulation must come from a named
    // seeded stream so a replay reproduces it exactly (`04`, and `35` §4.5 for
    // sim/ specifically). Banned everywhere, not only in sim/: presentation
    // randomness that is not reproducible makes a bug report unreproducible
    // too, and a later layer that genuinely needs it can add a scoped override
    // with a comment saying why.
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'Math.random is banned — use rngFor(purpose, ...) so runs stay deterministic.',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned — render text as children instead.',
  },
  {
    // The same prop written as an object property, which is how it reaches
    // React through a spread or a createElement call. Without this the ban is
    // one refactor away from being bypassed by accident.
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned — render text as children instead.',
  },
  ...perFrameAllocationSelectors(),
];

/**
 * `new THREE.*` inside a function whose name starts with `update`, `sync` or
 * `step` — the per-frame paths `CLAUDE.md`'s performance contract forbids
 * allocating in. Scratch objects belong at module scope.
 *
 * One selector per way of naming a function, because ESLint selectors match
 * node shapes and a function's name lives on a different node in each case.
 * The descendant combinator means a `new THREE.Vector3()` nested arbitrarily
 * deep inside the function body still matches, which is the case that matters:
 * the allocation is usually inside a loop, not at the top of the function.
 *
 * Known gap, stated rather than hidden: this matches the `THREE.Vector3` form,
 * not `import { Vector3 } from 'three'` followed by `new Vector3()`. BL-002
 * specifies `new THREE.*`; widening it to named imports needs a list of
 * three.js constructors or type information, and is filed as BL-046.
 */
function perFrameAllocationSelectors() {
  const NEW_THREE = "NewExpression[callee.object.name='THREE']";
  const NAME = '/^(update|sync|step)/';
  const message =
    'No allocation in per-frame paths — hoist the THREE object to module scope as a scratch value.';
  return [
    `FunctionDeclaration[id.name=${NAME}] ${NEW_THREE}`,
    `VariableDeclarator[id.name=${NAME}] ${NEW_THREE}`,
    `MethodDefinition[key.name=${NAME}] ${NEW_THREE}`,
    `PropertyDefinition[key.name=${NAME}] ${NEW_THREE}`,
    `Property[key.name=${NAME}] ${NEW_THREE}`,
  ].map((selector) => ({ selector, message }));
}

export default tseslint.config(
  {
    // Fixtures are deliberate violations; linting them would fail the build
    // that `tools/check-lint-rules.ts` exists to prove is working.
    ignores: ['**/dist/**', '**/node_modules/**', 'tools/lint-fixtures/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries, import: importPlugin },
    settings: {
      'boundaries/elements': LAYERS.map(({ type, pattern }) => ({
        type,
        pattern,
        // The pattern is a full path glob ending in `/**`, so it must be
        // matched against the whole file path rather than the folder.
        partialMatch: false,
      })),
      'boundaries/include': ['packages/**/*.ts', 'packages/**/*.tsx'],
      // Without a resolver that understands `@core/*` and the `.js`-extension
      // ESM convention, boundaries cannot resolve a dependency to a file, and
      // an unresolvable dependency is silently *not* checked -- the rule
      // becomes decorative. Verified the hard way: the first version of this
      // config had no resolver and a deliberate core -> sim import passed.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          // The aliases live in tsconfig.base.json, which the package configs
          // extend; there is no root tsconfig.json for the resolver to find
          // on its own.
          project: ['packages/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      // 06 §1.2: types are never `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // 05 §8.3: type-only imports are explicit so bundling stays clean.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // 06 §2: no default exports except React components and Vite entry
      // points, which get a scoped override below.
      'import/no-default-export': 'error',
      // `05` §8.2's no-import-cycles rule is NOT enforced here on purpose:
      // `import/no-cycle` needs a resolver that understands the `@core/*`
      // aliases, which means another dependency, and `06` §5 already names
      // `madge --circular` as the CI gate for cycles. One gate, not two.
      // 06 §2: prefer const; `var` never.
      'no-var': 'error',
      'prefer-const': 'error',
      // 06 §2: maximum nesting depth 3.
      'max-depth': ['error', 3],
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
      // 04 §5, binding. Default-deny: a pair not in the table is an error,
      // which is what makes the table the single source of truth rather than
      // a description of what happened to be written.
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
      // The layer table above governs first-party imports only. `04` §5's
      // "sim MAY NOT import: three, react, DOM" is about npm packages, and
      // `boundaries/dependencies` does not look at external modules.
      //
      // `boundaries/external` is deprecated in favour of expressing this as a
      // `boundaries/dependencies` policy, and that migration was attempted
      // first: with `checkAllOrigins: true` and a
      // `disallow: { to: { module: { source } } }` policy, a deliberate
      // `import * as THREE` inside `sim/` was **not** reported. Rather than
      // ship a rule that looks right and enforces nothing, this stays on the
      // deprecated-but-working rule. Filed as BL-047.
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'sim' } },
              disallow: PACKAGES_BANNED_FROM_SIM,
              message:
                'sim/ is pure and headless — no {{dependency.source}} (04_TECHNICAL_ARCHITECTURE §5).',
            },
          ],
        },
      ],
    },
  },

  {
    // Vite requires a default export from its config, and `05` §6 puts React
    // components in `ui/` — both are the documented exceptions in `06` §2.
    files: ['**/vite.config.ts', '**/*.tsx', 'eslint.config.js'],
    rules: { 'import/no-default-export': 'off' },
  },

  {
    // Config and tooling files are Node scripts outside the layer graph.
    files: ['*.js', '*.mjs', 'tools/**/*.ts', '**/vite.config.ts'],
    rules: { 'boundaries/dependencies': 'off', 'boundaries/external': 'off' },
  },

  {
    // `eslint.config.js`, the `tools/` scripts and the lint fixtures are not
    // members of any TypeScript project, so the type-aware rules have nothing
    // to work from. Turning them off here is what typescript-eslint documents
    // for exactly this case; the alternative is inventing a tsconfig for a
    // handful of files that are never bundled. The syntactic rules -- which
    // is all of the custom ones -- are unaffected, so the fixtures still
    // prove what they are there to prove.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', 'tools/**/*.ts', 'tools/**/*.tsx'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // Test files, until BL-015 replaces `node:test` with Vitest.
    //
    // `node:test`'s `describe`/`it` return a promise; Vitest's return void.
    // Every suite declaration in a `node:test` file is therefore a floating
    // promise as far as the type-aware rule is concerned — around 230 of them
    // across the first suites, none of them a defect, and `void describe(...)`
    // at every call site would be noise that has to be undone later. The rule
    // is off for test files only, and only until the runner changes; BL-015
    // should delete this block along with `tools/aliasResolver.mjs`.
    //
    // `restrict-template-expressions` goes with it for the same span: an
    // assertion message that interpolates a measured number
    // (`${bytesPerOp.toFixed(2)}`) is the whole point of the message.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // Last, so it wins: switch off everything Prettier owns.
  prettier,
);
