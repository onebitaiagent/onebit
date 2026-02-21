import { Router } from 'express';
import {
  createProposal,
  submitProposal,
  submitReview,
  castVote,
  mergeProposal,
  closeProposal,
  getProposal,
  getProposals,
} from '../services/consensus-engine.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limiter.js';
import { config } from '../config.js';

const router = Router();
router.use(authMiddleware);

// POST /api/proposals
router.post('/', (req: AuthenticatedRequest, res) => {
  const {
    title, description, type, impact, branch,
    filesChanged, linesAdded, linesRemoved,
    testResults, dependenciesAdded, securityNotes,
    designRationale, taskId,
  } = req.body;

  if (!title || !description || !type || !impact || !branch || !filesChanged || !testResults) {
    res.status(400).json({ error: 'Missing required fields: title, description, type, impact, branch, filesChanged, testResults' });
    return;
  }

  if (!req.agent!.role) {
    res.status(400).json({ error: 'You must claim a role before creating proposals' });
    return;
  }

  const proposal = createProposal({
    title, description, type, impact, branch,
    filesChanged, linesAdded: linesAdded ?? 0, linesRemoved: linesRemoved ?? 0,
    testResults, dependenciesAdded, securityNotes,
    designRationale, taskId,
  }, req.agent!.id);

  res.status(201).json(proposal);
});

// GET /api/proposals
router.get('/', (req: AuthenticatedRequest, res) => {
  const { state, agent } = req.query;
  const proposals = getProposals({
    state: state as string | undefined,
    agent: agent as string | undefined,
  });
  res.json({ proposals, total: proposals.length });
});

// GET /api/proposals/:id
router.get('/:id', (req: AuthenticatedRequest, res) => {
  const proposal = getProposal(req.params.id, req.agent?.id);
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
  res.json(proposal);
});

// POST /api/proposals/:id/submit
router.post('/:id/submit',
  rateLimit('proposal_submit', config.max_proposals_per_agent_per_hour),
  (req: AuthenticatedRequest, res) => {
    const { proposal, error } = submitProposal(req.params.id, req.agent!.id);
    if (error) { res.status(400).json({ error }); return; }
    res.json(proposal);
  }
);

// POST /api/proposals/:id/review
router.post('/:id/review', (req: AuthenticatedRequest, res) => {
  const { verdict, rationale, scores } = req.body;
  if (!verdict || !rationale || !scores) {
    res.status(400).json({ error: 'verdict, rationale, and scores are required' });
    return;
  }

  const { proposal, error } = submitReview(req.params.id, req.agent!.id, { verdict, rationale, scores });
  if (error) { res.status(400).json({ error }); return; }
  res.json(proposal);
});

// POST /api/proposals/:id/vote
router.post('/:id/vote', (req: AuthenticatedRequest, res) => {
  const { vote, rationale } = req.body;
  if (!vote || !rationale) {
    res.status(400).json({ error: 'vote and rationale are required' });
    return;
  }

  const { proposal, error } = castVote(req.params.id, req.agent!.id, { vote, rationale });
  if (error) { res.status(400).json({ error }); return; }
  res.json(proposal);
});

// POST /api/proposals/:id/merge — human/admin action
router.post('/:id/merge', (req: AuthenticatedRequest, res) => {
  const { proposal, error } = mergeProposal(req.params.id);
  if (error) { res.status(400).json({ error }); return; }
  res.json(proposal);
});

// POST /api/proposals/:id/close
router.post('/:id/close', (req: AuthenticatedRequest, res) => {
  const { proposal, error } = closeProposal(req.params.id, req.agent!.id);
  if (error) { res.status(400).json({ error }); return; }
  res.json(proposal);
});

export default router;
