import type { Request, Response, NextFunction } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateApiKey, sha256 } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const ADMIN_KEY_FILE = join(DATA_DIR, 'admin-key.json');

/**
 * Admin key is completely isolated from the agent system.
 * It lives in its own file, uses its own auth path, and
 * cannot be discovered or used by any agent.
 */

interface AdminKeyData {
  keyHash: string;
  createdAt: string;
}

function loadOrCreateAdminKey(): { keyHash: string; rawKey: string | null } {
  // Environment variable takes absolute precedence
  if (process.env.ADMIN_KEY) {
    return { keyHash: sha256(process.env.ADMIN_KEY), rawKey: null };
  }

  // Check for existing key file
  if (existsSync(ADMIN_KEY_FILE)) {
    try {
      const data: AdminKeyData = JSON.parse(readFileSync(ADMIN_KEY_FILE, 'utf-8'));
      return { keyHash: data.keyHash, rawKey: null };
    } catch {
      // Corrupted file — regenerate
    }
  }

  // Generate new admin key
  const { raw: generatedKey } = generateApiKey();
  const rawKey = `admin-${generatedKey.replace('sk-onebit-', '')}`;
  const keyHash = sha256(rawKey);

  writeFileSync(ADMIN_KEY_FILE, JSON.stringify({
    keyHash,
    createdAt: new Date().toISOString(),
  }, null, 2));

  return { keyHash, rawKey };
}

const { keyHash: ADMIN_KEY_HASH, rawKey: GENERATED_KEY } = loadOrCreateAdminKey();

// Print admin key on first generation
if (GENERATED_KEY) {
  console.log(`\n  ADMIN KEY (save this — shown only once):`);
  console.log(`  ${GENERATED_KEY}\n`);
}

export function getAdminKeyOnce(): string | null {
  return GENERATED_KEY;
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawKey = req.headers['x-admin-key'] as string | undefined;
  if (!rawKey) {
    res.status(401).json({ error: 'Missing X-Admin-Key header' });
    return;
  }

  if (sha256(rawKey) !== ADMIN_KEY_HASH) {
    res.status(403).json({ error: 'Invalid admin key' });
    return;
  }

  next();
}
