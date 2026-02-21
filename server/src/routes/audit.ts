import { Router } from 'express';
import { getAuditLog, verifyChain } from '../services/audit-log.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/audit-log
router.get('/', (req, res) => {
  const { limit, offset, actor, action } = req.query;
  const entries = getAuditLog({
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
    actor: actor as string | undefined,
    action: action as string | undefined,
  });
  res.json({ entries, total: entries.length });
});

// GET /api/audit-log/verify
router.get('/verify', (_req, res) => {
  const result = verifyChain();
  res.json(result);
});

export default router;
