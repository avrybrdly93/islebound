# @halcyon/server

Placeholder. This package activates in **Phase 7 — Multiplayer** (see `docs/03_FEATURE_ROADMAP.md`, `docs/36_MULTIPLAYER_ARCHITECTURE.md`).

It will be a Node 22 + `ws` authoritative server (`docs/04_TECHNICAL_ARCHITECTURE.md` §3) that imports `sim/` from `@halcyon/client` via a workspace path alias — possible only because `sim/` has zero browser dependencies. Until Phase 7 opens, this directory intentionally contains nothing but this file: no `package.json`, so it is not yet a pnpm workspace member.

Planned layout (`docs/05_CODEBASE_STRUCTURE.md` §4):

```
packages/server/src/
├── index.ts            # http + ws bootstrap
├── Room.ts              # one island: world, tick loop, clients
├── net/                 # codec, connection, rate limiting
├── auth/                # join codes, session tokens
├── persistence/         # SQLite adapter, snapshots, migrations
└── admin/                # health, metrics, room list
```
