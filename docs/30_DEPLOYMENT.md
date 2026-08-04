# 30 — Deployment

Purpose: how the game gets from a commit to a player's browser, how the multiplayer server is hosted, and how releases are versioned and rolled back.

---

## 1. Targets

| Component | Host | Why |
|---|---|---|
| Client (static) | **Cloudflare Pages** | free tier permits commercial use, global edge CDN, unlimited bandwidth, atomic deploys with instant rollback |
| Multiplayer server (Phase 7) | **Fly.io** | cheap small VMs, regional placement near players, persistent volumes for SQLite, WebSocket support |
| Assets | served from Cloudflare Pages alongside the client | one origin, no CORS, cache-friendly hashed filenames |
| Domain | registrar of choice; DNS on Cloudflare | |

Rejected: Vercel's Hobby tier (prohibits commercial use), Netlify (bandwidth caps), GitHub Pages (no headers control, no server).

## 2. Environments

| Env | Branch | URL | Purpose |
|---|---|---|---|
| Production | `main` (tagged) | `play.halcyonisle.com` | players |
| Staging | `main` (every merge) | `staging.halcyonisle.com` | pre-release verification |
| Preview | any PR | `pr-123.halcyonisle.pages.dev` | review builds, auto-created |
| Local | — | `localhost:5173` | development |

Preview deployments per PR are the single most useful CI feature for this project: a human can click a link and *play* an agent's change before approving it.

## 3. Build

```bash
pnpm install --frozen-lockfile
pnpm assets:validate
pnpm build            # vite build → dist/
pnpm check:bundle     # budget assertions
```

Output:
- `dist/index.html` — no-cache
- `dist/assets/*.[hash].js|css` — immutable, 1 year cache
- `dist/assets/models|textures|audio/*.[hash].*` — immutable, 1 year cache
- `dist/manifest.[hash].json` — short cache (5 min)

Source maps are generated and uploaded to the error reporter, but **not** served publicly (`sourcemap: 'hidden'`).

## 4. Headers and caching

`public/_headers` (Cloudflare Pages syntax):

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.halcyonisle.com wss://*.halcyonisle.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate
```

`wasm-unsafe-eval` is required by Rapier. Everything else is locked down. If a `SharedArrayBuffer` path is ever added, COOP/COEP headers come with it — note that this would break some third-party embeds, so it is not enabled by default.

## 5. Client deployment workflow

`.github/workflows/deploy.yml`:

```
on: push to main
steps:
  - checkout, setup pnpm + node 22, install
  - pnpm ci:quick   (typecheck, lint, unit)
  - pnpm build
  - pnpm check:bundle
  - upload source maps to error reporter
  - deploy to Cloudflare Pages (production)
  - smoke test the deployed URL with Playwright (boot + 120 frames)
  - on smoke failure: automatic rollback to the previous deployment
```

Trunk-based: `main` is production. There is no staging environment and no tag-triggered deploy. Agents work on `phase-N/*` branches and open PRs, which preserves the two things that matter — the CI gate and a playable preview URL — without a second environment to maintain. Cloudflare Pages creates a preview deployment per PR automatically on the same project.

Cloudflare Pages keeps every deployment; rollback is a one-click (or one-API-call) operation and takes effect globally in seconds. **Rollback is the primary incident response**, and with no staging tier it is the only one — which is why the smoke test is a blocking step rather than a notification.

## 6. Versioning and releases

- Semantic-ish: `0.MINOR.PATCH` during development; `1.0.0` at launch.
- A release is a git tag `v0.7.0` marking a phase completion, plus a GitHub Release with notes generated from conventional commits and hand-edited for players. **Tags are records, not deploy triggers** — every merge to `main` is already live.
- The build embeds `__APP_VERSION__` and `__COMMIT_SHA__`; both are shown in the settings screen and attached to error reports.
- Save compatibility is checked **at every phase boundary** rather than at release time: load a save from the previous phase tag and from the oldest supported version. Because deploys are continuous, this check lives in the phase-closing checklist in `tasks/phase_N_*.md`.
- Players are notified of an update by a polling check of `manifest.json` every 10 minutes; a gentle "a new version is available — reload when you're ready" toast, never a forced reload mid-session. This matters more under continuous deploy than it would with staged releases, since a player mid-session will see new versions ship often.

## 7. Server deployment (Phase 7)

`.github/workflows/deploy-server.yml`:

```
on: release tag
steps:
  - build docker image (node:22-alpine, pnpm deploy --filter server)
  - run server test suite inside the image
  - flyctl deploy --strategy rolling
  - health check /healthz
  - on failure: flyctl releases rollback
```

- One Fly app, machines in 2–3 regions initially (iad, ams, syd), each with a persistent volume for SQLite.
- **Room affinity:** a client is routed to the region where its island's data lives, via a small routing service that looks up island → region. Islands do not migrate between regions automatically.
- Protocol version is negotiated on connect; a client with a mismatched protocol version is told to reload. Servers support the previous protocol version for 7 days after a release to avoid kicking active sessions.
- Backups: SQLite is snapshotted to R2 object storage every hour and on deploy, with 30-day retention. Restore is documented and **practised once per quarter** — an untested backup is not a backup.

## 8. Monitoring and error reporting

- **Errors:** Sentry (self-hosted or the free tier), client and server. Source maps uploaded at build. PII-free: no player names, no positions, no save contents — only stack traces, version, browser, GPU string.
- **Crash context:** the last 200 log lines from the ring buffer and the last 20 sim events are attached, plus the current tick and seed. This makes most bugs reproducible from the report alone.
- **Client metrics (opt-in, anonymous, off by default):** boot time, average FPS, quality tier, crash rate. Nothing else. No behavioural analytics; it conflicts with the project's stance in `00_PROJECT_VISION.md` §4.
- **Server metrics:** rooms alive, players connected, tick duration p99, bandwidth per player, error rate. A simple `/metrics` endpoint plus Fly's built-in dashboards.
- Alerts: server error rate > 1%, tick p99 > 25 ms, health check failing, backup job failure.

## 9. Phase-closing checklist

Runs at every phase boundary. There is no separate release gate — `main` is continuously deployed, so this checklist is what "shipping" means here.

```
- [ ] All phase tasks closed; CURRENT_TASK.md shows no blockers
- [ ] Full CI green, including last night's soak
- [ ] The phase proof from 03_FEATURE_ROADMAP.md demonstrably works, with evidence
- [ ] Manual playtest checklist for the phase completed
- [ ] Save compatibility verified from the previous phase tag and the oldest supported version
- [ ] Bundle size and bench within budget
- [ ] Visual goldens reviewed
- [ ] Live smoke test passing against the production URL
- [ ] Rollback verified: previous deployment still restorable
- [ ] Release notes written for players, not for developers
- [ ] Phase retro and release entry added to 34_DEVELOPMENT_LOG.md
- [ ] Tag pushed: phase-N-complete
```

## 10. Implementation steps

1. Cloudflare Pages project, custom domain, `_headers`, preview deployments per PR.
2. `deploy-client.yml` with staging on merge.
3. Bundle budget check and asset validation in CI.
4. Sentry integration + source map upload + PII scrubbing.
5. Version embedding and the settings display.
6. Update-available polling and the toast.
7. Production tag workflow + smoke test + auto-rollback.
8. (Phase 7) Dockerfile, Fly app, volumes, health checks, rolling deploys.
9. (Phase 7) Region routing service and protocol version negotiation.
10. (Phase 7) SQLite backup to R2 + a documented, rehearsed restore.

## 11. Testing requirements

- The deployed staging URL passes the E2E suite after every deploy.
- The smoke test runs against the production URL after every production deploy, and triggers rollback on failure.
- A quarterly restore drill: restore a backup into a scratch Fly app and load an island from it.
- Header verification test: assert CSP and cache headers on the deployed site.
- A cold-load test from a clean cache measuring time-to-playable on a throttled 20 Mbps connection.

## 12. Future expansion

- Progressive Web App install with an offline service worker (single player works fully offline; this is a natural fit and mostly configuration).
- itch.io mirror for discoverability.
- A dedicated-server download so players can self-host an island.
- Steam wrapper via a lightweight web wrapper — only if there is demand; it changes the update and support model significantly.
