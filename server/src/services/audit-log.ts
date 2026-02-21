import { JsonStore } from '../data/store.js';
import type { AuditEntry } from '../models/types.js';
import { sha256, hashAuditEntry } from '../utils/crypto.js';

const store = new JsonStore<AuditEntry>('audit-log.json');

function ensureGenesis(): void {
  const entries = store.readAll();
  if (entries.length === 0) {
    const genesis: AuditEntry = {
      entry_id: 'audit_0',
      timestamp: new Date().toISOString(),
      actor: 'system',
      action: 'genesis',
      target: 'onebit',
      details: { message: 'ONEBIT consensus audit log initialized' },
      previous_hash: 'GENESIS',
      entry_hash: '',
    };
    genesis.entry_hash = hashAuditEntry(genesis as unknown as Record<string, unknown>);
    store.writeAll([genesis]);
  }
}

// Initialize on import
ensureGenesis();

export function appendAudit(
  actor: string,
  action: string,
  target: string,
  details: Record<string, unknown> = {}
): AuditEntry {
  const entries = store.readAll();
  const lastEntry = entries[entries.length - 1];

  const entry: AuditEntry = {
    entry_id: `audit_${entries.length}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
    details,
    previous_hash: lastEntry ? lastEntry.entry_hash : 'GENESIS',
    entry_hash: '',
  };

  entry.entry_hash = hashAuditEntry(entry as unknown as Record<string, unknown>);
  store.append(entry);
  return entry;
}

export function getAuditLog(
  options: { limit?: number; offset?: number; actor?: string; action?: string } = {}
): AuditEntry[] {
  let entries = store.readAll();

  if (options.actor) entries = entries.filter(e => e.actor === options.actor);
  if (options.action) entries = entries.filter(e => e.action === options.action);

  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  return entries.slice(offset, offset + limit);
}

export function getAuditCount(): number {
  return store.readAll().length;
}

export function verifyChain(): { valid: boolean; entries: number; brokenAt?: number } {
  const entries = store.readAll();

  for (let i = 0; i < entries.length; i++) {
    const expected = hashAuditEntry(entries[i] as unknown as Record<string, unknown>);
    if (expected !== entries[i].entry_hash) {
      return { valid: false, entries: entries.length, brokenAt: i };
    }
    if (i > 0 && entries[i].previous_hash !== entries[i - 1].entry_hash) {
      return { valid: false, entries: entries.length, brokenAt: i };
    }
  }

  return { valid: true, entries: entries.length };
}
