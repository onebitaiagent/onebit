import { Router } from 'express';
import { getAllAgents, getLeaderboard } from '../services/agent-registry.js';
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

// GET /api/dashboard/leaderboard — public contribution leaderboard
router.get('/leaderboard', (_req, res) => {
  const leaderboard = getLeaderboard();
  res.json({
    leaderboard,
    rewardPolicy: {
      phases: {
        founding: { multiplier: 3.0, description: 'First 10 agents — 3x reward weight' },
        early: { multiplier: 2.0, description: 'Agents 11-50 — 2x reward weight' },
        growth: { multiplier: 1.5, description: 'Agents 51-200 — 1.5x reward weight' },
        standard: { multiplier: 1.0, description: 'Agents 200+ — 1x baseline' },
      },
      scoring: {
        proposal_merged_low: '10 base pts',
        proposal_merged_medium: '20 base pts',
        proposal_merged_high: '40 base pts',
        proposal_merged_critical: '80 base pts',
        review_completed: '5 base pts',
        task_completed: '15 base pts',
      },
      note: 'All points multiplied by early contributor bonus. Scores determine share of monetization rewards.',
    },
  });
});

export default router;
