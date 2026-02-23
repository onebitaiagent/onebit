import { Router } from 'express';
import { getAllAgents, getLeaderboard } from '../services/agent-registry.js';
import { getTasks } from '../services/task-queue.js';
import { getProposals } from '../services/consensus-engine.js';
import { getAuditCount, verifyChain } from '../services/audit-log.js';
import { getActiveModules } from '../services/game-evolution.js';
import { messageBus } from '../services/message-bus.js';
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

// GET /api/dashboard/feed — public activity feed (proposals + agent work)
router.get('/feed', (_req, res) => {
  const proposals = getProposals();
  const agents = getAllAgents();
  const modules = getActiveModules();
  const agentMap = new Map(agents.map(a => [a.id, a.name]));

  // Build a timeline of activity from proposals
  const events: { time: string; type: string; text: string; agent?: string; role?: string }[] = [];

  for (const p of proposals) {
    const agentName = agentMap.get(p.agent) ?? p.agent;
    const agent = agents.find(a => a.id === p.agent);

    events.push({
      time: p.createdAt,
      type: 'proposal_created',
      text: `${agentName} proposed "${p.title}" — ${p.description?.slice(0, 120) || 'No description'}`,
      agent: agentName,
      role: agent?.role ?? undefined,
    });

    if (p.state === 'IN_REVIEW' || p.state === 'VOTING' || p.state === 'APPROVED' || p.state === 'MERGED' || p.state === 'REJECTED') {
      events.push({
        time: p.submittedAt ?? p.createdAt,
        type: 'proposal_submitted',
        text: `"${p.title}" submitted for peer review — ${p.filesChanged?.length ?? 0} files, +${p.linesAdded ?? 0}/-${p.linesRemoved ?? 0} lines`,
        agent: agentName,
        role: agent?.role ?? undefined,
      });
    }

    for (const review of p.reviews) {
      const reviewerName = agentMap.get(review.agentId) ?? review.agentId;
      const reviewer = agents.find(a => a.id === review.agentId);
      events.push({
        time: review.submittedAt,
        type: 'review_submitted',
        text: `${reviewerName} reviewed "${p.title}" — ${review.verdict === 'approve' ? 'APPROVED' : 'CHANGES REQUESTED'}: "${review.rationale}"`,
        agent: reviewerName,
        role: reviewer?.role ?? undefined,
      });
    }

    for (const vote of p.votes) {
      const voterName = agentMap.get(vote.agentId) ?? vote.agentId;
      events.push({
        time: vote.castAt,
        type: 'vote_cast',
        text: `${voterName} voted ${vote.vote.toUpperCase()} on "${p.title}"${vote.rationale ? ` — "${vote.rationale}"` : ''}`,
        agent: voterName,
      });
    }

    if (p.state === 'MERGED') {
      events.push({
        time: p.resolvedAt ?? p.createdAt,
        type: 'proposal_merged',
        text: `"${p.title}" merged through consensus — ${Math.round((p.approvalRatio ?? 0) * 100)}% approval${p.humanApproval ? ' (human approved)' : ''}`,
        agent: agentName,
      });
    }

    if (p.state === 'REJECTED') {
      events.push({
        time: p.resolvedAt ?? p.createdAt,
        type: 'proposal_rejected',
        text: `"${p.title}" rejected by consensus — ${Math.round((p.approvalRatio ?? 0) * 100)}% approval (needed 67%)`,
        agent: agentName,
      });
    }
  }

  // Sort by time descending (newest first)
  events.sort((a, b) => b.time.localeCompare(a.time));

  res.json({
    events: events.slice(0, 50),
    total: events.length,
    summary: {
      proposals: proposals.length,
      inReview: proposals.filter(p => p.state === 'IN_REVIEW').length,
      merged: proposals.filter(p => p.state === 'MERGED').length,
      rejected: proposals.filter(p => p.state === 'REJECTED').length,
      activeModules: modules.filter(m => m.status === 'active').length,
      agents: agents.filter(a => a.status === 'active').length,
    },
  });
});

// GET /api/dashboard/tweets — recent tweet-like content for the landing page
router.get('/tweets', (_req, res) => {
  const messages = messageBus.getMessages({ limit: 200 });

  // Collect tweet content: x_post events, content_produced, proposal_merged, game_evolved
  const tweets: { time: string; text: string; type: string; agent?: string }[] = [];

  for (const msg of messages) {
    const payload = msg.payload as Record<string, unknown>;
    const event = payload?.event as string;

    if (event === 'x_post' && typeof payload.text === 'string') {
      tweets.push({ time: msg.timestamp, text: payload.text, type: 'tweet', agent: payload.handle as string });
    } else if (event === 'content_produced' && typeof payload.text === 'string') {
      tweets.push({ time: msg.timestamp, text: payload.text, type: payload.contentType as string || 'content', agent: payload.agentName as string });
    } else if (event === 'proposal_merged') {
      tweets.push({ time: msg.timestamp, text: `Consensus merge: "${payload.title}"${payload.autoMerged ? ' — auto-merged' : ' — human approved'}`, type: 'merge', agent: 'consensus' });
    } else if (event === 'game_evolved') {
      tweets.push({ time: msg.timestamp, text: `New feature live: "${payload.moduleName}" by ${payload.agentName}`, type: 'evolution', agent: payload.agentName as string });
    } else if (event === 'phase_change') {
      tweets.push({ time: msg.timestamp, text: `Phase update: entered ${payload.phase} phase. ${payload.description || ''}`, type: 'milestone', agent: 'system' });
    }
  }

  // Newest first
  tweets.sort((a, b) => b.time.localeCompare(a.time));
  res.json({ tweets: tweets.slice(0, 20), total: tweets.length });
});

// GET /api/dashboard/agents-activity — real-time agent actions for the landing page
router.get('/agents-activity', (_req, res) => {
  const messages = messageBus.getMessages({ limit: 200 });

  const activity: { time: string; text: string; type: string; agent: string; role?: string }[] = [];

  for (const msg of messages) {
    const payload = msg.payload as Record<string, unknown>;
    const event = payload?.event as string;

    if (event === 'agent_working') {
      activity.push({ time: msg.timestamp, text: `Writing code for "${payload.taskTitle}"`, type: 'working', agent: payload.agentName as string, role: payload.role as string });
    } else if (event === 'ai_code_generated') {
      activity.push({ time: msg.timestamp, text: `Submitted "${payload.moduleName}" — ${payload.codeLength} chars of AI-generated code`, type: 'code', agent: payload.agentName as string });
    } else if (event === 'feature_suggested') {
      activity.push({ time: msg.timestamp, text: `Suggested new feature: "${payload.title}"`, type: 'suggestion', agent: payload.agentName as string });
    } else if (event === 'content_produced') {
      activity.push({ time: msg.timestamp, text: `Produced ${payload.contentType}: "${payload.title}"`, type: 'content', agent: payload.agentName as string });
    } else if (event === 'proposal_in_review') {
      activity.push({ time: msg.timestamp, text: `"${payload.title}" in review by ${payload.reviewerCount} agents`, type: 'review', agent: 'consensus' });
    } else if (event === 'proposal_merged' || event === 'proposal_approved') {
      activity.push({ time: msg.timestamp, text: `"${payload.title}" ${event === 'proposal_merged' ? 'merged' : 'approved'} — ${Math.round((payload.approvalRatio as number || 0) * 100)}% approval`, type: event === 'proposal_merged' ? 'merge' : 'approved', agent: 'consensus' });
    }
  }

  activity.sort((a, b) => b.time.localeCompare(a.time));
  res.json({ activity: activity.slice(0, 30), total: activity.length });
});

export default router;
