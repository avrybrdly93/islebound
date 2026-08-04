# 38 — Server Operations & Persistence

Purpose: running the Phase 7 multiplayer server as a solo operator — persistence details, room lifecycle at the fleet level, capacity, backups, and the runbook. Complements `30_DEPLOYMENT.md` (how it deploys) and `36` (how it works).

---

## 1. Operating philosophy

One person operates this. Therefore: **boring technology, few moving parts, everything restartable, nothing that pages at 3 a.m. for a game about being calm.** A full outage of multiplayer degrades the product to… a complete single-player game. That is the safety net; design for it (clear client messaging, local-cache play, easy export).

## 2. Persistence

- **SQLite via `better-sqlite3`**, WAL mode, one database file per Fly volume.
- Schema:

```sql
CREATE TABLE islands (
  id TEXT PRIMARY KEY,            -- 8-byte id, base32
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,             -- validated (31 §2.3)
  region TEXT NOT NULL,           -- fly region affinity
  save BLOB NOT NULL,             -- gzipped JSON, same format as SP saves
  save_version INTEGER NOT NULL,
  join_code TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE players (
  player_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  banned_islands TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE undo_log (
  island_id TEXT NOT NULL,
  at_tick INTEGER NOT NULL,
  actor_key TEXT NOT NULL,
  action BLOB NOT NULL,           -- packed structure change
  PRIMARY KEY (island_id, at_tick, actor_key)
);
CREATE INDEX undo_by_island ON undo_log(island_id, at_tick);
```

- Write policy: a room saves its island **every 60 s of active play, on the last player leaving, and on graceful shutdown** — debounced, serialised in a worker thread, written in a transaction. The 60 s cadence bounds loss on a crash to one minute.
- The undo log is pruned to 7 days nightly.
- Migration of the `save` blob reuses the client's migration chain (`23` §5) — one migration codebase, imported from shared.

## 3. Capacity model

Per Fly machine (shared-cpu-2x, 512 MB):

| Metric | Budget |
|---|---|
| Active rooms | 8–10 (≤ 2 ms tick each) |
| Hibernated islands | thousands (rows, not memory) |
| Concurrent players | ~60 |
| Memory | world ≈ 8–20 MB per active room |

Scaling is horizontal and manual at first: add a machine to a region when p99 tick > 8 ms sustained. A tiny router service maps `islandId → region/machine`; it is a single stateless process reading the `islands.region` column, cacheable, and its unavailability only blocks *new* joins.

## 4. Room lifecycle (fleet view)

```
cold (row only) ──join──► loading (read+migrate+hydrate ≤ 1.5 s)
      ▲                        │
      │                        ▼
   hibernate ◄──60 s empty── active ──crash──► supervisor restarts process,
   (save+free)                                  rooms rehydrate on next join;
                                                clients auto-reconnect (36 §5)
```

The process is stateless between saves by design: `kill -9` at any moment loses ≤ 60 s. This property is tested (chaos test, `36` §11), not assumed.

## 5. Backups

- Hourly: `VACUUM INTO` a dated snapshot, gzip, upload to Cloudflare R2. Retention 30 days daily + 6 months weekly.
- On every deploy: a pre-deploy snapshot.
- **Quarterly restore drill** into a scratch app, load three random islands, walk around. Logged in `34_DEVELOPMENT_LOG.md`. An untested backup is a hope, not a backup.

## 6. Observability

- `/healthz` (liveness: event loop lag < 200 ms, db writable) and `/metrics` (rooms, players, tick p50/p99, bytes in/out, errors, save durations).
- Logs: structured JSON to stdout → Fly logs. No player text in logs beyond island ids.
- Alerts (email is fine at this scale): health failing 3×, tick p99 > 25 ms for 10 min, save failures, backup job failure, disk > 80%.

## 7. Runbook (the whole thing)

| Symptom | Action |
|---|---|
| Server down | `fly status`; restart; if bad deploy → `fly releases rollback`. Clients reconnect themselves |
| One island corrupt | restore that row from the latest hourly snapshot (`sqlite3` attach + copy); owner loses ≤ 1 h |
| Disk filling | prune undo_log, verify snapshot rotation, grow volume |
| Tick p99 high | `/metrics` per-room timings → hibernate the outlier room (it saves first), investigate its save offline with `pnpm sim --fixture` |
| Abuse report | inspect report payload, ban player_key from island, rotate join code |
| Region overloaded | add a machine, update router weights |

Everything above is a ≤ 10-minute operation. If an incident ever isn't, that is a backlog item to make it one.

## 8. Cost envelope

3 regions × 1 machine + volumes + R2 ≈ **$15–25/month** at launch scale. The game must not create obligations that outgrow a hobby budget until player numbers justify it; the hibernation model is what makes this hold.

## 9. Testing requirements

- Crash-loss bound: scripted play, `SIGKILL` at random points ×50, rehydrate, assert ≤ 60 s of progress lost and zero item-conservation violations.
- Migration-on-load: fixture rows at every historical save version load into a room correctly.
- Restore drill automation: the quarterly drill is a script, and the script itself runs monthly in CI against a synthetic backup.
- Load test: 10 rooms × 4 scripted clients on one machine profile stays within the capacity table.

## 10. Future expansion

- LiteFS/Litestream continuous replication if the 60 s loss bound ever feels too loose.
- Postgres only if multi-writer access is ever genuinely needed (it is not, per-island).
- An owner dashboard page (island stats, join code management, undo log browser) — flagged as the first thing to build *after* Phase 7 core, since it removes most operator involvement in support.
