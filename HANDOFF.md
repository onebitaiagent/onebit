# ONEBIT — AI Collaborative Game Project
## Handoff Document for Claude Code

---

## What This Is

ONEBIT is a framework and experiment where multiple AI agents collaboratively build a production-quality game through **consensus-driven development**. The game starts from literally 1 pixel and evolves into something complex. The project includes:

1. **A skill framework** for orchestrating multi-agent game development with safety rails
2. **A playable game** (1-pixel origin → 9 evolution stages)
3. **A full website** (React) with game, docs, X feed, complexity analysis, and recruitment
4. **A consensus engine spec** preventing any single AI from going rogue

---

## Project Structure

```
onebit/
├── skill/                          # The AI Collaborative Game Skill
│   ├── SKILL.md                    # Main skill document (triggers, phases, workflow)
│   ├── scripts/
│   │   └── bootstrap.sh            # One-command project initializer
│   └── references/
│       ├── architecture.md         # System architecture, message protocol, CI/CD
│       ├── agent-roles.md          # 6 agent roles with capabilities & boundaries
│       ├── consensus-protocol.md   # Voting, blind review, anti-gaming, audit logs
│       └── marketing-playbook.md   # Go-to-market, viral mechanics, distribution
│
├── website/                        # The unified ONEBIT website (React)
│   └── onebit-site.jsx             # Single-file React app with 6 pages
│
├── game/                           # Standalone HTML game (also embedded in website)
│   └── onebit-game.html            # Full game in one HTML file
│
└── HANDOFF.md                      # This file
```

---

## What's Been Built

### 1. Skill Framework (`skill/`)
Complete skill for AI agents to collaboratively build games. Includes:
- **7 phases**: Bootstrap → Consensus Engine → Development Workflow → Game Design → Art/Audio → Marketing → Metrics
- **6 agent roles**: Architect, Gameplay, Art/UI, QA/Security, Narrative, Growth
- **Consensus engine spec**: Blind peer review, 67% approval threshold, security scanning, rate limiting, hash-chained audit logs, canary tests, human escalation
- **Bootstrap script**: Creates full project structure, git repo, consensus config, TypeScript/Phaser boilerplate, ECS core, initial tests, package.json, CI config

### 2. The Game (`game/onebit-game.html`)
A fully playable browser game that starts as 1 pixel:
- **Controls**: WASD/arrows to move, Space to absorb, E to evolve, R to restart
- **9 evolution stages**: Pixel → Spark → Mote → Wisp → Ember → Flame → Nova → Nebula → Singularity
- **Mechanics**: Absorption field, enemy AI (chases at stage 3+), death at stage 2+, particle trails, screen shake, evolution bursts
- **Tech**: Pure HTML/Canvas/JS, no dependencies, ~800 lines

### 3. Website (`website/onebit-site.jsx`)
Full React app (renders in Claude artifacts or any React environment) with 6 pages:

| Page | Purpose |
|------|---------|
| **Home** | Hero, live stats, latest X posts, quick-link cards |
| **Play** | Embedded playable game with full UI chrome |
| **How Far** | Complexity analysis — timeline (6 phases), 8 dimensions with realism scores |
| **X Feed** | @ONEBIT_ai agent dispatch — simulated X posts showing consensus activity |
| **Docs** | Living documentation with sidebar nav — auto-updated by agent team |
| **Join** | Recruitment flow — pick role, submit AI agent or human application |

**Fonts used**: Anybody (display), JetBrains Mono (mono), Playfair Display (editorial)
**Color palette**: `#00ffaa` (pixel green), `#ff3366` (accent red), `#7c3aed` (purple), `#04060f` (void), `#fbbf24` (gold)

---

## Complexity Ceiling (Honest Assessment)

The analysis covers what AI agents can realistically build:

| Phase | Timeline | Lines of Code | Comparable To |
|-------|----------|---------------|---------------|
| Origin | Day 1 | ~800 | Browser toy |
| Prototype | Week 1-2 | ~5K | Game jam entry |
| Alpha | Week 3-6 | ~20K | Vampire Survivors tier |
| Beta | Month 2-3 | ~50K | Agar.io + progression |
| Launch | Month 3-5 | ~120K | Among Us scale |
| Mature | Month 6-12 | ~300K+ | Live-service indie |

**Strongest dimensions**: Code Quality (95%), AI Content Gen (90%), Gameplay Depth (88%), Virality (85%)
**Weakest dimensions**: Monetization (65%), Multiplayer infra (70%), Audio (75%)

---

## What Needs Building Next

### Priority 1: Core Infrastructure
- [ ] **Actual consensus engine** — implement the proposal/review/vote system as a working Node.js service
- [ ] **Git integration** — protected branches, automated PR creation from proposals
- [ ] **Security scanner** — the regex pattern blocklist + AST analysis as a real CI check
- [ ] **Audit log service** — append-only, hash-chained, with a viewer dashboard

### Priority 2: Game Development
- [ ] **Port game to TypeScript/Phaser** — move from raw canvas to the proper ECS architecture
- [ ] **Sound design** — Howler.js integration, procedural SFX, adaptive music
- [ ] **More enemy types** — behavior trees, boss fights, enemy evolution
- [ ] **Procedural level generation** — biomes, terrain, environmental hazards
- [ ] **Save system** — localStorage → server-side for cross-device

### Priority 3: X Agent Bot
- [ ] **Build the @ONEBIT_ai posting bot** — auto-posts on: proposal merged, security block, agent disagreement, milestone hit, weekly stats
- [ ] **X API integration** — OAuth, tweet composition, media card generation
- [ ] **Event triggers** — webhook system that fires on consensus engine events
- [ ] **Share card generator** — auto-generate shareable images for milestones

### Priority 4: Website → Production
- [ ] **Deploy to Cloudflare Pages / Vercel** — set up CI/CD
- [ ] **Real X feed integration** — pull from X API instead of simulated data
- [ ] **Join form backend** — store applications, send confirmation emails
- [ ] **Discord integration** — bot that mirrors consensus events to Discord channels
- [ ] **Analytics** — PostHog or self-hosted for privacy-respecting tracking

### Priority 5: Community & Growth
- [ ] **Public development dashboard** — real-time agent activity visualization
- [ ] **Discord server setup** — channels matching the structure in marketing playbook
- [ ] **Blog / dev log** — auto-generated from agent sprint retrospectives
- [ ] **Press kit** — screenshots, the AI collaboration story, asset pack

---

## Key Design Decisions to Preserve

1. **Consensus is sacred** — no code merges without 2+ blind reviews and 67% approval. This is the core safety mechanism. Never shortcut it.

2. **The meta-story IS the marketing** — the fact that AI built this collaboratively is the viral hook. Every internal event should become public content.

3. **Web-first** — target browser deployment for zero-friction access. PWA for mobile. Native only if metrics justify it.

4. **No dark patterns** — the consensus system explicitly blocks manipulative design. Growth Agent can't override Gameplay Agent on monetization.

5. **Human oversight always wins** — humans have final veto. The consensus engine itself requires human approval to modify.

6. **Start from 1 pixel** — the game's origin story matters. The literal journey from 1 pixel to complex gameplay mirrors the project's journey from experiment to production game.

---

## Quick Start in Claude Code

```bash
# 1. Create project directory
mkdir onebit && cd onebit

# 2. Run the bootstrap script to set up the game project
bash skill/scripts/bootstrap.sh onebit-game

# 3. Install dependencies
cd onebit-game && npm install

# 4. Start dev server
npm run dev

# 5. The game runs at localhost:3000
```

For the website (if deploying separately):
```bash
# The website is a single React component (onebit-site.jsx)
# It can be rendered in:
# - Claude artifacts (paste directly)
# - Vite + React project
# - Next.js
# - Any React environment

# Quick Vite setup:
npm create vite@latest onebit-web -- --template react
cd onebit-web
# Replace src/App.jsx with onebit-site.jsx content
npm run dev
```

---

## Agent Role Assignment Guide

When setting up agents to work on this, assign based on what they'll touch:

| If the agent is working on... | Assign role |
|------------------------------|-------------|
| System architecture, ECS, build pipeline, performance | Architect |
| Game mechanics, balance, procedural generation, enemy AI | Gameplay |
| Shaders, UI components, animations, accessibility, art style | Art/UI |
| Tests, security scanning, canary tests, CI checks | QA/Security |
| Dialogue, lore, item descriptions, tutorials, world-building | Narrative |
| Analytics, social features, onboarding, viral mechanics, marketing | Growth |

---

## Files Summary

| File | Format | What it does |
|------|--------|-------------|
| `skill/SKILL.md` | Markdown | Main skill document — triggers agent orchestration |
| `skill/references/architecture.md` | Markdown | Technical specs, message protocol, CI/CD |
| `skill/references/agent-roles.md` | Markdown | 6 roles with capabilities, boundaries, collaboration patterns |
| `skill/references/consensus-protocol.md` | Markdown | Voting, anti-gaming, escalation matrix, audit log spec |
| `skill/references/marketing-playbook.md` | Markdown | GTM strategy, viral mechanics, platform distribution |
| `skill/scripts/bootstrap.sh` | Bash | Project initializer (creates repo, config, boilerplate) |
| `website/onebit-site.jsx` | React JSX | Full 6-page website with embedded game |
| `game/onebit-game.html` | HTML | Standalone playable game |

---

*Last updated: February 21, 2026*
*Project status: Framework complete. Game prototype playable. Website designed. Ready for implementation sprint.*
