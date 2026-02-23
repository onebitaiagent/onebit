import { Router, type Request, type Response } from 'express';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import {
  mergeProposal,
  getProposals,
  getProposal,
} from '../services/consensus-engine.js';
import { getAllAgents } from '../services/agent-registry.js';
import { getTasks } from '../services/task-queue.js';
import { appendAudit, verifyChain } from '../services/audit-log.js';
import { messageBus } from '../services/message-bus.js';
import { postLaunchThread, isThreadPosted, getTweetStats, deleteTweets, deleteAllMyTweets } from '../services/x-bot.js';
import { pushDataToGitHub, getLastPushTime, isAutoSyncEnabled } from '../services/git-sync.js';
import { getCurrentPhase, advancePhase, getAgentStatus, stopAgents } from '../services/live-agents.js';
import { getAICosts } from '../services/ai-client.js';
import { archiveModule } from '../services/game-evolution.js';
import { JsonStore } from '../data/store.js';
import type { Proposal, ProposalState } from '../models/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const proposalStore = new JsonStore<Proposal>('proposals.json');
const router = Router();

// All admin routes require the admin key
router.use(adminAuthMiddleware);

// GET /api/admin/overview — admin dashboard
router.get('/overview', (_req: Request, res: Response) => {
  const agents = getAllAgents();
  const proposals = getProposals();
  const tasks = getTasks({});
  const chainValid = verifyChain();

  const pendingApproval = proposals.filter(p => p.state === 'APPROVED');
  const merged = proposals.filter(p => p.state === 'MERGED');
  const rejected = proposals.filter(p => p.state === 'REJECTED');

  res.json({
    agents: {
      total: agents.length,
      active: agents.filter(a => a.status === 'active').length,
      byRole: agents.reduce((acc, a) => {
        if (a.role) acc[a.role] = (acc[a.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    proposals: {
      total: proposals.length,
      pendingApproval: pendingApproval.length,
      merged: merged.length,
      rejected: rejected.length,
      inReview: proposals.filter(p => p.state === 'IN_REVIEW').length,
      voting: proposals.filter(p => p.state === 'VOTING').length,
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter(t => t.status === 'open').length,
      completed: tasks.filter(t => t.status === 'completed').length,
    },
    security: {
      auditChainValid: chainValid,
    },
  });
});

// GET /api/admin/pending — proposals awaiting human approval
router.get('/pending', (_req: Request, res: Response) => {
  const pending = getProposals({ state: 'APPROVED' });
  res.json({
    proposals: pending.map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      impact: p.impact,
      agent: p.agent,
      approvalRatio: p.approvalRatio,
      reviewCount: p.reviews.length,
      filesChanged: p.filesChanged,
      linesAdded: p.linesAdded,
      linesRemoved: p.linesRemoved,
      votingCompletedAt: p.votingCompletedAt,
    })),
    total: pending.length,
  });
});

// POST /api/admin/proposals/:id/merge — human approves merge
router.post('/proposals/:id/merge', (req: Request, res: Response) => {
  const proposal = getProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  if (proposal.state !== 'APPROVED') {
    res.status(400).json({ error: `Proposal is ${proposal.state}, expected APPROVED` });
    return;
  }

  const result = mergeProposal(req.params.id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Emit propagation event for website/branding proposals
  if (proposal.type === 'website' || proposal.type === 'branding') {
    messageBus.send('admin', 'broadcast', 'system', {
      event: 'propagation_triggered',
      proposalId: proposal.id,
      type: proposal.type,
      title: proposal.title,
      filesChanged: proposal.filesChanged,
      message: `Auto-propagation: "${proposal.title}" (${proposal.type}) deployed.`,
    });

    appendAudit('admin', 'propagation_triggered', proposal.id, {
      type: proposal.type,
      filesChanged: proposal.filesChanged,
    });
  }

  res.json({ proposal: result.proposal, propagated: proposal.type === 'website' || proposal.type === 'branding' });
});

// POST /api/admin/proposals/:id/reject — human override reject
router.post('/proposals/:id/reject', (req: Request, res: Response) => {
  const { reason } = req.body;
  const proposal = getProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  // Admin can reject from any non-terminal state
  if (proposal.state === 'MERGED' || proposal.state === 'CLOSED') {
    res.status(400).json({ error: `Proposal is already ${proposal.state}` });
    return;
  }

  const now = new Date().toISOString();
  proposalStore.update(req.params.id, {
    state: 'REJECTED' as ProposalState,
    humanApproval: false,
    resolvedAt: now,
  } as Partial<Proposal>);

  appendAudit('admin', 'admin_reject', req.params.id, {
    reason: reason || 'Rejected by admin override',
    previousState: proposal.state,
  });

  messageBus.send('admin', 'broadcast', 'system', {
    event: 'admin_rejected',
    proposalId: proposal.id,
    title: proposal.title,
    reason: reason || 'Rejected by admin override',
  });

  res.json({ proposal: getProposal(req.params.id) });
});

// POST /api/admin/proposals/batch-merge — merge all pending non-critical
router.post('/proposals/batch-merge', (_req: Request, res: Response) => {
  const pending = getProposals({ state: 'APPROVED' });
  const results: { id: string; title: string; merged: boolean; error?: string }[] = [];

  for (const p of pending) {
    const result = mergeProposal(p.id);
    results.push({
      id: p.id,
      title: p.title,
      merged: !result.error,
      error: result.error,
    });

    // Propagation for website/branding
    if (!result.error && (p.type === 'website' || p.type === 'branding')) {
      messageBus.send('admin', 'broadcast', 'system', {
        event: 'propagation_triggered',
        proposalId: p.id,
        type: p.type,
        title: p.title,
        filesChanged: p.filesChanged,
      });
    }
  }

  res.json({ merged: results.filter(r => r.merged).length, total: results.length, results });
});

// POST /api/admin/test-tweet — send a test tweet via the X bot
router.post('/test-tweet', (req: Request, res: Response) => {
  const { text } = req.body;
  const tweetText = text || `ONEBIT Consensus Engine is live. AI agents are building a game from 1 pixel through blind peer review.\n\nEvery line of code reviewed by 2+ AI agents. Critical changes require human approval.\n\nWatch it happen: onebit.dev\n\n#ONEBIT #AI #GameDev`;

  messageBus.send('admin', 'broadcast', 'system', {
    event: 'x_post',
    handle: '@OneBitAIagent',
    text: tweetText,
  });

  appendAudit('admin', 'test_tweet_triggered', 'x_bot', { text: tweetText });
  res.json({ sent: true, text: tweetText });
});

// POST /api/admin/launch-thread — post the introductory thread to X
router.post('/launch-thread', async (req: Request, res: Response) => {
  const { imageUrls } = req.body as {
    imageUrls?: {
      hero?: string;
      phases?: string;
      consensus?: string;
      agents?: string;
      game?: string;
    };
  };

  if (isThreadPosted()) {
    res.status(400).json({ error: 'Launch thread already posted this session. Restart server to reset.' });
    return;
  }

  const result = await postLaunchThread(imageUrls);
  appendAudit('admin', 'launch_thread_triggered', 'x_bot', {
    success: result.success,
    tweetCount: result.tweetIds.length,
    hasImages: !!imageUrls,
  });

  res.json(result);
});

// GET /api/admin/tweet-stats — check daily tweet usage
router.get('/tweet-stats', (_req: Request, res: Response) => {
  res.json(getTweetStats());
});

// POST /api/admin/delete-tweets — delete tweets by ID
router.post('/delete-tweets', async (req: Request, res: Response) => {
  const { tweetIds } = req.body as { tweetIds: string[] };
  if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
    res.status(400).json({ error: 'Provide { "tweetIds": ["id1", "id2", ...] }' });
    return;
  }

  const result = await deleteTweets(tweetIds);
  res.json(result);
});

// POST /api/admin/nuke-tweets — delete ALL tweets from the account
router.post('/nuke-tweets', async (_req: Request, res: Response) => {
  const result = await deleteAllMyTweets();
  res.json(result);
});

// POST /api/admin/reset — wipe all data for go-live
router.post('/reset', (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'RESET_ALL_DATA') {
    res.status(400).json({ error: 'Send { "confirm": "RESET_ALL_DATA" } to proceed' });
    return;
  }

  const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
  const stores = ['agents.json', 'tasks.json', 'proposals.json', 'messages.json', 'audit.json', 'game-modules.json'];
  const cleared: string[] = [];
  for (const file of stores) {
    try {
      writeFileSync(join(dataDir, file), '[]', 'utf-8');
      cleared.push(file);
    } catch {
      // Skip if file doesn't exist
    }
  }

  appendAudit('admin', 'full_reset', 'system', { cleared });
  res.json({ reset: true, cleared });
});

// POST /api/admin/git-push — push data snapshot to GitHub
router.post('/git-push', async (_req: Request, res: Response) => {
  const result = await pushDataToGitHub();
  res.json({
    ...result,
    autoSyncEnabled: isAutoSyncEnabled(),
  });
});

// GET /api/admin/git-status — check git sync status
router.get('/git-status', (_req: Request, res: Response) => {
  res.json({
    autoSyncEnabled: isAutoSyncEnabled(),
    lastPush: getLastPushTime() || 'never',
    githubTokenSet: !!process.env.GITHUB_TOKEN,
    repo: 'onebitaiagent/onebit',
    schedule: 'every 6 hours',
  });
});

// GET /api/admin/phase — current phase + progress
router.get('/phase', (_req: Request, res: Response) => {
  res.json(getCurrentPhase());
});

// POST /api/admin/advance-phase — manually advance to next phase
router.post('/advance-phase', (_req: Request, res: Response) => {
  const result = advancePhase();
  appendAudit('admin', 'phase_advanced', 'system', result);
  res.json(result);
});

// GET /api/admin/costs — AI API cost tracking
router.get('/costs', (_req: Request, res: Response) => {
  res.json(getAICosts());
});

// GET /api/admin/agents-status — live agent runtime status
router.get('/agents-status', (_req: Request, res: Response) => {
  res.json(getAgentStatus());
});

// POST /api/admin/modules/:id/archive — remove a broken module from the game
router.post('/modules/:id/archive', (req: Request, res: Response) => {
  const result = archiveModule(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  appendAudit('admin', 'module_archived', req.params.id, { name: result.name });
  res.json({ archived: true, module: result });
});

// POST /api/admin/stop-agents — manually stop all agents
router.post('/stop-agents', (_req: Request, res: Response) => {
  stopAgents();
  appendAudit('admin', 'agents_stopped', 'system', { reason: 'manual_stop' });
  res.json({ stopped: true, costs: getAICosts() });
});

export default router;
