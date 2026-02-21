import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

const windows = new Map<string, number[]>();

export function rateLimit(action: string, maxPerHour: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.agent) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const key = `${req.agent.id}:${action}`;
    const now = Date.now();
    const hourAgo = now - 3_600_000;

    let timestamps = windows.get(key) ?? [];
    timestamps = timestamps.filter(t => t > hourAgo);

    if (timestamps.length >= maxPerHour) {
      res.status(429).json({
        error: `Rate limit exceeded: max ${maxPerHour} ${action}(s) per hour`,
        retryAfterMs: timestamps[0] + 3_600_000 - now,
      });
      return;
    }

    timestamps.push(now);
    windows.set(key, timestamps);
    next();
  };
}
