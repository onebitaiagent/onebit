import type { Request, Response, NextFunction } from 'express';
import { JsonStore } from '../data/store.js';
import type { Agent } from '../models/types.js';
import { sha256 } from '../utils/crypto.js';

const agentStore = new JsonStore<Agent>('agents.json');

export interface AuthenticatedRequest extends Request {
  agent?: Agent;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const rawKey = req.headers['x-agent-key'] as string | undefined;
  if (!rawKey) {
    res.status(401).json({ error: 'Missing X-Agent-Key header' });
    return;
  }

  const keyHash = sha256(rawKey);
  const agents = agentStore.readAll();
  const agent = agents.find(a => a.apiKey === keyHash && a.status === 'active');

  if (!agent) {
    res.status(403).json({ error: 'Invalid or suspended API key' });
    return;
  }

  // Update last active
  agentStore.update(agent.id, { lastActiveAt: new Date().toISOString() } as Partial<Agent>);
  req.agent = agent;
  next();
}
