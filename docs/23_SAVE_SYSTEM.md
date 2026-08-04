# 23 — Save System

Purpose: what is persisted, in what format, how it is versioned and migrated, and how saving stays fast, safe and honest. Losing a player's island is the worst thing this game could do, so this system is over-engineered relative to the rest, on purpose.

---

## 1. What is saved (and what is not)

**Saved (the delta):**
- World metadata: seed, generator version, tick, day, weather state, save version, playtime.
- Player: position, rotation, state, energy, warmth, active buff, unlocked recipes, journal, settings-independent progress, outfit colour, satchel tier.
- Containers: player inventory, every chest, station queues and slots.
- Structures: every placed piece (id, variant, colour, grid position, rotation, plus per-piece state such as door open, chest link).
- Terrain modifications: flatten rectangles.
- Resource nodes: only those whose state differs from freshly generated (harvested count, regrow tick). Typically <15% of nodes.
- Removed vegetation: a list of scatter indices removed by building.
- Farm tiles: all of them (sparse, small).
- Wildlife: only befriended animals (name, species, position). Ambient animals are respawned.
- World items: dropped item stacks and piles.
- Fragments found, places discovered, fish records, first-time flags.

**Not saved (regenerated):** terrain heights, vegetation scatter, node positions, chunk meshes, ambient wildlife, particles, audio state, camera.

Typical save size: 60–400 kB uncompressed, 15–90 kB after compression.

## 2. Format

```ts
interface SaveFile {
  version: number;              // schema version, integer, monotonic
  generatorVersion: number;     // worldgen version, for regeneration compatibility
  seed: number;
  createdAt: number;            // epoch ms
  savedAt: number;
  playtimeTicks: number;
  world: WorldSave;
  players: Record<PlayerKey, PlayerSave>;   // multiple, for multiplayer forward-compat
  entities: EntitySave[];
  checksum: string;             // FNV-1a over the canonical serialisation, excluding this field
}
```

- Serialised as **JSON, then compressed with `CompressionStream('gzip')`** (native, no dependency), stored as a `Blob` in IndexedDB.
- JSON over a binary format because: saves are small, debuggability is worth far more than 40 kB, and migrations are vastly easier to write and test against readable data. Revisit only if saves exceed 5 MB.
- Field names are short but readable (`px`, `py`, `pz` for positions; `id`, `v` for variant). Numbers are rounded: positions to 1 cm (3 decimals), rotations to 4 decimals.

## 3. Storage

- **IndexedDB**, database `halcyon`, stores: `saves` (keyed by slot), `backups` (rolling), `meta`, `worldCache` (generated world data, cache only).
- Three player-visible slots plus an autosave slot.
- **Rolling backups:** the last 5 autosaves and the last 3 manual saves are retained. This has rescued every game that has ever implemented it.
- Export/import to a `.halcyon` file (the same gzipped JSON) so players can back up or move islands. Import validates version, checksum and structure before replacing anything.
- Quota: request persistent storage (`navigator.storage.persist()`) on first save; if denied, warn once and suggest exporting.

## 4. Save flow

```
trigger (autosave timer / manual / before unload / sleep)
   │
   ├─ snapshot: walk the world, build the SaveFile object   [main thread, ~8 ms]
   ├─ transfer to worker
   ├─ worker: JSON.stringify → gzip → Blob                  [~25 ms, off main thread]
   ├─ write to IndexedDB under a temp key
   ├─ verify: read back, decompress, checksum matches
   ├─ atomically promote temp → slot; rotate backups
   └─ emit save:completed → a small unobtrusive HUD indicator
```

**Never overwrite the existing save until the new one is verified.** A failed write leaves the previous save intact.

Autosave triggers: every 4 in-game hours, on sleep, on entering/leaving a region, on placing/removing 20 structures, and on `visibilitychange` → hidden. Never mid-interaction; the scheduler waits for the player to be idle-ish (not gathering, not in the build ghost, not in the reel minigame) with a 30 s maximum deferral.

Snapshot cost must stay under 10 ms on the main thread. If it grows, move to an incremental dirty-tracking snapshot rather than accepting a hitch.

## 5. Versioning and migration

```ts
type Migration = { from: number; to: number; migrate: (save: any) => any };
const MIGRATIONS: Migration[] = [ /* one entry per version bump, in order */ ];

export function loadSave(raw: unknown): Result<SaveFile, LoadError> {
  let s = raw as any;
  if (typeof s?.version !== 'number') return Err('corrupt');
  if (s.version > CURRENT_VERSION) return Err('newerVersion');
  for (const m of MIGRATIONS) if (s.version === m.from) s = m.migrate(s);
  if (s.version !== CURRENT_VERSION) return Err('migrationGap');
  if (!validateSave(s)) return Err('invalid');
  return Ok(s as SaveFile);
}
```

Rules:
- **Every schema change bumps the version and adds a migration.** No exceptions, even in early development. The habit is what matters.
- Migrations are pure functions with unit tests using checked-in fixture saves at every historical version (`test/fixtures/saves/v1.json` … ). These fixtures are permanent artefacts; never delete them.
- Content ID renames are handled by an `ID_ALIASES` table applied during migration, never by editing the content table's key.
- **Generator version changes:** if `generatorVersion` differs, the world is regenerated with the new generator and the delta is re-applied. Structures are placed by world coordinates, so a changed terrain height re-flattens under them. Nodes whose position no longer exists are dropped; nodes that are new are added fresh. A "the island has shifted slightly" notice is shown. Test this path deliberately — it will be needed.

## 6. Corruption handling

- Checksum mismatch → try the most recent backup; if that fails, walk back through all backups; if all fail, offer export of the raw bytes for manual recovery and start a new island rather than silently discarding.
- Partial validation: if a single entity fails validation, drop that entity and continue with a logged warning, rather than failing the whole load. Cozy games should degrade, not refuse.
- Never delete a save file automatically. Ever.

## 7. Multiplayer (Phase 7)

- The **server** owns the save. Its store is SQLite: one row per island with the same gzipped JSON blob, plus columns for indexing (island id, owner, updated_at).
- A single-player island can be uploaded to become a hosted island (`players` map gains entries; the existing player becomes the owner).
- A hosted island can be exported back to single player.
- Client-side saves in multiplayer sessions are **not authoritative**; the client keeps only a cached snapshot for fast reconnect and its own settings.
- Per-player data (inventory, journal, unlocks) is keyed by a stable player key so visitors keep their own progress across islands.

## 8. Implementation steps

1. Schema v1 covering world meta + player + inventory. Save/load round-trip test.
2. IndexedDB wrapper with promise API, error mapping, quota handling.
3. Worker-based compress/decompress; verify-before-promote; backup rotation.
4. Autosave scheduler with idle deferral and the HUD indicator.
5. Node delta persistence; structure persistence; terrain modification persistence.
6. Farm tiles, journal, fragments, records, world items, befriended animals.
7. Migration framework + fixtures + the first deliberate version bump as a test.
8. Export/import to file, with validation and a confirmation dialog on import.
9. Corruption paths: backup fallback, partial entity drop, raw export.
10. Generator-version regeneration path.
11. Offline catch-up hand-off to `20_DAY_NIGHT_SYSTEM.md` §6.

## 9. Testing requirements

- **Round-trip property test:** generate 500 random world states (random structures, inventories, farm tiles, node states), save, load, assert `worldHash()` is identical. Run in CI.
- Unit: every migration from every historical fixture produces a valid current-version save. This test grows forever and is the most valuable test in the file.
- Unit: checksum detects single-bit corruption in 100% of 10,000 trials.
- Integration: save interrupted mid-write (simulated IndexedDB failure) leaves the previous save loadable.
- Integration: quota exceeded is handled with a clear message and no data loss.
- Integration: a 4,000-structure island saves in ≤ 60 ms total main-thread time and produces a file under 1.5 MB.
- Integration: export → import on a different browser profile reproduces the island exactly.
- Manual checklist: kill the tab at 20 random moments during play; every time, the island loads with at most 4 in-game hours lost.

## 10. Future expansion

- Cloud saves (would require accounts; deliberately out of scope at 1.0).
- A save browser with screenshots and playtime per slot.
- "Time capsule" snapshots the player can take manually and revisit read-only — a lovely feature for a game about a place changing over time.
- Incremental/dirty-region saving if snapshot cost ever exceeds budget.
