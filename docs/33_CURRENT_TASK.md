# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-063

**`QueryCache` has no eviction.** Phase 0 · Size S · Docs to read: `04`.
Claimed 2026-09-04 before any code.

### Selection, verified rather than inherited

`AI_DEVELOPMENT_WORKFLOW.md` §2 says the topmost unblocked task in the current
phase's Ready list. Walked the list in `32` in order:

| item | verdict |
|---|---|
| BL-056 | **Phase 1**, not a candidate under phase discipline. Thirteenth session running |
| BL-059, BL-066, BL-068, BL-069 | done |
| BL-067 | skipped **on its own instruction** (*"should not be taken before `23` has a shape"*), re-checked with the grep the previous handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once, at §2 line 38, and defines it nowhere — so its first criterion still presumes a component-level format that does not exist |
| **BL-063** | **topmost actually ready** |

### The decision, made before coding

Criterion 1 offers two answers. **Taking the second: document that only
statically-known signatures are accepted, and check it.** Not eviction.

Three reasons, in order of weight:

1. **`35` §3.** An eviction policy without a caller that needs one is a guess,
   and the item's own notes say so. Nothing in the repository builds a dynamic
   signature.
2. **Eviction on this cache is a pessimisation, and the numbers are already
   measured.** BL-059 recorded a cold intersection at **1.00 ms** against
   **0.0784 ms** cached — about 13x. Every eviction of a still-live signature
   converts a hit into that cold path, so an LRU sized even slightly wrong
   makes the cache worse than no eviction at all, on a budget of 6 ms CPU.
3. **The lifetime question is already answered.** One `QueryCache` per `World`,
   constructed with it and unreachable from outside, so the map dies with the
   world. There is no process-lifetime leak to fix — only an unbounded-growth
   *risk within one session*, which is what the check addresses.

### Plan

1. `QueryCache` gains a stated cap on distinct signatures, and throws when a
   **new** signature would exceed it. Loud, deterministic, and early — matching
   this codebase's existing precedent for exhaustion (`EntityAllocator` fails
   loudly rather than aliasing, BL-007 criterion 4).
2. The module comment states the rule (`query` accepts only statically-known
   signatures), **and names eviction — LRU on a cap, drop-if-unqueried-for-N-
   ticks — with why it was not chosen.** That is criterion 2, and it is the
   half most likely to be skipped.
3. `World.query`'s doc carries the same rule, since that is the signature
   systems actually call; `World`'s module comment loses its "No query-cache
   eviction" limitation note, which stops being true.
4. Tests: the cap fires at the boundary and not before; the message names
   BL-063 and says what to do; a normal static workload never approaches it;
   the throw does not corrupt the cache.
5. `04` §4.3 gains one sentence, since it is the doc that describes the cache.

### The cap, and why it is not a guess

`SYSTEM_ORDER` is data in one file and empty today; `05` §1 lists **thirteen**
system files as later items. At a handful of distinct queries each that is
order-50, so the cap is **64** — comfortably above any static set this design
admits, and far below the growth a data-derived signature produces. Raising it
is a deliberate one-line edit with a reviewer, which is the point.

### Not in scope

- **BL-065** (`QueryCache.query` takes the bottom of the def family) is the
  next item in the list and touches the same signature. Deliberately not ridden
  along: `35` §3 forbids it, and BL-065's own criteria include deleting a cast
  in `World` and a helper in `Query.test.ts`.
- Eviction itself, per the decision above.

