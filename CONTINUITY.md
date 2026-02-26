# ONEBIT — Continuity Document

> Last updated: 2026-02-26
> For resuming development or handing off to a new Claude instance.

---

## What This Is

ONEBIT is an AI-built browser canvas game where 6 autonomous Claude-powered agents write, review, and vote on every line of code through a blind consensus system. The game starts as 1 green pixel and evolves as agents add modules (now 47 active). It runs on Railway with a React landing page and Express.js backend.

## Live URLs

| Resource | URL |
|----------|-----|
| **Game (playable)** | `https://adequate-dedication-production-2dfd.up.railway.app/api/game/play` |
| **Website** | `https://adequate-dedication-production-2dfd.up.railway.app/` |
| **Admin Dashboard** | `https://adequate-dedication-production-2dfd.up.railway.app/api/admin/dashboard` |
| **GitHub Repo** | `https://github.com/onebitaiagent/onebit` |
| **Twitter/X** | `@OneBitAIagent` |

## Admin Credentials

- **Admin Key**: `admin-62936721aad29fe171952ca256b869ddd55887d7b166319ea90f778d74292056`
- **Header**: `X-Admin-Key: <key>`

## Admin API Cheat Sheet

```bash
BASE=https://adequate-dedication-production-2dfd.up.railway.app
KEY="admin-62936721aad29fe171952ca256b869ddd55887d7b166319ea90f778d74292056"

# Export all data (modules, proposals, agents, audit log)
curl -s "$BASE/api/admin/data/export" -H "X-Admin-Key: $KEY"

# Patch a module's code or order
curl -X PATCH "$BASE/api/admin/modules/<id>" -H "X-Admin-Key: $KEY" -H "Content-Type: application/json" -d '{"code":"...","order":50}'

# Inject a new module
curl -X POST "$BASE/api/admin/modules/inject" -H "X-Admin-Key: $KEY" -H "Content-Type: application/json" -d '{"name":"...","description":"...","code":"...","order":50}'

# Archive a broken module
curl -X POST "$BASE/api/admin/modules/<id>/archive" -H "X-Admin-Key: $KEY"

# Send a test tweet
curl -X POST "$BASE/api/admin/test-tweet" -H "X-Admin-Key: $KEY" -H "Content-Type: application/json" -d '{"text":"..."}'

# Check tweet stats
curl "$BASE/api/admin/tweet-stats" -H "X-Admin-Key: $KEY"

# Check current phase
curl "$BASE/api/dashboard/phase"

# Get game evolution data
curl "$BASE/api/game/evolution"
```

## Deployment

**CRITICAL**: `git push origin main` does NOT auto-deploy on Railway. You must also run:

```bash
cd onebit-bundle
git push origin main
railway up
```

Both commands are required. `railway up` triggers the actual build.

- **Builder**: Nixpacks
- **Start command**: `cd server && npm start`
- **No persistent volume** — all data (proposals, agents, modules) resets on every deploy. Module code survives because agents re-create them, but counters/state reset.

## Architecture

```
onebit-bundle/
├── server/          # Express.js backend (TypeScript → dist/)
│   ├── src/
│   │   ├── services/
│   │   │   ├── game-evolution.ts   # Module system, assembleGameHTML(), validation
│   │   │   ├── live-agents.ts      # 6 autonomous AI agents, phase system
│   │   │   ├── x-bot.ts            # Twitter/X integration
│   │   │   ├── ai-client.ts        # Claude API calls (Haiku for generation)
│   │   │   ├── consensus-engine.ts # Proposal lifecycle
│   │   │   ├── audit-log.ts        # Hash-chained audit trail
│   │   │   └── message-bus.ts      # Event system
│   │   ├── routes/
│   │   │   ├── admin.ts            # Admin API endpoints
│   │   │   └── dashboard.ts        # Public dashboard API
│   │   ├── data/
│   │   │   └── store.ts            # JSON file-based data store
│   │   └── index.ts                # Server entry point
│   └── scripts/
│       ├── copy-data.cjs           # Copies seed JSON to dist/
│       └── build-promo.cjs         # Generates promo.html
├── web/             # React + Vite frontend
│   └── src/App.jsx  # Single-file React app (landing page)
└── promo.html       # Generated standalone promo page
```

## Game Module System

### How Modules Work

Modules are JavaScript functions registered via `registerModule("Name", function(g) { ... })`. They receive a shared game state object `g` with:

- **Canvas**: `g.ctx`, `g.canvas`, `g.W`, `g.H`
- **Player**: `g.px`, `g.py`, `g.vx`, `g.vy`, `g.speed`
- **State**: `g.score`, `g.absorbed`, `g.stage`, `g.tick`, `g.keys`
- **Collections**: `g.particles`, `g.entities`
- **Utilities**: `g.rand(min,max)`, `g.lerp(a,b,t)`, `g.dist(a,b)`
- **Module state**: Each module stores its own state on `g` (e.g., `g._boss`, `g._shield`, `g._audio`)

### Execution Order

Modules sorted by `order` ascending, then **executed in reverse** (highest order runs first, lowest drawn on top). The pixel is always drawn last.

Error isolation: each module runs in a try/catch. Crashes auto-revert the module (removed from game loop), logged to `window._onebitErrors`.

### Validation Rules (server-side)

- `new Function()` syntax check
- Forbidden: `eval()`, `fetch()`, `XMLHttpRequest`, `import()`, `require()`, `document.cookie`, `localStorage`
- Max 12,000 characters per module

### Current Active Modules (47, as of 2026-02-26)

| Order | Name | Purpose |
|-------|------|---------|
| 3 | Audio Engine | Web Audio API SFX synthesis (`g._audio.play()`) |
| 5 | Stage Evolution | Converts `g.absorbed` → `g.stage` via thresholds |
| 6 | Combat System | Absorption field damages enemies, kill popups, controls hint |
| 7 | Boss System | Boss spawns at stage 3+, projectiles, defeat mechanic |
| 8 | Health System | 5 HP, invincibility frames, death/respawn |
| 10 | Movement Trail | Visual trail behind player |
| 10 | Ambient Starfield | Background stars |
| 15 | Orbit Particles | Particles orbiting player |
| 20 | Score HUD | Score display |
| 25 | Background Grid | Grid overlay |
| 30 | Floating Particle Spawner | Spawns absorbable particles |
| 40 | Score Streak | Streak multiplier |
| 50 | Combo Chain System | Combo counter |
| 55 | Absorption Field | SPACE = pull particles toward player |
| 60 | Pixel Bloom Pulse | Pulsing glow effect |
| 65 | Pixel Dust | Particle effects on collision |
| 70 | Absorption Burst VFX | Visual burst on absorb |
| 75 | Pixel Glow Effect | Player glow |
| 80 | Enemy AI Spawner | Spawns chase enemies, collision, death |
| 85 | Shield Mechanic | E = hexagonal shield, 3 hits |
| 92 | Screen Shake VFX | Camera shake on impacts |
| 95 | Mini-Map | Corner navigation indicator |
| 100 | Camera System | Smooth follow camera |
| 105 | Delta-Time Normalizer | Frame-rate independent timing |
| 110 | Spatial Hash | Collision grid optimization |
| 115 | Entity Component System | ECS architecture |
| 120+ | (20+ more visual/engine modules) | Bloom, CRT, lighting, parallax, etc. |

## Known Issues & Lessons Learned

### Performance (CRITICAL)
- **The game runs too slowly with 47+ modules**. Each module runs every frame with no LOD or culling. Many create offscreen canvases (`document.createElement('canvas')`) — 14 modules do this.
- Post-processing stack is brutal: bloom + CRT + lighting + distortion + compositing = multiple full-screen passes per frame.
- **Root cause**: Modules are independent — no shared render pipeline, no batching, no performance budget.

### Data Persistence
- Railway has NO persistent volume. All JSON data stores reset on deploy.
- Module code survives because agents regenerate it, but proposals/agents/audit log are lost.
- Tweet counters reset, causing burst of tweets after deploy.

### Agent Module Sprawl
- Agents autonomously create modules. Started at 33, grew to 64+ within hours.
- Many duplicates (6 collision modules, 2 lighting, 2 minimap).
- Modules claim features they don't implement (e.g., "Audio Spatial Cues" was purely visual).
- No quality gate beyond syntax validation — agents approve each other's work.

### Twitter/X Bot
- THREE independent tweet sources: `x-bot.ts` (scheduled), `simulation.ts` (mock posts), `live-agents.ts` (AI-generated).
- All three needed separate empty-data guards.
- Safety net added in `postTweet()` — regex blocks tweets with "0 agents", "0 proposals", etc.
- Daily cap: 20 tweets/day.

### Game Design Gaps
- No boss existed until manually injected.
- `g.stage` was read by 17 modules but written by NONE — game was stuck at stage 0.
- Combat was unclear — absorption field didn't damage enemies, only pulled particles.
- No audio engine existed — modules called `g._audio.play()` into the void.
- Website claimed features that didn't exist (mobile controls, skill tree, leaderboard).

## What Worked Well

1. **Module isolation** — crash one module, rest of game continues. Auto-revert is solid.
2. **Consensus system** — blind peer review + voting + audit chain is a real governance model.
3. **The pixel-to-game narrative** — compelling story for social media and promo.
4. **Admin API** — inject/archive/patch modules instantly without deploy. Powerful for debugging.
5. **Event-driven tweets** — merge events, milestone tweets work well when data exists.

## What Needs Fixing (if continuing)

1. **Performance**: Need a render budget system. Modules should declare cost (low/med/high). Frame time monitoring should disable expensive modules dynamically.
2. **Persistent storage**: Add Railway volume or use external DB (Supabase, Turso, etc.).
3. **Module quality**: Agents need stricter review criteria — check for duplicates, test integration, measure frame time impact.
4. **Mobile**: No touch controls at all. Game is desktop-only.
5. **Onboarding**: No title screen, no tutorial flow, no pause menu.

---

## For the Next Instance

If resuming this project, start by:
1. Reading this doc
2. `curl $BASE/api/admin/data/export -H "X-Admin-Key: $KEY"` to see current state
3. Check `window._onebitErrors` in browser console for crashed modules
4. Check tweet stats to see bot health
5. Review the last few git commits for recent changes
