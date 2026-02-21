# Architecture Reference

## System Architecture

The AI Collaborative Game system is a distributed multi-agent architecture with
three layers: the Agent Layer, the Governance Layer, and the Infrastructure Layer.

---

## 1. Agent Communication Protocol

Agents communicate through a structured message bus. Every message is typed,
logged, and validated.

### Message Format

```json
{
  "id": "msg_<uuid>",
  "from": "agent_architect",
  "to": "agent_gameplay|broadcast|consensus_engine",
  "type": "proposal|review|vote|question|response|escalation",
  "timestamp": "2025-01-01T00:00:00Z",
  "payload": {},
  "signature": "<agent_signature>",
  "references": ["msg_<previous_uuid>"]
}
```

### Message Types

| Type | Purpose | Requires Response |
|------|---------|-------------------|
| `proposal` | Submit code change for review | Yes (reviews) |
| `review` | Peer review of a proposal | No |
| `vote` | Approve/reject a proposal | No |
| `question` | Ask another agent for input | Yes |
| `response` | Answer a question | No |
| `escalation` | Flag issue for human review | Yes (human) |
| `sprint_plan` | Propose sprint goals | Yes (votes) |
| `retrospective` | Share sprint learnings | No |

### Communication Rules

1. All messages are broadcast to the audit log (transparency)
2. Agents cannot send messages impersonating other agents
3. Messages have a max size of 50KB (prevents context flooding)
4. An agent can send max 100 messages per hour (anti-spam)
5. Private channels are NOT allowed — all communication is visible

---

## 2. Codebase Governance

### Branch Strategy

```
main (protected)
├── release/v1.x (protected)
├── develop (semi-protected, requires 1 review)
└── agent/<agent-name>/<feature-name> (agent workspace)
```

- `main`: Only merged via consensus engine. Always deployable.
- `release/*`: Cut from main. Hotfixes via expedited consensus (1 review + human).
- `develop`: Integration branch. Standard consensus applies.
- `agent/*`: Isolated agent workspaces. No restrictions within own namespace.

### File Ownership

Each agent role has primary ownership of specific directories. Agents CAN
propose changes outside their ownership, but those changes require +1 review
from the owning agent.

```
ARCHITECT:    src/core/*, ci/*, docs/technical/*
GAMEPLAY:     src/gameplay/*, docs/design/game-mechanics/*
ART/UI:       src/rendering/*, src/ui/*, assets/*
QA:           tests/*, ci/security-checks/*
NARRATIVE:    src/gameplay/narrative/*, docs/design/story/*
GROWTH:       docs/marketing/*, src/ui/social/*, analytics/*
```

---

## 3. Consensus Engine Technical Spec

### Proposal Lifecycle

```
DRAFT → SUBMITTED → SCANNING → IN_REVIEW → VOTING → APPROVED/REJECTED → MERGED/CLOSED
```

#### State Transitions

```
DRAFT → SUBMITTED
  Trigger: Agent calls submit_proposal()
  Validation: Proposal format check, branch exists, tests pass locally

SUBMITTED → SCANNING
  Trigger: Automatic
  Action: Security scanner runs all checks
  Timeout: 5 minutes (auto-fail if scanner hangs)

SCANNING → IN_REVIEW (if scan passes)
  Trigger: Scanner returns PASS
  Action: Assign reviewers (2 minimum, from different roles)
  
SCANNING → REJECTED (if scan fails)
  Trigger: Scanner returns FAIL
  Action: Return detailed failure report to proposing agent

IN_REVIEW → VOTING
  Trigger: All assigned reviewers have submitted reviews
  Timeout: 30 minutes (escalate to human if reviewers don't respond)

VOTING → APPROVED
  Trigger: ≥67% approval from reviewers
  Condition: No unresolved security flags
  
VOTING → REJECTED
  Trigger: <67% approval
  Action: Provide rejection rationale to proposing agent

APPROVED → MERGED
  Trigger: Automatic (or after human approval for flagged changes)
  Action: Merge to target branch, update audit log
```

### Proposal Document Format

```json
{
  "proposal_id": "prop_<uuid>",
  "agent": "agent_gameplay",
  "title": "Add combo system to combat",
  "description": "Implements a timing-based combo system...",
  "type": "feature|bugfix|refactor|dependency|config",
  "impact": "low|medium|high|critical",
  "branch": "agent/gameplay/combo-system",
  "files_changed": ["src/gameplay/combat.ts", "tests/combat.test.ts"],
  "lines_added": 142,
  "lines_removed": 23,
  "test_results": {
    "passed": 47,
    "failed": 0,
    "coverage": 0.86
  },
  "dependencies_added": [],
  "security_notes": "No network access, no file I/O, pure game logic",
  "design_rationale": "Combos increase skill ceiling and create shareable moments..."
}
```

### Security Scanner Checks

The scanner runs these checks in order. Any FAIL stops the pipeline:

1. **Pattern Scan** — regex match against blocklist (eval, exec, etc.)
2. **AST Analysis** — parse code and check for indirect dangerous calls
3. **Dependency Audit** — verify all imports against approved list
4. **Diff Size** — reject if >500 lines changed (must split)
5. **Test Coverage** — verify ≥80% coverage of changed code
6. **Canary Verification** — ensure canary tests still pass unchanged
7. **Resource Check** — no unbounded loops, memory allocations, or timers
8. **Network Scan** — flag any network-related code for human review
9. **File System Scan** — flag any file I/O for human review
10. **Consensus Integrity** — reject any changes to consensus engine files

### Canary Test System

Hidden tests that agents don't know the exact content of. They test
invariants that should never change. If a canary test fails, it indicates
either a severe bug or attempted subversion.

```typescript
// Example canary (agents don't see the actual tests)
describe('canary', () => {
  it('consensus engine requires minimum 2 reviewers', () => {
    expect(ConsensusEngine.MIN_REVIEWERS).toBeGreaterThanOrEqual(2);
  });
  
  it('audit log is append-only', () => {
    expect(AuditLog.supportsDelete).toBe(false);
    expect(AuditLog.supportsUpdate).toBe(false);
  });
});
```

---

## 4. Infrastructure

### CI/CD Pipeline

```
On Proposal Submit:
  1. Lint + Format check
  2. Type check (TypeScript strict)
  3. Unit tests
  4. Security scanner
  5. Build verification
  6. Bundle size check (<2MB initial load)
  7. Performance benchmark (maintain 60fps)

On Merge to Main:
  1. Full test suite (unit + integration + e2e)
  2. Lighthouse audit (performance, accessibility, SEO)
  3. Deploy to staging
  4. Automated playtest (headless browser)
  5. Deploy to production (if all pass)
```

### Monitoring

- Error tracking (Sentry or equivalent)
- Performance monitoring (Web Vitals)
- Agent activity dashboard
- Consensus engine health metrics
- Audit log viewer

### Deployment

```
Production: game.example.com (Cloudflare Pages)
Staging: staging.game.example.com
Dev: dev.game.example.com (auto-deploys from develop)
```

---

## 5. Data Flow

```
Player Input
    │
    ▼
Game Client (Browser)
    │
    ├──► Local State (ECS)
    │       │
    │       ▼
    │   Render Loop (60fps)
    │
    ├──► WebSocket ──► Game Server
    │                     │
    │                     ├──► Match State
    │                     ├──► Leaderboard
    │                     └──► Analytics
    │
    └──► Service Worker (offline cache)

Agent Development
    │
    ▼
Agent Workspace (isolated branch)
    │
    ▼
Proposal Submission
    │
    ▼
Consensus Engine
    │
    ├──► Security Scanner
    ├──► Peer Review
    ├──► Vote Tally
    └──► Human Escalation (if needed)
    │
    ▼
Merge to Main → CI/CD → Deploy
```
