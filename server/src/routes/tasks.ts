import { Router } from 'express';
import { createTask, getTasks, getTask, claimTask, updateTaskStatus } from '../services/task-queue.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { VALID_ROLES, type AgentRoleName } from '../models/types.js';

const router = Router();
router.use(authMiddleware);

// POST /api/tasks
router.post('/', (req: AuthenticatedRequest, res) => {
  const { title, description, role, scopedPaths, priority, estimatedLines, parentTaskId } = req.body;

  if (!title || !description || !role) {
    res.status(400).json({ error: 'title, description, and role are required' });
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Valid: ${VALID_ROLES.join(', ')}` });
    return;
  }

  const task = createTask(
    { title, description, role: role as AgentRoleName, scopedPaths, priority, estimatedLines, parentTaskId },
    req.agent!.id
  );
  if (!task) {
    res.status(409).json({ error: 'A proposal with this title has already been merged' });
    return;
  }
  res.status(201).json(task);
});

// GET /api/tasks
router.get('/', (req: AuthenticatedRequest, res) => {
  const { role, status, priority, claimedBy } = req.query;
  const tasks = getTasks({
    role: role as string | undefined,
    status: status as string | undefined,
    priority: priority as string | undefined,
    claimedBy: claimedBy as string | undefined,
  });
  res.json({ tasks, total: tasks.length });
});

// GET /api/tasks/:id
router.get('/:id', (req: AuthenticatedRequest, res) => {
  const task = getTask(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
});

// POST /api/tasks/:id/claim
router.post('/:id/claim', (req: AuthenticatedRequest, res) => {
  const { task, error } = claimTask(req.params.id, req.agent!.id, req.agent!.role);
  if (error) { res.status(400).json({ error }); return; }
  res.json(task);
});

// POST /api/tasks/:id/progress
router.post('/:id/progress', (req: AuthenticatedRequest, res) => {
  const { task, error } = updateTaskStatus(req.params.id, req.agent!.id, 'in_progress');
  if (error) { res.status(400).json({ error }); return; }
  res.json(task);
});

// POST /api/tasks/:id/complete
router.post('/:id/complete', (req: AuthenticatedRequest, res) => {
  const { proposalId } = req.body;
  const { task, error } = updateTaskStatus(req.params.id, req.agent!.id, 'completed', proposalId);
  if (error) { res.status(400).json({ error }); return; }
  res.json(task);
});

export default router;
