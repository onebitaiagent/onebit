# AI Game Studio — Concept & Execution Plan

> A next-generation game development pipeline where coordinated AI agent swarms build, test, and ship games autonomously.
>
> Built on lessons from ONEBIT + powered by Claude-Flow multi-agent orchestration.

---

## The Vision

**What if a game studio had no humans writing code?**

ONEBIT proved the concept: 6 AI agents built a playable canvas game with 47+ modules through blind consensus review. But it hit real limits — performance, quality control, module sprawl, no shared intelligence between agents.

**AI Game Studio** is the evolution: a production-grade pipeline using Claude-Flow's 60+ coordinated agents with shared memory, self-learning, and smart cost optimization to produce polished, shippable browser games.

---

## Why Claude-Flow Changes Everything

### What ONEBIT Had (and where it broke)

| Problem | ONEBIT Reality | Claude-Flow Solution |
|---------|---------------|---------------------|
| Agents work in isolation | Each agent wrote modules independently, causing 6 duplicate collision systems | **Shared vector memory** — agents see what others built, no duplication |
| No quality feedback loop | Agents approved bad code (misleading names, broken modules) | **Self-learning ReasoningBank** — patterns that cause crashes get flagged automatically |
| Expensive API calls | Every module generation costs ~$0.025 via Claude | **Agent Booster (WASM)** handles simple transforms at $0, smart routing uses Haiku vs Opus appropriately — **75% cost reduction** |
| Sequential work | One agent proposes, waits for review, waits for vote | **Parallel swarms** — planner, coder, tester, reviewer all run simultaneously |
| No performance awareness | 47 modules with no frame budget, game runs slowly | **Dedicated performance agent** monitors frame time, auto-disables expensive modules |
| No memory between deploys | Railway resets all data, agents re-learn from zero | **Persistent knowledge graph** — learnings survive across runs and projects |

### Claude-Flow Architecture for Games

```
┌─────────────────────────────────────────────────────┐
│                    QUEEN AGENT                       │
│         (Game Director — plans, prioritizes)         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ ARCHITECT│ │ GAMEPLAY │ │  ART/VFX │           │
│  │  Agent   │ │  Agent   │ │  Agent   │           │
│  │          │ │          │ │          │           │
│  │ Engine   │ │ Mechanics│ │ Visuals  │           │
│  │ Systems  │ │ Balance  │ │ Polish   │           │
│  │ Perf     │ │ Fun      │ │ Juice    │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │            │            │                   │
│  ┌────┴────────────┴────────────┴────┐             │
│  │        SHARED VECTOR MEMORY        │             │
│  │  (patterns, frame budgets, rules)  │             │
│  └────┬────────────┬────────────┬────┘             │
│       │            │            │                   │
│  ┌────┴─────┐ ┌────┴─────┐ ┌───┴──────┐           │
│  │  TESTER  │ │ REVIEWER │ │ SECURITY │           │
│  │  Agent   │ │  Agent   │ │  Agent   │           │
│  │          │ │          │ │          │           │
│  │ Playtests│ │ Quality  │ │ Scanning │           │
│  │ Perf     │ │ Dupes    │ │ Audit    │           │
│  │ Regress  │ │ Accuracy │ │ Safety   │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  AUDIO   │ │ NARRATOR │ │  GROWTH  │           │
│  │  Agent   │ │  Agent   │ │  Agent   │           │
│  │          │ │          │ │          │           │
│  │ SFX      │ │ Story    │ │ Social   │           │
│  │ Music    │ │ Dialogue │ │ Analytics│           │
│  │ Spatial  │ │ Lore     │ │ Viral    │           │
│  └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────┘
```

---

## Execution Plan

### Phase 1: Foundation (Week 1)

**Goal**: Set up Claude-Flow with game-specific agent roles and shared memory.

```bash
# Install Claude-Flow
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash -s -- --full

# Initialize project
npx ruflo@alpha init --wizard
```

**Configure agent swarm:**
- **Queen (Game Director)**: Plans sprints, assigns tasks, resolves conflicts, maintains game design doc
- **Architect Agent**: Engine systems (renderer, ECS, spatial hash, camera, input). Owns performance budget.
- **Gameplay Agent**: Mechanics (combat, progression, spawning, difficulty). Owns fun.
- **Art/VFX Agent**: Visual effects, post-processing, particles, UI. Owns frame cost per effect.
- **Audio Agent**: Web Audio synthesis, spatial audio, music generation.
- **Tester Agent**: Automated playtesting, performance profiling, regression detection.
- **Reviewer Agent**: Code quality, duplicate detection, naming accuracy, integration testing.
- **Security Agent**: Pattern scanning, sandbox enforcement, audit trail.
- **Growth Agent**: Social media content, analytics hooks, sharing features.

**Shared memory seeds (from ONEBIT lessons):**

```json
{
  "performance_rules": {
    "max_offscreen_canvases": 4,
    "frame_budget_ms": 14,
    "max_particles": 300,
    "max_entities": 50,
    "require_frame_cost_estimate": true
  },
  "quality_rules": {
    "no_duplicate_systems": true,
    "name_must_match_function": true,
    "max_module_size_chars": 10000,
    "require_cleanup_on_disable": true
  },
  "game_design": {
    "controls": "WASD move, SPACE absorb/attack, E shield",
    "progression": "absorb particles → stage evolution → boss encounters",
    "visual_style": "dark void, neon glow, pixel art at core",
    "audio_style": "procedural synthesis, no sample files"
  }
}
```

### Phase 2: Core Engine (Week 2)

**Architect agent builds (with tester agent validating each):**

1. **Render Pipeline** — Single shared render system instead of 47 independent modules drawing whenever they want. Layers: background → world → entities → effects → HUD.
2. **Performance Monitor** — Tracks frame time per system. Auto-disables expensive effects when below 30fps. Reports back to shared memory.
3. **Module Budget System** — Each module declares its render cost tier (cheap/medium/expensive). Total budget enforced.
4. **Persistent State** — Use Supabase or Turso for game state that survives deploys.

### Phase 3: Game Content (Weeks 3-4)

**Gameplay + Art + Audio agents work in parallel:**

- Gameplay: enemy variety, boss patterns, power-ups, progression curve
- Art: unified VFX pipeline, particle pooling, efficient post-processing
- Audio: full SFX library, ambient music generation, spatial audio

**Key difference from ONEBIT**: Agents share memory. When Gameplay creates a new enemy type, Art agent automatically knows to create its visual, Audio agent creates its sound, Tester agent creates its test case.

### Phase 4: Polish & Ship (Weeks 5-6)

- Mobile touch controls (finally)
- Title screen, tutorial, pause menu
- Leaderboard (Supabase backend)
- Social sharing (screenshot → Twitter)
- Performance auto-quality (tester agent profiles on low-end devices)

---

## Cost Model

### ONEBIT Costs (baseline)

| Item | Cost |
|------|------|
| Claude API (module generation) | ~$0.025/module × 60+ modules = ~$1.50 |
| Claude API (reviews, content) | ~$0.01/call × 200+ calls = ~$2.00 |
| Railway hosting | $5/month |
| Twitter API | Free tier |
| **Total per cycle** | **~$8.50** |

### Claude-Flow Optimized

| Item | Cost | Savings |
|------|------|---------|
| Agent Booster (simple edits) | $0 (WASM, no API) | -30% of calls |
| Smart routing (Haiku for simple, Opus for complex) | ~$0.80 | -60% |
| ReasoningBank cache hits | $0 (pattern reuse) | -20% |
| Persistent memory (no re-learning) | $0 (shared context) | -15% |
| **Total per cycle** | **~$2.50** | **~70% savings** |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Orchestration** | Claude-Flow (ruflo) | 60+ agents, shared memory, self-learning |
| **Game Engine** | Canvas 2D + custom ECS | Lightweight, browser-native, no dependencies |
| **Backend** | Express.js on Railway | Simple, cheap, proven with ONEBIT |
| **Database** | Supabase (PostgreSQL) | Free tier, persistent, real-time |
| **Frontend** | React + Vite | Fast builds, SPA |
| **Audio** | Web Audio API | Procedural synthesis, no asset files |
| **Social** | Twitter API v2 | Automated content from agents |
| **CI/CD** | GitHub Actions + Railway | Auto-deploy on push |

---

## Lessons from ONEBIT (Do NOT Repeat)

### 1. Never let agents create modules without a performance budget
ONEBIT agents created 14 modules with offscreen canvases, 6 duplicate collision systems, and a post-processing stack that tanked FPS. **Every module must declare its frame cost.**

### 2. Shared memory prevents duplicate work
Without shared context, 3 agents independently built collision detection. Claude-Flow's vector memory means Agent B knows what Agent A already built.

### 3. Module names must match module behavior
"Dynamic Directional Audio Spatial Cues System" had zero audio code. **Reviewer agent must verify name matches implementation.**

### 4. Don't claim features that don't exist
The website listed "mobile controls", "skill tree", "leaderboard" — none existed. **Growth agent only promotes verified features.**

### 5. Data persistence is non-negotiable
Every Railway deploy wiped all state, causing tweets with "0 agents" and agents re-learning from scratch. **Use a real database.**

### 6. Performance testing must be automated
Nobody noticed the game was slow until a human played it. **Tester agent must profile frame times after every change.**

### 7. Boss/progression design needs intentionality
ONEBIT had no boss, no stage progression, no way to attack enemies — until manually injected. **Game Director (queen agent) must maintain a design doc that all agents reference.**

### 8. Tweet safety nets save embarrassment
Three independent tweet sources all posted "0 agents" after deploy. **Always filter outbound content for empty-data patterns.**

---

## Repository Structure (Proposed)

```
ai-game-studio/
├── .claude-flow/          # Claude-Flow agent configs
│   ├── swarm.yaml         # Agent roles, topology, consensus rules
│   ├── memory-seeds/      # Initial shared knowledge
│   └── performance.yaml   # Frame budgets, cost tiers
├── engine/                # Shared game engine (render pipeline, ECS, input)
├── modules/               # Agent-generated game modules (versioned)
├── server/                # Express.js backend
├── web/                   # React frontend / landing page
├── tests/                 # Automated tests (playwright for game, jest for API)
├── docs/                  # Auto-generated from agent memory
├── CLAUDE.md              # Project rules for all Claude instances
└── package.json
```

---

## CLAUDE.md (for the new project)

```markdown
# AI Game Studio — CLAUDE.md

## Project
AI-powered game development pipeline. Agents build browser canvas games through coordinated swarms.

## Tech
- Claude-Flow for multi-agent orchestration
- Canvas 2D game engine with ECS architecture
- Express.js backend on Railway
- Supabase for persistent state
- Web Audio API for procedural audio
- React + Vite frontend

## Rules
- Every module must declare a frame cost tier (cheap/medium/expensive)
- Max 10 offscreen canvases active at once
- Max 12,000 chars per module
- No fetch(), eval(), require() in game modules
- Module names must accurately describe what the code does
- Reviewer agent must verify no duplicate systems exist before approving
- Tester agent must confirm <16ms frame time after each merge
- Never tweet metrics that could be zero (guard all outbound content)
- All game state persists to Supabase — no ephemeral JSON files

## Deploy
git push origin main && railway up

## Key Files
- engine/renderer.js — shared render pipeline (background → world → entities → fx → HUD)
- engine/ecs.js — entity component system
- engine/performance.js — frame budget monitor, auto-quality
- server/src/services/game-evolution.ts — module registration and validation
- .claude-flow/swarm.yaml — agent roles and topology
```

---

## Getting Started (for a new Claude instance)

1. **Read this document** and `CONTINUITY.md`
2. **Install Claude-Flow**: `curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash -s -- --full`
3. **Clone ONEBIT for reference**: The game engine template in `server/src/services/game-evolution.ts` → `assembleGameHTML()` is the starting point
4. **Set up the new repo** with the structure above
5. **Configure swarm.yaml** with the 9 agent roles defined above
6. **Seed shared memory** with ONEBIT lessons (performance rules, quality rules, game design)
7. **Start the queen agent** — it plans the first sprint based on the design doc
8. **Let agents build** — monitor via Claude-Flow dashboard

---

## The Pitch

> We built a game with 6 AI agents. It worked — but they stepped on each other, duplicated work, and had no quality memory.
>
> Now imagine 60 agents that share a brain, learn from every mistake, and cost 75% less to run.
>
> That's not a game. That's a game studio.

---

## References

- **ONEBIT Codebase**: `c:\Users\Josh\Videos\one pixel\onebit-bundle\`
- **ONEBIT Continuity**: `CONTINUITY.md` (same directory)
- **Claude-Flow**: `https://github.com/ruvnet/claude-flow`
- **Claude-Flow Docs**: See repo README for swarm config, agent types, memory setup
- **Railway**: `https://railway.com` (current hosting)
- **Supabase**: `https://supabase.com` (recommended for persistence)
