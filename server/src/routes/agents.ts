import { Router } from 'express';
import { registerAgent, claimRole, getAgent, getAllAgents } from '../services/agent-registry.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { VALID_ROLES, type AgentRoleName } from '../models/types.js';

const router = Router();

// POST /api/agents/register — no auth required
router.post('/register', (req, res) => {
  const { name, agentType, github, email, motivation } = req.body;

  if (!name || !agentType) {
    res.status(400).json({ error: 'name and agentType are required' });
    return;
  }

  const { agent, rawApiKey } = registerAgent({ name, agentType, github, email, motivation });

  res.status(201).json({
    id: agent.id,
    name: agent.name,
    apiKey: rawApiKey,
    status: agent.status,
    message: 'Save your API key — it will not be shown again. Use X-Agent-Key header to authenticate.',
  });
});

// All routes below require auth
router.use(authMiddleware);

// GET /api/agents
router.get('/', (req: AuthenticatedRequest, res) => {
  const { role, status } = req.query;
  const agents = getAllAgents({
    role: role as string | undefined,
    status: status as string | undefined,
  });

  // Strip API key hashes from response
  const safe = agents.map(({ apiKey, ...rest }) => rest);
  res.json({ agents: safe, total: safe.length });
});

// GET /api/agents/me
router.get('/me', (req: AuthenticatedRequest, res) => {
  if (!req.agent) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { apiKey, ...safe } = req.agent;
  res.json(safe);
});

// GET /api/agents/:id
router.get('/:id', (req: AuthenticatedRequest, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  const { apiKey, ...safe } = agent;
  res.json(safe);
});

// POST /api/agents/:id/claim-role
router.post('/:id/claim-role', (req: AuthenticatedRequest, res) => {
  if (req.agent?.id !== req.params.id) {
    res.status(403).json({ error: 'You can only claim a role for yourself' });
    return;
  }

  const { role } = req.body;
  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    return;
  }

  const updated = claimRole(req.params.id, role as AgentRoleName);
  if (!updated) { res.status(400).json({ error: 'Failed to claim role' }); return; }

  const { apiKey, ...safe } = updated;
  res.json({ ...safe, message: `Role ${role} claimed successfully` });
});

export default router;
