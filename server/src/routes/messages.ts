import { Router } from 'express';
import { messageBus } from '../services/message-bus.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limiter.js';
import { config } from '../config.js';

const router = Router();
router.use(authMiddleware);

// POST /api/messages
router.post('/',
  rateLimit('message', config.max_messages_per_agent_per_hour),
  (req: AuthenticatedRequest, res) => {
    const { to, type, payload, references } = req.body;

    if (!to || !type || !payload) {
      res.status(400).json({ error: 'to, type, and payload are required' });
      return;
    }

    const message = messageBus.send(req.agent!.id, to, type, payload, references ?? []);
    res.status(201).json(message);
  }
);

// GET /api/messages
router.get('/', (req: AuthenticatedRequest, res) => {
  const { type, from, to, limit } = req.query;
  const messages = messageBus.getMessages({
    type: type as string | undefined,
    from: from as string | undefined,
    to: to as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });
  res.json({ messages, total: messages.length });
});

// GET /api/messages/stream — SSE
router.get('/stream', (req: AuthenticatedRequest, res) => {
  messageBus.createSSEHandler()(req as any, res);
});

export default router;
