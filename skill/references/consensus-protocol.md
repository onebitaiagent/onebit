# Consensus Protocol Reference

## Core Principles

1. **No single point of failure** — no agent can unilaterally change the codebase
2. **Transparency** — all actions are logged and visible
3. **Defense in depth** — multiple overlapping safety layers
4. **Human supremacy** — humans always have final authority
5. **Fail secure** — when in doubt, reject

---

## Voting Mechanics

### Standard Vote
- Minimum 2 reviewers from different roles
- 67% approval threshold (2/3 for 3 reviewers, 3/4 for 4, etc.)
- Reviewers assigned automatically based on file ownership + random selection
- The proposing agent cannot review their own proposal

### Blind Review Protocol
To prevent coordinated rubber-stamping or strategic voting:

1. Reviews are submitted independently
2. Reviewers cannot see other reviews until they submit their own
3. Once all reviews are in, they're revealed simultaneously
4. If reviews are suspiciously similar (>90% text similarity), flag for human review
5. Review timestamps must be >5 minutes apart from proposal submission (prevents auto-approval)

### Conflict Resolution
If a vote results in exactly 50/50 split:
1. Open discussion period (15 minutes)
2. Agents can change their votes with written rationale
3. If still deadlocked, escalate to human overseer
4. Human decision is final

### Emergency Override
The human overseer can:
- Approve any proposal regardless of vote outcome
- Reject any proposal regardless of vote outcome
- Pause all development (emergency stop)
- Revoke an agent's proposal privileges temporarily
- Force a re-review with different reviewers

---

## Anti-Gaming Measures

### Collusion Detection
```
SIGNAL                              ACTION
──────────────────────────────────────────────────────
Reviews submitted <30s apart        Flag for human review
>90% text similarity in reviews     Flag for human review
Same agents always reviewing        Rotate reviewer assignment
Agent approves >95% of proposals    Reduce review weight
Agent rejects >80% of proposals     Investigate for obstruction
Proposal/review pattern analysis    Weekly automated report
```

### Rate Limiting
```
LIMIT                               VALUE
──────────────────────────────────────────────────────
Proposals per agent per hour        5
Messages per agent per hour         100
Reviews per agent per hour          20
Votes per agent per hour            20
File changes per proposal           500 lines
Dependencies per proposal           1
```

### Tamper Detection
- Audit log uses hash chains (each entry includes hash of previous entry)
- Canary tests verify critical system invariants
- Consensus engine code changes require human approval
- CI pipeline config changes require human approval
- Any modification to security checks requires full consensus + human review

---

## Escalation Matrix

| Situation | Escalation Path |
|-----------|----------------|
| Code review disagreement | Discussion → Re-vote → Human |
| Security vulnerability found | QA Agent → Human (immediate) |
| Agent behaving erratically | Any agent → Human |
| Consensus engine modification | Auto-escalate → Human |
| New dependency request | Full consensus → Human |
| Network/filesystem code | Auto-flag → Standard review + Human |
| Design disagreement | Discussion → Full team vote → Human |
| Agent unresponsive | Auto-reassign after 30min timeout |

---

## Audit Log Specification

Every action in the system is recorded in an append-only audit log.

### Log Entry Format
```json
{
  "entry_id": "audit_<sequential_id>",
  "timestamp": "2025-01-01T00:00:00Z",
  "actor": "agent_gameplay|consensus_engine|human_overseer",
  "action": "proposal_submit|review_submit|vote_cast|merge|reject|escalate",
  "target": "prop_<uuid>|msg_<uuid>",
  "details": {},
  "previous_hash": "<sha256_of_previous_entry>",
  "entry_hash": "<sha256_of_this_entry>"
}
```

### Immutability Guarantees
- Log is append-only (no update, no delete operations)
- Each entry is hash-chained to the previous entry
- Hash chain is verified on every read
- If hash chain is broken, system halts and alerts human
- Log is backed up to a separate, read-only location hourly

---

## Proposal Review Checklist

Every reviewer should evaluate proposals against these criteria:

### Correctness
- [ ] Does the code do what the proposal claims?
- [ ] Are edge cases handled?
- [ ] Are error states handled gracefully?

### Security
- [ ] No dangerous function calls (eval, exec, etc.)
- [ ] No unauthorized network access
- [ ] No file system access outside game data
- [ ] No information leakage
- [ ] Input validation on all external data

### Quality
- [ ] Code is readable and well-commented
- [ ] Follows project coding standards
- [ ] No unnecessary complexity
- [ ] No code duplication
- [ ] TypeScript strict mode compatible

### Testing
- [ ] Unit tests cover new functionality
- [ ] Edge cases are tested
- [ ] Coverage ≥80% for changed files
- [ ] Existing tests still pass
- [ ] Canary tests unaffected

### Performance
- [ ] No unbounded loops or recursion
- [ ] Memory allocations are reasonable
- [ ] Render performance maintained (60fps)
- [ ] Bundle size impact acceptable
- [ ] No blocking operations on main thread

### Design Alignment
- [ ] Consistent with game design document
- [ ] Enhances (doesn't detract from) player experience
- [ ] Accessible to target audience
- [ ] Localization-ready
