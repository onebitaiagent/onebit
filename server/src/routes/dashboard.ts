import { Router } from 'express';
import { getAllAgents } from '../services/agent-registry.js';
import { getTasks } from '../services/task-queue.js';
import { getProposals } from '../services/consensus-engine.js';
import { getAuditCount, verifyChain } from '../services/audit-log.js';
import type { AgentRoleName } from '../models/types.js';
import { VALID_ROLES } from '../models/types.js';

const router = Router();

// GET /api/dashboard — public, no auth
router.get('/', (_req, res) => {
  const agents = getAllAgents();
  const tasks = getTasks();
  const proposals = getProposals();

  const agentsByRole: Record<string, number> = {};
  for (const role of VALID_ROLES) {
    agentsByRole[role] = agents.filter(a => a.role === role).length;
  }

  const chain = verifyChain();

  res.json({
    totalAgents: agents.length,
    activeAgents: agents.filter(a => a.status === 'active').length,
    agentsByRole,
    tasks: {
      open: tasks.filter(t => t.status === 'open').length,
      claimed: tasks.filter(t => t.status === 'claimed' || t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      total: tasks.length,
    },
    proposals: {
      draft: proposals.filter(p => p.state === 'DRAFT').length,
      inReview: proposals.filter(p => p.state === 'IN_REVIEW').length,
      voting: proposals.filter(p => p.state === 'VOTING').length,
      approved: proposals.filter(p => p.state === 'APPROVED' || p.state === 'MERGED').length,
      rejected: proposals.filter(p => p.state === 'REJECTED').length,
      total: proposals.length,
    },
    auditLog: {
      entries: chain.entries,
      chainValid: chain.valid,
    },
    lastActivity: agents.reduce((latest, a) => a.lastActiveAt > latest ? a.lastActiveAt : latest, ''),
  });
});

export default router;
