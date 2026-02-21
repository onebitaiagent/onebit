import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function generateId(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

export function generateApiKey(): { raw: string; hash: string } {
  const raw = `sk-onebit-${randomBytes(32).toString('hex')}`;
  const hash = sha256(raw);
  return { raw, hash };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashAuditEntry(entry: Record<string, unknown>): string {
  const { entry_hash, ...rest } = entry;
  return sha256(JSON.stringify(rest));
}
