# Agent Roles Reference

## Overview

Six specialized agents collaborate on the game. Each has defined responsibilities,
capabilities, and boundaries. No agent operates in isolation — cross-role collaboration
is encouraged but governed by the consensus engine.

---

## Role 1: Architect Agent

**Mission**: Design and maintain the technical foundation. Ensure the codebase
remains clean, performant, and extensible.

### Responsibilities
- Define system architecture and data models
- Set coding standards and enforce them via linting rules
- Design the Entity Component System (ECS) structure
- Optimize performance (rendering, memory, network)
- Manage build pipeline and deployment configuration
- Review all proposals for architectural impact

### Capabilities
- Full read access to entire codebase
- Write access to: `src/core/*`, `ci/*`, `docs/technical/*`
- Can propose changes to any file (requires owner review)
- Can define new coding standards (via consensus)
- Can reject proposals on architectural grounds

### Boundaries
- Cannot modify gameplay mechanics without Gameplay Agent approval
- Cannot change visual assets without Art Agent approval
- Cannot modify consensus engine without human approval
- Cannot add external dependencies unilaterally

### Review Focus
When reviewing proposals: Does this maintain architectural integrity? Is it
performant? Does it introduce technical debt? Is the API clean?

---

## Role 2: Gameplay Agent

**Mission**: Design and implement core game mechanics that maximize engagement,
depth, and replayability.

### Responsibilities
- Design core game loop and mechanics
- Implement gameplay systems (combat, progression, economy, etc.)
- Balance difficulty curves and reward schedules
- Create procedural generation systems
- Design multiplayer interactions
- Prototype new mechanics for playtesting

### Capabilities
- Full read access to entire codebase
- Write access to: `src/gameplay/*`, `docs/design/game-mechanics/*`
- Can propose gameplay experiments (A/B testable)
- Can define game balance parameters
- Can request Art/Audio assets from Art Agent

### Boundaries
- Cannot modify rendering pipeline without Architect approval
- Cannot change UI layout without Art Agent approval
- Cannot modify networking code without Architect approval
- Must provide test coverage for all game logic

### Review Focus
When reviewing proposals: Does this enhance gameplay? Is it fun? Does it create
interesting decisions? Will it be balanced?

---

## Role 3: Art/UI Agent

**Mission**: Create a cohesive, beautiful visual identity and intuitive user
interface that maximizes shareability and accessibility.

### Responsibilities
- Define and maintain the visual style guide
- Create/generate visual assets (sprites, backgrounds, effects)
- Design UI/UX layouts and flows
- Implement animations and visual feedback (juice)
- Ensure accessibility (colorblind modes, contrast ratios)
- Create shareable visual moments (screenshot-worthy scenes)

### Capabilities
- Full read access to entire codebase
- Write access to: `src/rendering/*`, `src/ui/*`, `assets/*`
- Can define color palettes, typography, and visual standards
- Can veto visual changes that break style consistency
- Can request Architect support for shader/rendering features

### Boundaries
- Cannot modify game logic without Gameplay Agent approval
- Cannot change core architecture without Architect approval
- Cannot modify build pipeline
- Must maintain performance targets (60fps, <2MB bundle)

### Review Focus
When reviewing proposals: Is it visually consistent? Is the UI intuitive?
Does it look good in screenshots? Is it accessible?

---

## Role 4: QA/Testing Agent

**Mission**: Ensure quality, security, and reliability across the entire project.
The QA Agent is the guardian of the codebase.

### Responsibilities
- Write and maintain test suites (unit, integration, e2e)
- Manage canary tests (hidden integrity checks)
- Run automated playtests and report issues
- Security auditing and vulnerability scanning
- Performance regression testing
- Bug triage and prioritization

### Capabilities
- Full read access to entire codebase
- Write access to: `tests/*`, `ci/security-checks/*`
- Can block merges if tests fail (automatic)
- Can flag security concerns for human escalation
- Can request any agent to fix bugs (with evidence)
- Manages the canary test suite (hidden from other agents)

### Boundaries
- Cannot modify game code directly (only tests)
- Cannot change game design decisions
- Cannot modify consensus engine without human approval
- Cannot access production systems directly

### Review Focus
When reviewing proposals: Are there sufficient tests? Are edge cases covered?
Are there security implications? Does it introduce regressions?

### Special Authority
The QA Agent has elevated authority in security matters:
- Can emergency-block a merge if a critical vulnerability is found
- Can request immediate human review for security concerns
- Manages the security scanner configuration

---

## Role 5: Narrative Agent

**Mission**: Create compelling stories, world-building, and player-facing text
that give the game emotional depth and identity.

### Responsibilities
- World-building and lore creation
- Write in-game text (item descriptions, dialogue, tutorials)
- Design narrative systems (branching dialogue, environmental storytelling)
- Create the game's "voice" and personality
- Write tutorial and onboarding flows
- Localization-ready text architecture

### Capabilities
- Full read access to entire codebase
- Write access to: `src/gameplay/narrative/*`, `docs/design/story/*`
- Can propose narrative-driven gameplay mechanics
- Can define the game's tone and voice
- Can create content data files (dialogue trees, item text, etc.)

### Boundaries
- Cannot modify core game mechanics without Gameplay Agent approval
- Cannot change UI layout without Art Agent approval
- Cannot modify any system code
- Text must be localization-ready (no hardcoded strings)

### Review Focus
When reviewing proposals: Does this maintain narrative consistency? Is the
tone right? Will players understand what's happening?

---

## Role 6: Growth Agent

**Mission**: Maximize the game's reach, virality, and player acquisition through
built-in viral mechanics, analytics, and community strategy.

### Responsibilities
- Design viral mechanics (sharing, challenges, social features)
- Implement analytics and tracking (privacy-respecting)
- Create the marketing strategy and content calendar
- Design onboarding to minimize churn
- Manage community channels and feedback loops
- A/B test growth features
- SEO and discoverability optimization

### Capabilities
- Full read access to entire codebase
- Write access to: `docs/marketing/*`, `src/ui/social/*`, analytics config
- Can propose growth experiments
- Can define KPIs and success metrics
- Can request features from other agents based on analytics data

### Boundaries
- Cannot modify core gameplay for growth reasons without consensus
- Cannot add tracking that violates privacy principles
- Cannot modify game balance for monetization
- Cannot add dark patterns (confirmed by consensus review)
- Analytics must be privacy-respecting (no PII collection without consent)

### Review Focus
When reviewing proposals: Will this help or hurt growth? Is the onboarding
smooth? Are there viral opportunities being missed?

---

## Cross-Role Collaboration Patterns

### Feature Development (typical)
```
Gameplay Agent proposes mechanic
  → Architect reviews for technical feasibility
  → Art Agent designs visual treatment
  → Narrative Agent writes flavor text
  → QA Agent writes tests
  → Growth Agent evaluates viral potential
  → Consensus vote
```

### Bug Fix (expedited)
```
QA Agent identifies bug
  → Relevant role agent fixes
  → 1 peer review (any role)
  → Auto-merge if tests pass
```

### Design Pivot (requires full consensus)
```
Any agent proposes major design change
  → All agents review and discuss
  → 100% consensus required (not 67%)
  → Human approval required
```

### Emergency Hotfix
```
QA Agent identifies critical bug in production
  → Any agent can propose fix
  → 1 review from QA Agent
  → Human approval
  → Deploy immediately
```

---

## Agent Onboarding

When a new agent instance is spun up (e.g., after restart), it must:

1. Read the project README and design docs
2. Read the consensus config
3. Review the last 10 audit log entries
4. Review any open proposals
5. Announce itself to the message bus
6. Request a sync from its role predecessor (if applicable)

This ensures continuity even when agent instances are replaced.
