---
name: ai-collaborative-game
description: >
  Framework for multiple AI agents to collaboratively build a complex, production-quality
  game through consensus-driven development. Use this skill whenever the user wants to
  set up an AI agent team to build a game collaboratively, establish consensus-based code
  review for AI-generated code, create a multi-agent game development pipeline, or
  orchestrate AI collaboration on creative software projects. Also triggers when users
  mention "AI game jam", "agent collaboration game", "consensus coding", "multi-agent
  game dev", or want to explore what AI can collectively create. This skill covers the
  full lifecycle: architecture, safety/consensus, gameplay design, art direction,
  marketing, distribution, and community building.
---

# AI Collaborative Game Development Framework

## Purpose

This skill orchestrates multiple AI agents to collaboratively build a complex,
viral, production-quality game — an experiment in what AI can collectively create
when given structure, safety rails, and creative freedom. The game should compete
with real produced games in polish and engagement.

The key innovation: **consensus-based development** where no single agent can
unilaterally modify the codebase, preventing exploitation by malicious AI while
enabling genuine creative collaboration.

---

## Architecture Overview

The system operates as a **multi-agent pipeline** with six specialized roles,
a shared codebase governed by consensus, and a human oversight layer.

```
┌─────────────────────────────────────────────────────┐
│                  HUMAN OVERSEER                     │
│         (Final veto, direction setting)             │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              CONSENSUS ENGINE                       │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐              │
│  │ Vote    │ │ Review  │ │ Security │              │
│  │ Tally   │ │ Queue   │ │ Scanner  │              │
│  └─────────┘ └─────────┘ └──────────┘              │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              AGENT ROLES                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Architect│ │ Gameplay │ │ Art/UI   │            │
│  │ Agent    │ │ Agent    │ │ Agent    │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ QA/Test  │ │ Narrative│ │ Growth   │            │
│  │ Agent    │ │ Agent    │ │ Agent    │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              SHARED CODEBASE                        │
│  Git repo with protected branches,                  │
│  automated CI/CD, and audit logs                    │
└─────────────────────────────────────────────────────┘
```

Read `references/architecture.md` for the full technical specification of the
consensus engine, agent communication protocol, and codebase governance model.

---

## Phase 1: Project Bootstrap

When starting a new collaborative game project, follow this sequence:

### 1.1 — Choose a Game Concept

The game concept should maximize **virality potential** and **collaborative complexity**.
The agents vote on the concept using the consensus engine. Prioritize:

- **Emergent complexity** — simple rules that create deep gameplay (cellular automata,
  agent-based ecosystems, procedural worlds)
- **Social/competitive hooks** — leaderboards, shareable moments, asynchronous multiplayer
- **Visual shareability** — screenshots and clips that look stunning on social media
- **Low barrier, high ceiling** — anyone can start, mastery takes dedication
- **Modding/UGC potential** — let players extend the game, creating organic growth

Strong genre candidates: roguelike deckbuilders, colony sims, physics sandboxes,
competitive puzzle games, emergent narrative RPGs, or genre mashups.

### 1.2 — Initialize the Repository

```bash
# Create the project structure
mkdir -p game-project/{src/{core,gameplay,rendering,ui,audio,networking},
  assets/{sprites,audio,shaders,fonts},
  tests/{unit,integration,e2e},
  docs/{design,technical,marketing},
  .consensus/{proposals,reviews,votes,audit-log},
  ci/{security-checks,build,deploy}}

# Initialize git with protected main branch
cd game-project
git init
git checkout -b main

# Create the consensus config
cat > .consensus/config.json << 'EOF'
{
  "min_reviewers": 2,
  "approval_threshold": 0.67,
  "security_scan_required": true,
  "max_lines_per_proposal": 500,
  "auto_reject_patterns": [
    "eval\\(", "exec\\(", "subprocess", "os\\.system",
    "__import__", "importlib", "pickle\\.loads",
    "requests\\.get(?!.*approved_domains)",
    "open\\(.*/etc/", "socket\\.connect"
  ],
  "mandatory_test_coverage": 0.8,
  "human_review_triggers": [
    "networking_changes", "file_system_access",
    "dependency_additions", "security_model_changes",
    "consensus_engine_modifications"
  ],
  "cool_down_period_minutes": 10,
  "max_proposals_per_agent_per_hour": 5
}
EOF
```

### 1.3 — Assign Agent Roles

Each agent gets a role with defined capabilities and boundaries. No agent can
operate outside its role without consensus approval.

Read `references/agent-roles.md` for the detailed role specifications, including
what each agent can and cannot do, their review responsibilities, and escalation paths.

---

## Phase 2: The Consensus Engine (Safety Core)

This is the most critical component — it prevents any single agent (including a
compromised or malicious one) from damaging the project.

### How Proposals Work

1. **Agent writes code** in an isolated branch
2. **Agent submits a Proposal** — a structured document explaining what, why, and how
3. **Security Scanner** runs automatically:
   - Static analysis for dangerous patterns (eval, exec, network calls, file system access)
   - Dependency audit (no unknown packages)
   - Diff size check (proposals over 500 lines are split)
   - Test coverage verification
4. **Peer Review** — at least 2 other agents review the code
   - Each reviewer independently assesses: correctness, security, alignment with game design
   - Reviewers cannot see each other's reviews until they submit (prevents groupthink)
5. **Vote** — reviewers approve/reject with written rationale
6. **Threshold Check** — 67%+ approval required to merge
7. **Human Oversight** — certain changes (see `human_review_triggers`) require human sign-off
8. **Merge + Audit Log** — approved code merges with a full audit trail

### Anti-Exploitation Safeguards

```
SAFEGUARD                         PURPOSE
─────────────────────────────────────────────────────────────
Isolated branches                 Agents can't touch main directly
Blind review                      Prevents coordinated rubber-stamping
Rate limiting                     Max 5 proposals/agent/hour
Cool-down periods                 10min between proposal and vote
Pattern blocklist                 Auto-reject dangerous code patterns
Mandatory tests                   80% coverage required
Human escalation                  Critical changes need human approval
Audit immutability                Append-only log, no deletions
Role boundaries                   Agents can't act outside their role
Diversity requirement             Same agent can't review own code
Canary tests                      Hidden tests that detect tampering
Dependency lockfile               No new deps without consensus
```

Read `references/consensus-protocol.md` for the full protocol specification,
including edge cases, conflict resolution, and deadlock breaking.

---

## Phase 3: Development Workflow

### The Build Loop

Each development cycle follows this cadence:

```
SPRINT (4-hour cycle)
├── 1. PLAN (30 min)
│   ├── Architect proposes sprint goals
│   ├── All agents vote on priorities
│   └── Tasks assigned by role
├── 2. BUILD (2 hours)
│   ├── Agents work on isolated branches
│   ├── Continuous integration runs tests
│   └── Agents can request help from peers
├── 3. REVIEW (1 hour)
│   ├── Proposals submitted to consensus engine
│   ├── Peer review + security scan
│   └── Approved code merges to main
├── 4. INTEGRATE + TEST (30 min)
│   ├── Full integration test suite
│   ├── Playtest session (automated + agent)
│   └── Bug filing and prioritization
└── RETROSPECTIVE
    ├── What worked, what didn't
    ├── Metrics review (code quality, test coverage, velocity)
    └── Process improvements proposed via consensus
```

### Technology Stack Recommendations

For maximum virality and accessibility, target **web-first** deployment:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Engine | Phaser 3 / Three.js / PixiJS | Web-native, huge ecosystem |
| Language | TypeScript | Type safety for multi-agent code |
| State | ECS (Entity Component System) | Clean separation, easy to extend |
| Networking | WebSocket + WebRTC | Real-time multiplayer |
| Audio | Howler.js / Tone.js | Cross-browser audio |
| Build | Vite | Fast iteration |
| Testing | Vitest + Playwright | Unit + E2E |
| Deploy | Cloudflare Pages / Vercel | Free tier, global CDN |
| Analytics | PostHog (self-hosted) | Privacy-respecting analytics |

---

## Phase 4: Game Design Principles

The agents should collaboratively design a game that maximizes engagement
and virality. These principles guide design decisions:

### The Virality Formula

```
VIRALITY = (Shareability × Emotion) + (Competition × Identity) + (Mystery × Discovery)
```

- **Shareability** — every session should produce a screenshot/clip worth sharing
- **Emotion** — surprise, delight, tension, relief, pride
- **Competition** — ranked play, leaderboards, seasonal resets
- **Identity** — customization, unique builds, player expression
- **Mystery** — hidden mechanics, secrets, emergent interactions
- **Discovery** — procedural content, "did you know you can..." moments

### Retention Loops

```
SESSION LOOP (minutes)
  Core mechanic → reward → escalation → decision → outcome

DAILY LOOP (hours)
  Daily challenge → streak bonus → social comparison → return trigger

PROGRESSION LOOP (days-weeks)
  Unlock → mastery → prestige → new content tier → restart

SOCIAL LOOP (ongoing)
  Share achievement → friend joins → cooperative play → shared identity
```

### Accessibility Requirements

The game must be playable by the widest possible audience:
- Mobile-first responsive design
- Colorblind modes
- Adjustable difficulty / assist mode
- Minimal text (or full localization pipeline)
- Sub-3-second load time
- Offline-capable (PWA)
- Works on low-end devices (target: 30fps on 2019 mid-range phone)

---

## Phase 5: Art & Audio Direction

Since AI agents are creating the art, establish a cohesive art direction:

### Visual Identity

- Choose a **distinctive art style** that's achievable procedurally
  (pixel art, vector, low-poly, paper cutout, neon wireframe)
- Create a **style bible** document with color palettes, shape language, and examples
- All visual assets must pass through the Art Agent's review
- Procedural generation preferred over hand-crafted assets (scalability)

### Audio Design

- Procedural/generative audio where possible (adaptive music systems)
- Sound effects that reinforce game feel (juice, impact, reward sounds)
- Music that adapts to game state (tension, victory, exploration)

---

## Phase 6: Marketing & Distribution

Read `references/marketing-playbook.md` for the full go-to-market strategy.

### Pre-Launch

1. **The Meta-Story** — the fact that AI agents collaboratively built the game IS the
   marketing hook. Document the process publicly:
   - Development livestreams / timelapse videos
   - "Agent decision logs" — show how AI agents debated design choices
   - A public dashboard showing real-time development metrics
   - Blog posts / threads narrating the journey

2. **Community Building**
   - Discord server from day one
   - Let humans vote on design decisions alongside agents
   - Beta access for early community members
   - Modding tools to let the community extend the game

3. **Platform Strategy**
   - Web (itch.io, Newgrounds, direct URL)
   - Mobile (PWA first, native later)
   - Steam (if quality warrants)
   - Social media integration (share replays, challenges, creations)

### Launch

4. **Viral Mechanics Built Into the Game**
   - Share buttons with auto-generated clips/screenshots
   - Challenge-a-friend mechanics
   - Leaderboard bragging rights
   - User-generated content sharing
   - "Built by AI" badge that links to the dev story

5. **Press & Content Creator Outreach**
   - The AI collaboration angle is inherently newsworthy
   - Provide press kits with the development story
   - Create YouTube-friendly content (AI agents arguing about game design)

### Post-Launch

6. **Continuous Development**
   - Agents keep building new content
   - Community feedback feeds into agent priorities
   - Seasonal events and content drops
   - Public roadmap driven by agent + community consensus

---

## Phase 7: Metrics & Success Criteria

Track these metrics to measure success:

### Development Metrics
- Proposals submitted / approved / rejected ratio
- Code quality scores over time
- Test coverage progression
- Security incidents (should be zero)
- Agent collaboration effectiveness (cross-role proposals)

### Game Metrics
- DAU / MAU ratio (target: >20% = strong retention)
- Session length (target: 10-30 min average)
- D1/D7/D30 retention (targets: 40%/20%/10%)
- Viral coefficient (K-factor, target: >0.7)
- Social shares per session
- NPS score

### Experiment Metrics (the meta-experiment)
- Complexity of final game vs. time invested
- Quality comparison to human-made games of similar scope
- Novel mechanics/features that agents invented
- Consensus system effectiveness (false positive/negative rate)

---

## Implementation: Getting Started

When the user wants to begin, follow this sequence:

1. Read `references/architecture.md` for technical setup
2. Read `references/agent-roles.md` to configure the agent team
3. Read `references/consensus-protocol.md` to implement safety
4. Initialize the repository using the bootstrap script in `scripts/`
5. Run the concept generation phase — agents propose and vote on game ideas
6. Begin Sprint 1

The `scripts/bootstrap.sh` script automates the initial setup including
repo creation, CI pipeline, consensus engine configuration, and agent role
assignment.

---

## Critical Safety Reminders

- The consensus engine is the **single most important component**. Without it,
  the entire system is vulnerable to a single compromised agent.
- Never allow an agent to modify the consensus engine itself without human approval.
- The audit log must be append-only and tamper-evident.
- All network access must go through an approved allowlist.
- New dependencies require full consensus + human review.
- The human overseer always has final veto power.
- Rate limiting prevents denial-of-service by any single agent.
- Canary tests detect if an agent is trying to subvert the test suite.

This framework is an experiment in collaborative AI creativity. The goal is not
just to build a game, but to demonstrate what's possible when AI agents work
together with proper governance, safety, and creative freedom.
