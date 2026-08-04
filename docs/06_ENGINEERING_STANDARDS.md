# 06 — Engineering Standards

Purpose: the rules that keep a codebase written largely by AI agents coherent over months. These are enforceable; where possible they are enforced by tooling rather than by review.

---

## 1. The five non-negotiables

1. **`sim/` stays pure.** No `three`, no DOM, no `Math.random`, no `Date.now`. Enforced by lint + CI grep.
2. **Types are never `any`.** `unknown` + narrowing instead. `@ts-expect-error` requires a comment explaining why and a backlog ID.
3. **No feature merges without a test.** Pure logic → unit test. Systemic → sim-harness test. Visual → Playwright smoke test that at minimum proves it doesn't crash.
4. **No new runtime dependency without human approval.** See `04_TECHNICAL_ARCHITECTURE.md` §3.
5. **Every change updates the docs it invalidates.** A PR that changes behaviour without touching docs is incomplete.

## 2. Code style

- Prettier, defaults except: `printWidth: 100`, `singleQuote: true`, `semi: true`, `trailingComma: 'all'`.
- ESLint flat config with `@typescript-eslint` strict-type-checked, `eslint-plugin-boundaries`, `eslint-plugin-import`, `eslint-plugin-react-hooks`.
- Prefer `const`. `let` only when reassignment is real. `var` never.
- Prefer early return over nested conditionals. Maximum nesting depth 3.
- Prefer plain functions over classes. Use a class when there is genuine per-instance state and lifecycle (e.g. `ChunkMesher`, `AudioEngine`). Never use a class as a namespace.
- No default exports except React components and Vite-required entry points.
- Named arguments (an options object) for any function with more than three parameters.

## 3. Comments and documentation in code

- Comment **why**, never **what**. `// clamp to avoid the spiral of death after tab switch` — good. `// increment i` — delete.
- Every system file begins with a 5–15 line header block: what it owns, what it reads, what it writes, what events it emits, and its position in the tick order.
- Every non-obvious constant gets a source: `// 9.81 m/s² — real gravity feels floaty at our scale; we use 18 (see DECISION_LOG 0007)`.
- Public functions in `core/` and `sim/` get TSDoc. Internal helpers do not need it.

## 4. Error handling

- Fallible operations return `Result<T, E>` from `core/Result.ts` rather than throwing, in `sim/` and `platform/`.
- Throw only for programmer errors (invariant violations). Those should crash loudly in dev.
- Every `catch` either handles meaningfully or re-throws with context. Never `catch {}`.
- Asset load failures degrade: a missing model renders as the magenta placeholder cube and logs once; the game continues.

## 5. Automated enforcement (CI gates)

| Gate | Tool | Failure = |
|---|---|---|
| Typecheck | `tsc --noEmit` | block |
| Lint | `eslint .` | block |
| Format | `prettier --check` | block |
| Purity of `sim/` | custom script `tools/check-sim-purity.ts` | block |
| Import cycles | `madge --circular` | block |
| Unit + integration tests | `vitest run --coverage` | block |
| Determinism | `pnpm sim --ticks 20000 --assert-hash` | block |
| Bundle budget | `tools/check-bundle-size.ts` (see below) | block |
| E2E smoke | `playwright test --project=chromium` | block |
| Frame budget | `pnpm bench` on a fixed scene, ±15% vs baseline | warn, then block after Phase 6 |

**Bundle budgets:** initial JS ≤ 600 kB gz, initial total transfer ≤ 15 MB, any lazy region pack ≤ 8 MB.

## 6. Git conventions

- Branches: `phase-N/short-description`, e.g. `phase-2/hold-to-gather`.
- Conventional commits: `feat(inventory): add stack splitting`, `fix(terrain): seam at chunk boundary`, `docs(17): clarify snapping rules`, `chore`, `refactor`, `test`, `perf`.
- **One task per commit** where possible; always one task per PR.
- Commit body must reference the backlog ID: `Closes BL-217.`
- Never force-push to `main`. Never commit generated assets without regenerating them from `assets-src/`.
- Tag phase completions: `phase-3-complete`.

## 7. Pull request checklist (agents must include this in the PR body)

```
- [ ] Read: 04, 05, 06, and the system doc(s) for the area touched
- [ ] Exactly one backlog task addressed: BL-___
- [ ] Tests added/updated and passing locally
- [ ] `pnpm sim --ticks 20000 --assert-hash` passes (or hash intentionally rebaselined, with reason)
- [ ] No new runtime dependencies (or approval linked)
- [ ] Docs updated: which files, what changed
- [ ] DEVELOPMENT_LOG.md entry added
- [ ] CURRENT_TASK.md updated
- [ ] Multiplayer-safe checklist (04 §10) reviewed
- [ ] Screenshots/GIF for anything visual
```

## 8. Performance discipline

- No allocation in per-frame code paths. Use module-scope scratch objects and pools. Lint rule flags `new THREE.Vector3()` inside functions named `update*`/`sync*`/`step*`.
- Prefer flat typed arrays over arrays of objects for anything above ~1,000 elements.
- Never `JSON.parse`/`stringify` in a frame. Serialisation happens in a worker on autosave.
- Measure before optimising: attach a `performance.mark`-based profile in `dev/` and record numbers in the PR.

## 9. Accessibility baseline (enforced from Phase 6, designed from Phase 1)

- All UI reachable by keyboard; visible focus rings; correct roles and labels.
- No information conveyed by colour alone.
- Text minimum 16 px equivalent, with a UI scale setting 80–150%.
- Motion reduction setting disables camera shake, head bob, and screen-space weather.
- Subtitles/captions for any non-ambient audio cue that carries information.
- Full remapping of controls, including modifier-free alternatives.

## 10. Security and privacy baseline

- No third-party analytics. No cookies beyond a settings blob in localStorage.
- Never `eval`, never `innerHTML` with non-constant strings, strict CSP in production.
- Server (Phase 7) treats every client message as hostile — see `31_SECURITY_CONSIDERATIONS.md`.

## 11. Working agreement for AI agents

- Read before writing. If a document contradicts the code, trust the document and flag the discrepancy.
- Prefer the smallest change that completes the task. Do not opportunistically refactor adjacent code; file a backlog item instead.
- If a task turns out to require an architecture change, **stop**, write the finding in `33_CURRENT_TASK.md` under "Blocked", and pick a different task.
- Never delete or rewrite tests to make them pass.
- Never mark a task done without running the test suite.
- When uncertain between two reasonable implementations, choose the one with fewer moving parts and note the alternative in `40_DECISION_LOG.md`.
