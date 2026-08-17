# 34 — Development Log

Append-only. Newest entries at the top. Every completed task gets an entry; every phase gets a retro; every significant discovery gets a note even if no task was completed.

This log exists so that a fresh agent — or the same human six months later — can reconstruct *why* the codebase looks the way it does without reading a year of diffs.

---

## Entry format

```markdown
## YYYY-MM-DD — BL-### Short title

**Type:** feature | fix | refactor | docs | perf | chore | retro | note
**Phase:** N
**PR:** #123
**Time:** ~Xh

### What changed
Two to five sentences, in plain language.

### Why it was done this way
The reasoning behind non-obvious choices. This is the most valuable part of the entry.

### Surprises
Anything that did not go as the docs predicted. **Always fill this in when it applies** — it is how the documentation improves.

### Tests
What was added, and what it protects.

### Follow-ups
- BL-### — created for discovered work
```

---

## 2026-08-18 — BL-007 ECS-lite part 1: the entity allocator

**Type:** feat
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~2h

### The split, and why it happened before any code

BL-007 was size **L**, and the previous session's handoff said as much: "the
first task in this project that is not comfortably one session. Consider
splitting it in `32` before starting." `AI_DEVELOPMENT_WORKFLOW.md` §3 and `35`
§3 both permit exactly that.

The seam was not invented for the occasion. `05_CODEBASE_STRUCTURE.md` §1
already lists `sim/ecs/` as **"EntityAllocator, ComponentStore, Query"** —
three files — and BL-007's four acceptance criteria fall onto them cleanly:

| slice | id | carries |
|---|---|---|
| entity allocator | **BL-007** | generation-bit aliasing; ascending order of live entities |
| component stores | BL-058 | `structuredClone` round-trip; ascending `entities()` |
| cached queries | BL-059 | the 10,000 x 6 ≤ 0.15 ms budget; ascending query results |

**No criterion was dropped.** The performance one moved to BL-059 because
queries are the code it measures — an allocator that iterates in 0.15 ms is not
what `04` §2's budget is about. BL-008 and BL-014 both listed `BL-007` as a
dependency from when that id meant all three slices, so both were repointed to
**BL-059**.

### What changed

`packages/client/src/sim/ecs/EntityAllocator.ts` (251 lines) and its test
(217). Nothing else in the tree was touched.

A handle is a single unsigned 32-bit number: **20 index bits, 12 generation
bits**. `04` §4.3 pins `type EntityId = number` in one line and everything else
follows from taking it literally — the handle survives `structuredClone`,
mixes through `core/math/hash.ts` unchanged, and can sit in a component as a
reference to another entity without introducing an object graph.

32 bits rather than the 2⁵³ float range so the handle stays inside the int32
world `hash.ts` and `Rng.ts` already occupy. The 20/12 split trades max-live
(1,048,576) against reuses-per-index (4,095); it does **not** change the total
handles the space can issue, which is 2³² either way. Both halves sit far above
anything the docs budget for — `04` §2 measures at 3,000 entities, BL-059's
criterion is stated at 10,000.

### The two decisions worth reading

**Generations start at 1.** Without that floor, index 0's first entity *is* the
number `0`, and every `if (entity)` written anywhere in the codebase from now
on would quietly mean "every entity except the first one". That is a bug class,
not a style preference, and it is the reason `NULL_ENTITY` can be `0`.

**A spent index is retired, not wrapped.** Rolling generation 4095 back to 1
re-issues a handle that was already live — aliasing, which is precisely what
the generation bits exist to prevent, arriving quietly after a few thousand
reuses. Retiring costs one index out of a million and cannot produce a wrong
answer. The allocator throws only when the *index* space is genuinely spent,
which is the one unrecoverable state.

`destroy()` on a stale or already-dead handle **returns `false` rather than
throwing**: two systems reacting to the same event in one tick is a normal
shape under `04` §4.4's intent/event design, not an error, and a caller that
wants it to be one can check the return.

### Tests

13 cases, suite **253 pass / 0 fail / 0 todo** (was 240).

The aliasing criterion is the one that needed care. "Recycled ids never alias"
is a claim about a *set*, so the sweep runs the full 1,000,000 create/destroy
cycles and checks each handle against **every handle issued so far** — a
wrapping generation counter passes a check against the immediate predecessor
4,094 times out of every 4,095.

Perturbation table — every one caught:

| perturbation | suites red |
|---|---|
| wrap the generation instead of retiring the index | 2 |
| drop the `>>> 0` from `pack()` | 1 |
| start generations at 0 | 5 |
| `isLive` ignores the generation | 1 |
| iterate descending instead of ascending index | 1 |

The `>>> 0` one is worth naming: generations from 2048 up set bit 31, and
JavaScript's bitwise operators yield *signed* int32, so without the shift a
handle comes back **negative** — it still behaves in most code and hashes
differently, which is the worst available failure shape.

### Surprises

- **`06`'s ban on non-null assertions collides head-on with
  `noUncheckedIndexedAccess`.** Every read of a parallel array is
  `number | undefined`, and `@typescript-eslint/no-non-null-assertion` is an
  error, so the natural `this.generations[i]!` is not available. Existing sim
  code (`PoissonDisk.ts`) reaches for `?? 0` at each site. Here that would be
  five silent fallbacks, so it is one guarded accessor instead — and `0` is not
  an arbitrary default: generations start at 1, so `0` already means "no such
  entity" everywhere in the file. Neither doc is wrong; the interaction is just
  not written down anywhere, and the next `sim/` module will hit it too.
- **`@typescript-eslint/restrict-template-expressions` is off for `*.test.ts`
  only.** An error message interpolating a number needs an explicit `String()`
  in source but not in a test, which reads as an inconsistency until you find
  the `files:` block in `eslint.config.js` that scopes it.

### Documentation notes (type: `note`)

- `AI_DEVELOPMENT_WORKFLOW.md` §6 and `CLAUDE.md` both give the verify block as
  `pnpm lint && pnpm typecheck && pnpm test`, then `pnpm sim --ticks 20000
  --assert-hash`, then `pnpm build && pnpm check:bundle`. **`pnpm test`,
  `pnpm sim` and `pnpm check:bundle` still do not exist** (BL-015, BL-014, and
  the bundle gate). What ran this session: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:node` (253 pass), `pnpm format:check`, `pnpm build` (client bundle
  143.72 kB, **46.33 kB gzipped**, against `04`'s 600 kB gz budget). Same gap
  the BL-002 and BL-006 entries recorded; stated again rather than skipped
  silently, and it will keep being stated until BL-014/BL-015 land.
- `tools/check-sim-purity.ts` is still referenced in the present tense by
  `CLAUDE.md` and `06` and still does not exist (BL-017). This module would
  pass it — no clock, no DOM, no `Math.random`, no module-level mutable state —
  but that is inspection, not enforcement.

### Follow-ups

BL-058 and BL-059, the other two slices, both now in Ready directly below where
BL-007 was. No new discovered work.

---

## 2026-08-16 — BL-006 Typed event bus

**Type:** feature
**Phase:** 0
**PR:** — (pushed direct to `main`)

### What changed
`packages/client/src/core/EventBus.ts` and its test sibling. A pub/sub generic
over an event map, with an immediate mode (`emit`) and the queued mode `04`
§4.4 asks for (`enqueue` + `drain`), plus `once`, `handlerCount`,
`queuedCount` and `clear`. 28 new tests; suite **240 pass / 0 fail / 0 todo**,
up from 212. `pnpm lint`, `lint:rules`, `typecheck`, `format:check`, `build`
and `test:node` all green, and the suite was run five more times to check the
allocation cases are stable.

### Why it was done this way

**Zero-subscriber emit is a failed `Map` lookup and nothing else.** A type
with no handlers is *absent* from the map rather than present with an empty
array, and the array is deleted again when its last handler unsubscribes — so
the fast path survives a subscribe/unsubscribe cycle rather than degrading to
a hit on a permanently empty list. No iterator (`for...of` over a `Map`
allocates a result object per step), no closure, and the payload is passed
straight through rather than wrapped in an envelope.

**Unsubscribe tombstones the slot; it does not splice it.** Compaction is
deferred until the outermost dispatch returns, so a re-entrant emit cannot
shift indices under a loop that is still walking them.

**A drain is a bounded batch.** Events enqueued *by a handler during* a drain
wait for the next one. The alternative does not terminate for a handler that
re-enqueues its own event, and it would make the number of events a tick
processes depend on handler behaviour — the opposite of the property `04`
§4.4 wants from the choke point.

**Type safety is asserted at compile time in both directions.** Narrowing
assignments cover the positive half; `@ts-expect-error` covers the negative,
so a wrong payload, a wrong handler signature or an unknown event name each
fail the build *if they ever start compiling*. Loosening the payloads to
`unknown` was measured: 17 typecheck errors, including two "Unused
'@ts-expect-error' directive".

### Surprises

**1. The first two tests written for criterion 3 passed against a deliberately
spliced implementation.** This is the entry's most useful line. "Unsubscribe
during emit does not skip handlers" reads like one behaviour and is two:
cancelling a *later* handler by splicing happens to behave correctly, because
the survivor slides down into an index the dispatch loop has not reached yet.
Only cancelling an *already-called* handler — or the running one — slides
every later handler down past the cursor, and the last one is silently never
called. The obvious test (a handler cancelling the next one) is the case that
cannot detect the bug. Two cases were added for the real failure mode, and
they are exactly the two that go red under the perturbation, with the other 26
still green.

**2. `EventMap` cannot be `Record<string, unknown>`.** TypeScript grants
implicit index signatures to type *aliases* but not to *interfaces*, so
`interface GameEvents { 'item:added': ... }` — which is how `05` §`sim/events/`
describes it and how anyone would naturally write it — fails that constraint
with "Index signature for type 'string' is missing". The constraint is
`object`; every payload type still resolves through `M[K]`, so nothing is
given up. There is a test pinning that an interface is accepted.

**3. The allocation harness has a threshold that can sit below its own
resolution, and it bit once.** This file's zero-subscriber-emit assertion
failed on its very first run and then passed 13 consecutive runs.
`allocationAllowanceFromControl` returns `control / 100`, and the control on
this machine reads **77k–94k**, putting the allowance at **773–944 bytes —
under the profiler's 1024-byte sampling interval**. One stray sample landing
in the measured frames is therefore an automatic failure of an assertion whose
true reading is 0. Mitigated here with `repeats: 6` (`attributedBytes` is the
minimum across passes, so a stray must recur in all six) and filed as BL-057,
because `core/math/allocation.test.ts` derives its allowance the same way —
BL-050 recorded a reference control of ~115000, an allowance of 1150, only
just above one sample.

### Tests
28 cases across four groups: type safety (compile-time, both directions),
subscribe/emit/unsubscribe semantics, the criterion-3 cases above, the queued
mode including the bounded-batch and re-entrancy rules, and three
allocation measurements — zero subscribers, zero subscribers after a
subscribe/unsubscribe cycle (a different `Map` state, so measured rather than
assumed), and one subscriber with a non-allocating handler.

Three perturbations applied and reverted: payloads loosened to `unknown` (17
typecheck errors), `splice` in place of the tombstone (2 failures, both the
cases written for it), and the same splice *before* those two cases existed
(0 failures — recorded because it is the reason they exist).

### Follow-ups
- **BL-057** — the allocation allowance can fall below one profiler sample.

---

## 2026-08-15 — BL-054 Simplex noise, fbm, ridge and Poisson-disk sampling

**What landed.** `packages/client/src/sim/noise/Noise.ts` and
`packages/client/src/sim/noise/PoissonDisk.ts`, with their test siblings. 38
new tests; suite **212 pass / 0 fail / 0 todo**, up from 174. `pnpm lint`,
`pnpm typecheck` green.

**The decision this task turned on: no square root at play time.** `04` §3
requires determinism to be ours, and `Rng.ts`'s header earns that by arguing
from ECMA-262 — `Math.imul`, `>>>`, `^` and `+` on int32 operands have no
implementation latitude — and by naming `Math.sin` as the mixer that would
forfeit it. Simplex reintroduces exactly that hazard through the back door:
its skew constants are conventionally written `F2 = (√3 − 1)/2` and
`G2 = (3 − √3)/6`, Bridson's candidate placement is conventionally
`cos`/`sin` of a random angle, and the background grid's cell is conventionally
`radius / √2`. **ECMA-262 specifies `Math.sqrt`, `Math.sin`, `Math.cos` and
`Math.pow` as implementation-approximated.** In practice every engine ships a
correctly-rounded `sqrt` because IEEE-754 demands one — but "every engine
currently does" is a weaker claim than "the specification forbids otherwise",
and a save that replays differently on a different browser is the exact failure
this project cannot have.

So: the constants are committed as decimal literals, checked by tests that
re-derive them from `Math.sqrt` and require agreement within one ulp; candidates
are drawn by rejection from the square annulus (the annulus is `3π/16 ≈ 59%` of
the square, so ~1.7 draws each); every distance test compares squares; and the
attenuation `(0.5 − |d|²)⁴` is repeated multiplication rather than `Math.pow`.
A test asserts the claim directly, via `Function.prototype.toString` over the
exported routines — which inspects the run-time code exactly, and needs no
`node:fs` inside `sim/`, which the boundary rules forbid.

**Measured range and mean** (criterion 3), over 20,000 lattice samples. These
are the measurements, not the assertions — the tests bound them loosely on
purpose, because a test pinned to the last digit fails on any harmless change.

| field | min | max | mean |
|---|---|---|---|
| `simplex2` | −0.99626 | 0.99030 | −0.00086 |
| `simplex3` | −0.96545 | 0.96750 | 0.00564 |
| `fbm` (oct 5, lac 2, gain 0.5) | −0.75777 | 0.85539 | −0.00019 |
| `ridgeNoise` (oct 3) | 0.02001 | 0.99579 | 0.43331 |

Two things worth reading off that table. The conventional scale factors (70 in
2D, 32 in 3D) really do land inside `[-1, 1]` and really do use most of it, so
neither is a fudge. And **ridge noise is nowhere near centred** — mean 0.43 on
`[0, 1]` — which is the point of it: `12` §"Terrain" adds a masked ridge term,
so a ridge must contribute upward or not at all and must never carve.

**`fbm` normalises by total amplitude, and that is not cosmetic.** Undivided, a
5-octave `gain = 0.5` sum reaches ±1.9375. `12` §"Terrain" multiplies fbm by
0.28 and adds it to a mask, so without the division `octaves` would be a *gain*
knob wearing a detail knob's name, and changing it would silently change how
much relief the island has. There is a test that one octave of fbm is exactly
`simplex2`, which is what pins the divisor to the amplitude sum rather than to
the octave count — at one octave those agree, so it is a real check.

**Order-independence is a property of the keying, and the tests are aimed
there.** `33_CURRENT_TASK.md`'s handoff was right that `Rng.test.ts` already
proves the streams are independent and that what was left was proving the
*sampler* does not undo it. There is exactly one way to undo it — let a chunk
read something outside itself — so `samplePoissonDisk` takes the world seed and
the chunk coordinates and reads nothing else. Tested by generating the same six
chunks reversed, and interleaved with unrelated chunks, comparing **element for
element rather than as a set**: a sampler that returned the right points in a
seed-dependent order would pass a set comparison and still break the chunk hash
`12` §"Verification" step 8 calls for. The negative control matters as much —
different chunks must *differ*, which catches a sampler that ignored its
coordinates and would otherwise pass every order test while tiling the island
with one repeated pattern.

**Surprises.**

1. **`tools/check-sim-purity.ts` does not exist.** `CLAUDE.md`, `06`
   §"Purity of `sim/`" and `Rng.ts`'s own header all describe it in the present
   tense as the thing enforcing `sim/` purity. It is **BL-017**, still open in
   the Ready list. Enforcement today is the ESLint bans alone, which do cover
   the banned globals — so nothing is wrong, but three documents assert a gate
   that is not there, and a session could reasonably rely on it. Not fixed here
   (it is another task, and taking it would be scope creep); recorded so the
   next reader does not have to rediscover it.
2. **`noUncheckedIndexedAccess` applies to typed arrays**, exactly as the BL-005
   handoff warned. The `at()` accessor pattern it recommended was needed on
   nearly every line of the permutation indexing, and the warning saved real
   time — the handoff was right and specific, which is worth saying because
   handoffs usually are not.
3. **The BL-005 handoff's "next action" line was correct this time**, unlike the
   one before it that it warns about. BL-054 was genuinely topmost. Verified
   against `32_BACKLOG.md` anyway, per the file's own advice.

**Deliberately not done.** The sampler does not enforce the minimum distance
*across* a chunk boundary; a point near an edge can land within `radius` of one
in the neighbour. That is the price of order-independence, which `12` states as
the harder requirement, and the alternative (sample the 8 neighbours from their
own streams and keep only the centre) costs 9× for an artefact nobody has
looked at yet. Filed as **BL-056** with the technique written down, rather than
guessed at now.

**Next.** The topmost unblocked task in Phase 0's Ready list is now **BL-006**
(typed event bus, S, depends on BL-001). Read the list rather than this line.

## 2026-08-11 — BL-005 Seeded RNG (mulberry32 + named streams)

**Type:** feature
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~2h

### What changed
`packages/client/src/sim/rng/Rng.ts`: mulberry32 (`nextU32`, `nextFloat`), the
draws callers would otherwise each re-derive (`nextInt`, `nextRange`, `chance`,
`pick`, `shuffle`), and the named stream factory `rngFor(worldSeed, purpose,
...coords)` with `streamSeed` exposed beside it. 32 tests. Deleted
`sim/_scaffold.ts`, whose own comment asked to be removed once the rng landed
there. Suite **174 pass / 0 fail / 0 todo** (was 142); `pnpm lint`,
`lint:rules`, `typecheck`, `format:check` and `build` all green.

**The task was split on claim.** The original BL-005 was "Seeded RNG and noise",
and planning it showed two unrelated bodies of work with two unrelated failure
modes: a 32-bit integer recurrence whose risk is bit-exactness across engines,
and a gradient-noise field whose risk is whether the surface looks right. The
noise half is now **BL-054**, depending on this one, and it took the
golden-fixture acceptance criterion with it.

### Why it was done this way
**A stream per purpose, not one generator.** A shared generator makes every
consumer's output depend on the call order of every other consumer — add one
wildlife check before the scatter pass and the whole island changes. `12`
§"Runs in a Web Worker" needs more than that: scatter is generated per chunk
"independently and in any order", which a stream keyed by
`('scatter', chunkX, chunkZ)` gives directly. There is a test that draws a 5×5
grid of chunks forwards and backwards and requires the per-chunk digests to
match.

**The world seed is a parameter, not module state**, because `sim/` holds no
module-level mutable state and because the headless harness (BL-014) will run
several seeds in one process. A convenience binding belongs in the service
registry (BL-009).

**Seeds derive through the existing FNV-1a helpers** rather than a hash written
here. A project with two hash functions eventually has two that disagree about
what they hash.

**`nextInt` rejects the ragged tail rather than taking a modulo.** This is the
decision most likely to look like over-engineering, so the reasoning is
recorded: at the sizes this project actually draws — a loot table of 7, a
variant index of 3 — modulo bias is about one part in 6e8, which is precisely
why it would never be noticed and therefore never fixed. Rejection costs an
expected fewer than two draws.

### Surprises
- **`noUncheckedIndexedAccess` applies to typed arrays too**, not only to plain
  arrays. `Int32Array`/`Uint8Array` counters were the natural way to write the
  statistics without `!` (banned by lint), and they type their elements
  `number | undefined` just the same. Resolved with a small `at()` accessor in
  the test file whose `?? 0` is unreachable by construction, and documented
  there. Worth knowing before the next session reaches for a typed array to
  dodge the same rule.
- **`.github/AI_DEVELOPMENT_WORKFLOW.md` does not exist** — `CLAUDE.md` and
  `32_BACKLOG.md` both point at that path, but the file is at
  `docs/AI_DEVELOPMENT_WORKFLOW.md` and `.github/AI_DEVELOPMENT_WORKFLOW` is an
  empty directory. Filed as **BL-055** rather than fixed inline.
- **The previous session's handoff named the wrong next task.**
  `33_CURRENT_TASK.md` said the topmost unblocked Phase 0 task was BL-015;
  BL-005 through BL-014 all sit above it and BL-005's only dependency (BL-004)
  had just closed. Following the handoff instead of the file would have skipped
  ten tasks. No harm done — recorded because the handoff is the artifact a
  fresh agent trusts most.

### Tests
32 new, all in `Rng.test.ts`, on top of the 142 already passing.

**Criterion 1 — identical output across Node and browser for a fixture of
10,000 values: met, with a stated limit.** The fixture is 10,000 `nextU32`
values from the shipped world seed `0x48414C43`, pinned as an FNV-1a digest
(`9b901c2e`) plus four spot values, and generated by a standalone transcription
of mulberry32 that imports nothing from this repository — so the fixture is not
a recording of whatever the implementation happened to do. The same sequence
was then run in **Chromium 141.0.7390.37** from a `file://` page and produced
the identical digest, the identical first eight and last four values, and
identical `nextFloat` values at both ends (`0.5488220921251923`,
`0.917225383920595`). Node was v22.22.2.

**That is Node and a browser, and it is not two engines.** Both are V8 (Node's
is 12.4.254.21). The criterion asks for Node and browser and this is that; it
is *not* evidence about SpiderMonkey or JavaScriptCore, and no non-V8 engine is
available in this environment. What covers those is an argument rather than a
measurement, and it is written into `Rng.ts`'s header: every operation in the
recurrence (`Math.imul`, `>>>`, `^`, `|`, `+` on int32 operands, and a final
division of two exactly-representable doubles) is exactly specified by
ECMA-262, and nothing reaches for `Math.sin` or `Math.pow`, whose last bits are
implementation-defined. Re-measure on a non-V8 engine when BL-016 brings
Playwright and Firefox in.

**Criterion 2 — named streams independent under a chi-square test: met.** Six
purposes × 60,000 draws into 8 bins. Each stream is checked for uniformity on
its own (7 df, against the 0.1% critical value 24.322) and all 15 pairs are
checked with a test of independence on the 8×8 contingency table (49 df,
against 85.351). Critical values are written out rather than eyeballed. The
test carries its own **negative control**: two streams that are in fact the
same must fail it, and the test asserts they do — without that, a derivation
that returned one stream for every purpose would have sailed through.

Two other tests are worth naming because they are the ones a plausible wrong
implementation passes everything else and fails here:
- **`shuffle` uniformity over permutations, not elements.** All 24 permutations
  of 4 items across 48,000 trials, chi-square on 23 df against 49.728. The
  upward-loop variant of Fisher–Yates passes every element-level test and fails
  this one, having nⁿ equally likely paths onto n! outcomes.
- **The modulo-bias test, verified by perturbation.** `span = 0x60000000` makes
  the bias enormous rather than invisible: 2³² holds two spans plus a remainder
  of 1073741824, so a plain modulo lifts the fraction of results below that
  remainder from the correct 0.6667 to 0.75. Replacing the rejection loop with
  `draw % span` and re-running measured **0.74965** and failed the test, then
  the change was reverted. A test for a bias nobody can see is worth nothing
  unless it has been seen failing.

---

## 2026-08-13 — BL-050 Attribute allocation by call site, closing BL-004

**Type:** fix
**Phase:** 0
**PR:** —
**Time:** ~1.5h

### What changed
`core/math/allocationHarness.ts` gained `measureAttributedAllocation`, which runs an
operation under V8's sampling heap profiler (`HeapProfiler.startSampling` via
`node:inspector`) and sums the bytes the profiler attributes to the measuring loop and
everything it called. The `heapUsed`-rise instrument it replaces is deleted.
`allocation.test.ts` is now 13 passing cases with **no `todo`**; the whole suite is
**142 pass / 0 fail / 0 todo**, up from 131 / 0 / 16 — every one of those 16 `todo` was
BL-004's zero-allocation criterion. That criterion is signed off, so **BL-004 is
complete**.

### Why it was done this way
The previous session left this open with an honest verdict: the operations are "very
probably allocation-free", which is not a sign-off. The reason it could get no further
is that the old instrument measured **the wrong thing at this resolution**. It summed
process-wide `heapUsed` increases and divided by *one* operation's iteration count, so
any other allocation in the process during the loop was charged to the operation under
test. At whole-process resolution that is fine, and its control case always worked —
which is exactly why it looked sound. At per-operation resolution it is a
misattribution engine, and the symptom was diagnostic: three to five of thirty
allocation-free operations read one returned object's worth of bytes, and *the set
changed when unrelated parts of the test file changed*.

The sampling heap profiler cannot make that mistake by construction. It records a stack
trace at sampled allocations, so bytes are attributed to the code that allocated them;
another test's garbage lands under another test's frames. It is also independent of when
the collector runs, which is what defeated the original before/after delta.

The second decision worth stating: **the pass threshold is derived from a control
measured in the same process, not written as a constant.** A constant cannot distinguish
"this operation allocates nothing" from "the profiler recorded nothing" — and the very
first dead end in this task's history was an instrument whose signal was always zero,
which passes every case including the ones designed to fail.

### Surprises
Three, and the second is the one the docs did not predict.

**The absolute figures are not bytes allocated, and it does not matter.** The profiler
under-reports volume by ~100×: 200k iterations of a ~47-byte-per-call allocator should
total ~9.4 MB and it attributes ~90–115 kB. Young-generation allocation from optimised
code mostly takes a bump-pointer fast path V8 does not sample. For an *allocates / does
not* criterion the separation is total (tens of thousands of bytes versus exactly zero),
so nothing is lost — but anyone who needs a real byte budget later must not reach for
this instrument. Written into the module doc rather than left to be rediscovered.

**A longer warm-up made the instrument worse, not better, and in the dangerous
direction.** At `warmup = 5000` the operation tiers up inside the measured window and
the compile allocation is attributed to the frames being compiled — a 3–10 kB reading on
an operation that allocates nothing. Raising it to 50000 gave exactly 0 on every clean
operation in every pass. Raising it further to 200000 made the **control** read 0 in one
pass of three: a false pass. The intuition "warm up more, measure more cleanly" is
wrong here, and only the control caught it.

**It did not need BL-015.** BL-050's backlog entry listed BL-015 (Vitest) as a
dependency, on the theory that a different runner might not have the ordering problem.
The problem was the instrument, not the runner, and the dependency was a guess. Its
backlog entry now says so.

### Tests
`allocation.test.ts`: 13 cases, 0 `todo`. All 30 math operations — including the five the
old instrument could not clear (`addScaled`, aliased `add`, `rotateVec3`, `union`,
`stepSpring`) — assert 0 attributed bytes against a control-derived allowance. Added a
case covering the allowance guard's throwing path directly.

Three checks were run by perturbation and reverted, because 13 green cases prove nothing
on their own:
- **moving the whole `vec3` suite to the end of the file** — 13/13 unchanged, which is
  BL-050's actual acceptance criterion (the old instrument's readings moved under exactly
  this edit);
- **`samplingInterval` 65536** — the control reads 0 and the file goes from 13 passes to
  11 failures naming the cause;
- **a stale `MEASURED_LOOP_NAME`** — same loud failure.

Coverage: `allocationHarness.ts` 100% of lines and functions; all files 99.83%.

### Follow-ups
- **BL-053** — drop `--expose-gc` from both test scripts; it existed for the deleted
  harness and nothing calls `globalThis.gc` now. Left for BL-015, which rewrites those
  scripts anyway.
- BL-051 and BL-052 carry over unchanged.

---

## 2026-08-09 — BL-004 Core math module

**Type:** feature
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~1 session

### What changed
`packages/client/src/core/math/` now holds `scalar.ts`, `vec2.ts`, `vec3.ts`, `quat.ts`, `aabb.ts`, `easing.ts`, `spring.ts` and `hash.ts`, in the plain-object out-parameter style `07` §7 makes binding, plus `allocationHarness.ts` and seven co-located test files. `core/_scaffold.ts` is deleted; its comment asked for exactly this. Two of BL-004's three acceptance criteria are met and the third is not — the task stays In Progress, with BL-050 carrying what remains.

### Why it was done this way
**The critically damped spring steps by the exact closed-form solution rather than integrating towards it.** At ζ = 1 the ODE has one, so there is no reason to approximate it: `x(t) = target + (d₀ + (v₀ + ω d₀)t)e^{−ωt}`. Framerate independence then holds to rounding rather than to first order — `n` steps of `dt` and one step of `n·dt` land in the same place — and the integrator is unconditionally stable at any `dt`, where an explicit scheme diverges above `dt ≈ 2/ω`, which at ω = 12 is a single dropped frame. It also makes the acceptance criterion satisfiable in the strongest sense: the thing it must be verified against *is* what it computes. Only ζ = 1 is offered, because an underdamped camera is a bug rather than a tuning choice.

**Numbers are hashed by their IEEE bits, not by `String(value)`.** `String(-0) === '0'`, and two world states that differ by a sign of zero must not produce the same `worldHash()`. Decimal rendering is also a guarantee about `toString`, not about the value.

**`normalize` returns zero for a zero input, and `normalizeQ` returns the identity.** Both cases are reached constantly — a movement intent with no keys held, a velocity at rest — and a `NaN` escaping into a transform would poison the world hash somewhere far from where it started.

**An AABB is inclusive on both bounds.** A structure placed flush against another must count as adjacent for `17`'s socket queries; a half-open box says it does not.

### Surprises

**1. BL-004's own acceptance criteria need a test runner, and the test runner depends on BL-004.** BL-015 is "Vitest setup and first test suites", `Depends on: BL-004`, so it cannot come first — yet BL-004 asks for a counter-instrumented allocation test and 95% coverage. Resolved by writing the suites against `node:test` + `node:assert/strict` (standard library, so no dependency was added — `35` forbids a runtime one) and measuring coverage with Node's `--experimental-test-coverage`. **BL-015 should port these suites, not rewrite them.** Worth reflecting in the backlog ordering: a task whose criteria are tests cannot precede the runner without this workaround.

**2. Node resolves neither `tsconfig` `paths` nor Vite aliases**, so `node --test` could not load a single module that imports a sibling by alias — which is every module in the tree. `tools/aliasResolver.mjs` teaches it the five. That makes three hand-synced copies of the same alias map (BL-052).

**3. Measuring allocation is much harder than the criterion's wording suggests, and three plausible harnesses are wrong.** A before/after `heapUsed` delta measures *retention*, not garbage — the collector runs during the loop, so 200,000 short-lived objects finish with the heap barely larger than it started, and it under-reported a known allocator sevenfold. Counting collections via `PerformanceObserver` on `'gc'` reports **zero** for a loop that provably allocates 200,000 objects on Node v22.22.2, under both `entryTypes` and `type`, callback and `takeRecords()`. And a closure written `(i) => lerp(0, 10, t)` has its returned double boxed at the call boundary, charging 6.2 bytes/op to an operation that allocates nothing. Every one of these was caught by the harness's **control case** — a deliberate allocator that must be detected — and by nothing else. If a future harness has no control, it is not a harness.

**4. V8 field representation is a real, measurable trap for this codebase's zero-allocation rule.** Writing a double into an object field that was first stored an integer costs a boxed heap number: the identical `normalize(out, a)` measures 6.1 bytes/op with `out` created as `{x: 0, y: 0, z: 0}` and 0.3 with `{x: 0.5, y: 0.5, z: 0.5}`. Nothing in the docs anticipates this, and it plausibly affects component defaults across the whole project, not just tests.

**5. `-0` is a determinism hazard hiding in plain sight.** `perp2(v2(), v2(1, 0))` returns `{x: -0, y: 1}` — `assert.deepEqual` separates it from `{x: 0, y: 1}`, and so does a bitwise hash, while `-0 === 0` and a debugger shows "0". Two worlds that look identical could hash differently, with no visible cause. Filed as BL-051.

### Tests
131 assertions passing, 0 failing, 16 `todo`. Coverage on the eight source modules: **100% of lines and functions, 96.8–100% of branches**, against BL-004's 95% floor.

- `spring.test.ts` meets criterion 3 directly: 30 Hz, 60 Hz, 144 Hz and one single jump over the same second agree to 1e-12 in both value and velocity, and all four agree with the closed form at four times. Also: never overshoots; one 10-second step lands on the target instead of diverging; `stepSpring3` is exactly three `stepSpring` calls, asserted rather than assumed because that equivalence holds only while the system stays linear.
- The correctness suites pin the things that go quietly wrong: `lerp` hitting both endpoints exactly, alias-safety of `cross` and `rotate2`, `slerp` taking the short arc when the two quaternions carry opposite signs (the line most often missing from a hand-written slerp, and its absence reads as a physics glitch), every easing curve starting at 0 and ending at 1, and the hash reproducing the published FNV-1a vectors.

**Criterion 1 is not signed off, and the per-operation suites are `todo` rather than passing.** The instrument works — control detected, floor measured — but its per-operation reading moves: three to five of thirty report exactly one returned-object's worth of bytes, reproducible to two decimals, and **the set changes when unrelated parts of the test file change**. An effect that depends on a test's position in a file is not a property of the code under test; the same calls in an isolated script measure 0.01–0.10 bytes/op and the sources create no object. The honest reading is "very probably allocation-free", which is not a sign-off, so it is recorded as unfinished with every measurement written down rather than passed against a loosened bound.

### Follow-ups
- **BL-050** — settle whether the operations allocate, and how to measure it. This is all that remains of BL-004.
- **BL-051** — decide whether `-0` may reach world state.
- **BL-052** — collapse the three hand-synced path-alias maps.

---

## 2026-XX-XX — Project documentation system created

**Type:** docs
**Phase:** pre-0
**PR:** —

### What changed
The complete documentation set (`docs/00`–`docs/40`), the AI development workflow, the seven phase task files, and the repository README were authored before any code. The project is a browser-based cozy 3D survival-exploration game — single-player first, with drop-in co-op in Phase 7.

### Why it was done this way
The premise of this repository is months of largely autonomous, agent-driven development. That only works if the decisions an agent would otherwise have to invent are already made and written down. Three choices in particular are load-bearing and were made deliberately up front:

1. **Simulation is separated from presentation and is headless-runnable.** This makes gameplay testable without a browser, makes saves trivially correct, and makes Phase 7 multiplayer possible without a rewrite. Every other decision defers to it.
2. **Multiplayer is designed in from day one but implemented last.** The alternative — building single-player and retrofitting networking — is the most common way projects of this shape die. The `04` §10 checklist is the mechanism that keeps this honest.
3. **Content is data, not code.** Adding a fish, a recipe, a crop or a building piece must never require a code change. This is what allows content to scale while the codebase stays small.

### Surprises
None yet — this is the first entry.

### Tests
None yet. `29_TESTING_STRATEGY.md` §4 defines ten critical tests that must exist by the end of their respective phases and must never be weakened to make a change pass.

### Follow-ups
- BL-001 through BL-021 seeded for Phase 0
- BL-022 through BL-044 seeded for Phase 1, to be groomed before Phase 1 opens

---

## Phase retro format

At the end of each phase, before tagging `phase-N-complete`:

```markdown
## YYYY-MM-DD — Phase N retro

**Tasks completed:** X of Y planned
**Duration:** N weeks
**Proof achieved:** (the one-line proof from `03_FEATURE_ROADMAP.md` — yes/no, with evidence)

### What went well

### What was harder than expected

### Documentation that turned out to be wrong
(and the PR that fixed it — docs that are wrong and left wrong are worse than no docs)

### Performance at the end of the phase
| Metric | Budget | Actual |
|---|---|---|
| Frame time p50 / p99 | | |
| Draw calls | | |
| Bundle size | | |
| Test count / coverage | | |

### Manual playtest checklist results

### Scope changes
What moved to the Icebox, what was promoted out of it, and why.

### Carried into the next phase
```

---

## 2026-08-09 — BL-003 Vite app shell with a canvas and a black screen

**Type:** feature
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~2h

### What changed
`index.html` now declares a full-window `<canvas>` and a sibling overlay container inside one positioned `#app`. `render/canvas.ts` sizes the canvas's *drawing buffer* to its CSS box times `min(devicePixelRatio, 2)` and keeps it there. `ui/App.tsx` and `ui/mountOverlay.tsx` mount a React 18 root into the overlay, which `ui/styles/base.css` makes `pointer-events: none`. `main.ts` replaces BL-001's alias-resolution scaffold with the real bootstrap, including HMR teardown. React 18, `react-dom`, `@vitejs/plugin-react` and the `@types/react*` packages were added; `render/_scaffold.ts` and `ui/_scaffold.ts` were deleted.

### Why it was done this way
**The overlay is transparent to input by default and interactive by opt-in, not the reverse.** `#ui-overlay` sets `pointer-events: none` and any future screen that needs to be clickable sets `pointer-events: auto` on its own element. The other direction — interactive by default, opting out per element — swallows a click on the world the first time someone forgets a rule, and that bug presents as broken input rather than as broken CSS. This is the whole mechanism behind the "overlay does not intercept canvas input" criterion, so it is worth stating as a rule rather than leaving as a stylesheet line.

**The canvas needs two resize listeners and the second one is the one that gets forgotten.** A `ResizeObserver` fires when the element's box changes, which covers window resizes and layout changes. It does *not* fire when the device pixel ratio changes and the box does not — dragging a window between a retina and a non-retina display, or changing browser zoom. The documented way to observe that is `matchMedia('(resolution: Xdppx)')`, which resolves only for the *current* ratio, so the listener has to be re-armed against the new ratio each time it fires. `watchPixelRatio` in `render/canvas.ts` does that.

**`resizeCanvasToDisplaySize` returns a boolean and callers are expected to check it.** Assigning to `canvas.width` resets the entire drawing buffer even when the value assigned is identical, so a caller that writes unconditionally clears the screen once per frame. Returning "did anything change" is what makes the function safe to call from a render loop, which is how BL-011 will use it.

**CSS size comes from `getBoundingClientRect`, not `clientWidth`.** The former is fractional. A canvas's layout box is very often not an integer, and the rounded value would make the buffer disagree with the box by up to a pixel — visible as a shimmering edge on a full-window canvas.

**The pixel-ratio arithmetic is a separate pure function** (`computeDrawingBufferSize`) rather than inlined. Every case worth checking — a fractional ratio, a ratio above the cap, a zero-height box during layout, a non-finite ratio — is arithmetic that a DOM-driven test would have to stage a whole browser to reach. The floor of 1 pixel is not paranoia: a canvas is legally `0 × 0` while its container lays out, and a zero-sized drawing buffer makes `getContext('webgl2')` hand back a context that fails its first draw, a long way from the cause.

**`import.meta.hot.dispose` in `main.ts` is load-bearing, not boilerplate.** Vite replaces a module's exports without reloading the page, but the DOM side effects there — a `ResizeObserver`, a media-query listener, a React root — outlive the module instance that created them. Without teardown, an edit leaves the previous generation's observers attached and a second React root fighting for the same container.

**React was added without a `40_DECISION_LOG.md` entry, deliberately.** `35` §4.2 forbids adding a runtime dependency without human approval recorded there; `04` §3 already records React 18 as the binding UI choice. This implements that decision rather than making a new one, so a decision-log entry would be a duplicate of a row that already exists.

### Surprises
1. **`@vitejs/plugin-react`'s current major does not work with the Vite this repo pins.** v6 imports `vite/internal`, which Vite 5 does not export, and the build dies at `ERR_PACKAGE_PATH_NOT_EXPORTED` — after `pnpm typecheck` and `pnpm lint` had both passed, since neither resolves a Vite plugin's runtime imports. Pinned to `^4`, which supports Vite 4 and 5. Bumping Vite instead would have been a change to a pinned build tool to suit a plugin, which is not what BL-003 is. Worth knowing generally: **`typecheck` + `lint` green says nothing about whether the app builds**, until BL-019 puts `build` in CI.
2. **`35` §4.9 ("never mark a task done without the full test suite passing locally, including `pnpm sim --assert-hash`") cannot be honoured at this point in the backlog.** The test runner is BL-015, the sim harness BL-014, Playwright BL-016 — all *below* BL-003 in the Ready list the same document tells agents to work top-down. The rule and the ordering disagree for the first few Phase 0 tasks. This is not a reason to skip verification, and this task did not: see Tests below. But an agent reading `35` §4.9 literally at BL-003 has no way to comply, and that is a documentation gap rather than an agent's judgement call. Logged as a note; no doc was changed, since `35` is a constraints document and editing it is not this task.
3. `pnpm lint` prints a deprecation warning for `boundaries/external` on every run. Pre-existing, already filed as BL-047 by BL-002; untouched here.

### Tests
**No automated test was added, because there is no runner yet** — BL-015 (Vitest) and BL-016 (Playwright) are both below this task in the Ready list. Rather than assert the criteria by inspection, they were measured against a real headless Chromium with a throwaway script kept outside the repo (adding Playwright to the repo is BL-016's job, not this task's). What was measured, at `devicePixelRatio` 1, 2 and 3, **24 checks, all passing**:

- The canvas fills the viewport exactly (`1024×768` CSS against a `1024×768` viewport).
- The drawing buffer is `cssSize × min(dpr, 2)`: **`1024×768` at dpr 1, `2048×1536` at dpr 2, and `2048×1536` at dpr 3** — the cap doing its job.
- After `setViewportSize(640×480)` the buffer follows: `640×480` at dpr 1, `1280×960` at dpr 2 and 3.
- `document.elementFromPoint` at the viewport centre returns `#game-canvas`, not `#ui-overlay`, with the overlay's computed `pointer-events` reading `none`. That is the "overlay does not intercept canvas input" criterion, measured rather than argued.
- `document.documentElement.scrollHeight` equals the inner height — the `display: block` on the canvas really does remove the inline-baseline scrollbar.
- Body background is `rgb(0, 0, 0)`, and no page errors or console errors on load.

**HMR was measured with a negative control**, which is the part worth keeping: editing `ui/App.tsx` produced `[vite] hot updated: /src/ui/App.tsx` while a marker set on `window` survived, proving the page did not reload. Editing `main.ts` — which has no `hot.accept` — lost the marker and reconnected the HMR client, i.e. fell back to a full reload. Without the second half, "HMR works" would have been satisfied by a full page reload, which is not HMR.

The gates that do exist all pass: `pnpm lint` clean, `pnpm lint:rules` 4/4 fixtures caught, `pnpm typecheck` clean, `pnpm format:check` clean, `pnpm build` green — **143.72 kB raw / 46.33 kB gzipped**, against `CLAUDE.md`'s 600 kB gz initial-JS budget.

### Follow-ups
- BL-048 — reinstate these checks as real tests once BL-015 and BL-016 land; the unit half (`computeDrawingBufferSize`) needs only BL-015.
- BL-049 — `MAX_PIXEL_RATIO = 2` is a constant matching `08` §9's prose, not a measurement. Once BL-012 detects a quality tier and BL-011 draws something, the cap should come from the tier.

---

## 2026-08-07 — BL-002 Configure ESLint, Prettier, and the boundary rules

**Type:** chore
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~1h

### What changed

`eslint.config.js` (flat), `.prettierrc.json`, `.prettierignore`, `tools/check-lint-rules.ts`, `tools/lint-fixtures/` (4 files), and four new root scripts: `lint`, `lint:rules`, `format`, `format:check`. Dev dependencies only — `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `eslint-import-resolver-typescript`, `prettier`, `eslint-config-prettier`. No runtime dependency.

The config is type-aware (`strictTypeChecked` + `stylisticTypeChecked`), carries the `04` §5 import-direction table under `eslint-plugin-boundaries` with `default: 'disallow'`, and adds the three custom bans BL-002 names as `no-restricted-syntax` selectors rather than a bespoke plugin: each is one AST shape, and a plugin would be a package, a build step and a test harness of its own (`35` §5 — fewer moving parts).

`pnpm lint`, `pnpm lint:rules`, `pnpm format:check`, `pnpm typecheck` and `pnpm build` are all green on the scaffold.

### Why it was done this way

**Default-deny on boundaries.** A pair missing from `04` §5's table is an error, not an unregulated case. That makes the table the source of truth rather than a description of what happened to get written, and it means widening it is visibly a `04` §5 change — which needs human approval (`35` §4.4).

**Prettier's scope stops at code and configuration.** `prettier --write .` was run once and reformatted all 42 files in `docs/` plus `tasks/` and `README.md` — including `00_PROJECT_VISION.md`, which `35` §4.3 forbids an agent to modify at all. Whitespace-only or not, that is a prohibited edit, so the reformat was reverted and `docs`/`tasks` were added to `.prettierignore` with the reason written in the file. `README.md` is formatted; the prose corpus is not.

**The fixture harness is a script, not a test.** `pnpm test` does not exist yet (BL-015), and pulling Vitest forward would have expanded this task past its acceptance criteria. `tools/check-lint-rules.ts` runs on Node's `--experimental-strip-types`, so it needs no runner dependency; its expectation table is shaped so it can become a `.test.ts` when BL-015 lands.

**One fixture carries four shapes.** The per-frame allocation ban needs a selector per way of naming a function (declaration, arrow assigned to a const, class method, object method), so the fixture contains all four and the harness asserts **four** reports rather than "at least one". A selector list that quietly loses an entry fails.

### Surprises

Three, all of which cost a probe to find and all of which would otherwise have shipped as rules that read correctly and enforced nothing:

1. **An unresolvable dependency is silently not checked.** The first working version of the config had no import resolver. A deliberate `core → sim` import — the most basic violation `04` §5 exists to stop — passed `pnpm lint` clean. `eslint-plugin-boundaries` classified the *file* correctly as `core` and the *dependency* as `origin: "external"`, because `@sim/_scaffold.js` resolved to nothing, and external modules fall outside the layer rules. Fixed by adding `eslint-import-resolver-typescript` pointed at `packages/*/tsconfig.json` — there is no root `tsconfig.json` for it to find on its own, only `tsconfig.base.json`, which the package configs extend.

   **The lesson generalises: a green boundary lint is not evidence the boundary is enforced.** Anything that touches `eslint.config.js` should re-run the four-direction probe below.

2. **`boundaries/dependencies` does not look at npm packages.** `04` §5's `sim` line is "MAY NOT import: three, react, DOM", but the layer rule only governs first-party imports. Getting `import * as THREE from 'three'` inside `sim/` reported needed the separate `boundaries/external` rule — which v7 deprecates and warns about on every run. The documented migration onto `boundaries/dependencies` (with `checkAllOrigins: true` and a `disallow: { to: { module: { source } } }` policy) was tried first and **did not fire**. Shipping the deprecated-but-working rule beat shipping the modern-and-inert one. Filed as BL-047 with the exact reproduction.

3. **Type-aware linting needs every file to be in a TypeScript project.** `eslint.config.js` itself, `tools/**`, and the fixtures are not members of any `tsconfig.json`, and the parser errors on them rather than skipping them. They get `tseslint.configs.disableTypeChecked`. The custom rules are all syntactic, so the fixtures still prove what they are there to prove.

### The probe that verifies the boundary rule

Not automated — that needs real files in the layer directories, which BL-004 onward will provide (see BL-047's notes). Run by hand after any change to `eslint.config.js`; each is a two-line file with one import, linted and then deleted:

| From | Imports | Expected |
|---|---|---|
| `core/` | `@sim/_scaffold.js` | error — no policy allows core → sim |
| `render/` | `@sim/_scaffold.js` | clean |
| `sim/` | `@content/_scaffold.js` | clean |
| `ui/` | `@render/_scaffold.js` | error — no policy allows ui → render |
| `sim/` | `three` / `react` | error — `boundaries/external` |
| `render/` | `three` | clean |

All six behaved as expected at this commit.

### Documentation notes (type: `note`)

- `06` §2 lists `eslint-plugin-react-hooks` in the flat config. It is **not** in this one: there is no React in the tree yet (BL-003 adds it), so it would have had nothing to lint and no fixture could have proved it works. Filed as BL-045 rather than added blind.
- `05` §8.2 requires no import cycles and `06` §5 names `madge --circular` as the gate for it. `import/no-cycle` is deliberately **not** enabled — it would be a second gate for the same property, and the one the docs name is the CI one. Neither doc is wrong; noting it so the absence is not read as a miss.

### Tests

`tools/check-lint-rules.ts`, run as `pnpm lint:rules`: 4 fixtures, 4 expectations, all caught (`Math.random` ×1, `dangerouslySetInnerHTML` JSX form ×1, `dangerouslySetInnerHTML` props-object form ×1, per-frame `new THREE.*` ×4). The boundary rules are covered by the manual probe table above, not by the harness.

`pnpm sim --ticks 20000 --assert-hash` (the `35` §8 session-end command) **does not exist yet** — the headless sim runner is BL-014 and there is no simulation to hash. Same for `pnpm test` (BL-015) and `pnpm check:bundle`. Stated rather than skipped silently.

### Follow-ups

BL-045 (react-hooks, once React exists), BL-046 (widen the per-frame ban to named `three` imports — the current selector matches `new THREE.Vector3()` but not `new Vector3()`, and the gap is named in a comment in the config), BL-047 (migrate off the deprecated `boundaries/external`).

---

## 2026-08-04 — BL-001 Initialise the pnpm workspace and package scaffolding

**Type:** chore
**Phase:** 0
**PR:** —
**Time:** ~1h

### What changed
Created the monorepo skeleton described in `05_CODEBASE_STRUCTURE.md` §1–2: root `pnpm-workspace.yaml`, root `package.json` with `dev`/`build`/`typecheck` scripts, `tsconfig.base.json` with the exact compiler options from `07_TYPESCRIPT_GUIDELINES.md` §1 plus `baseUrl`/`paths` for the five aliases, and a root `.gitignore`. `packages/shared` and `packages/client` each got a `package.json`, a `tsconfig.json` extending the base config, and a `typecheck` script. `packages/client` also got a minimal `vite.config.ts`, bare `index.html`, and `src/main.ts`. `packages/server` got only a `README.md` — no `package.json`, so it is not yet a workspace member, matching the acceptance criteria.

To prove the five aliases (`@core`, `@sim`, `@render`, `@ui`, `@content`) actually resolve rather than just being configured, each aliased directory got one `_scaffold.ts` marker file exporting a single string constant, and `main.ts` imports all five. Verified: clean-clone `pnpm install` (no interactive prompts — see Surprises), `pnpm -r typecheck`, `pnpm build` (Vite bundles all 8 modules including the cross-package `@content` import into `packages/shared/src/content`), and `pnpm dev` (served HTTP 200).

### Why it was done this way
Vite does not read `tsconfig.json` `paths` natively. Rather than add `vite-tsconfig-paths` as a new dev dependency for five aliases that change rarely, `vite.config.ts` hand-declares `resolve.alias` mirroring `tsconfig.base.json`. Two files to keep in sync by hand, but zero new dependencies — fewer moving parts per `35_AI_AGENT_RULES.md` §5.

`@content/*` points across the package boundary directly into `packages/shared/src/content`, not through the `@halcyon/shared` package name — this is what `05_CODEBASE_STRUCTURE.md`'s alias list (`@core/*, @sim/*, @render/*, @ui/*, @content/*`, no `@halcyon/` prefix on any of them) implies, and it works because both Vite and `tsc` operate at the source level within one repo. Vite's dev server needed `server.fs.allow: ['..']` added to permit serving files from outside `packages/client`.

The `_scaffold.ts` marker files are intentionally throwaway: each one carries a comment naming the backlog task(s) expected to replace it (BL-003 for `ui/`, BL-004/BL-006/BL-008/BL-009/BL-010 for `core/`, BL-005/BL-007 for `sim/`, BL-011 for `render/`). Deleting a marker when its directory gets real content is part of that later task's normal scope, not separate cleanup work — noted so the next agent doesn't treat five stray one-line files as unexplained cruft.

### Surprises
- A fresh `pnpm install` triggers an interactive "approve which dependencies may run install scripts" prompt for `esbuild` (Vite's transitive dependency), which would hang non-interactive/CI sessions. Fixed by adding `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` to the root `package.json`, which pnpm reads instead of prompting. Worth calling out since BL-019 (CI pipeline) will otherwise hit this on its first run.
- The environment's pnpm is 10.33.0, not 9.x as `04_TECHNICAL_ARCHITECTURE.md` implies ("pnpm 9+" language in the README). Pinned `packageManager` to the installed version rather than downgrading; no compatibility issue observed.

### Tests
None added — this task has no logic to unit test yet. Verification was the acceptance criteria themselves: clean-clone install, `pnpm -r typecheck`, and a Vite build/dev-server run proving all five aliases resolve. `pnpm sim`/`pnpm lint`/`pnpm test` do not exist yet (BL-014/BL-002/BL-015), consistent with "most checks will not exist early in Phase 0."

### Follow-ups
None — BL-002 through BL-021 were already seeded and are unaffected.

---

## Vision questions

Raised by agents who believe `00_PROJECT_VISION.md` may be wrong. Recorded here rather than acted on. Reviewed by a human at each phase boundary.

*(none yet)*
