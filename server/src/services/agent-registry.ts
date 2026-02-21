import { JsonStore } from '../data/store.js';
import type { Agent, AgentRoleName } from '../models/types.js';
import { VALID_ROLES } from '../models/types.js';
import { generateId, generateApiKey } from '../utils/crypto.js';
import { appendAudit } from './audit-log.js';
import { roles } from '../config.js';

const store = new JsonStore<Agent>('agents.json');

export interface RegisterInput {
  name: string;
  agentType: string;
  github?: string;
  email?: string;
  motivation?: string;
}

export function registerAgent(input: RegisterInput): { agent: Agent; rawApiKey: string } {
  const { raw, hash } = generateApiKey();

  const agent: Agent = {
    id: generateId('agent'),
    name: input.name,
    role: null,
    apiKey: hash,
    status: 'active',
    capabilities: {
      agentType: input.agentType,
      github: input.github,
      email: input.email,
      motivation: input.motivation,
    },
    ownedPaths: [],
    reviewFocus: [],
    canEmergencyBlock: false,
    stats: {
      proposalsSubmitted: 0,
      proposalsApproved: 0,
      reviewsCompleted: 0,
      tasksCompleted: 0,
    },
    registeredAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  store.append(agent);
  appendAudit('system', 'agent_registered', agent.id, { name: agent.name, agentType: input.agentType });

  return { agent, rawApiKey: raw };
}

export function claimRole(agentId: string, roleName: AgentRoleName): Agent | null {
  if (!VALID_ROLES.includes(roleName)) return null;

  const roleDef = roles.find(r => r.name === roleName);
  if (!roleDef) return null;

  const updated = store.update(agentId, {
    role: roleName,
    ownedPaths: roleDef.owned_paths,
    reviewFocus: roleDef.review_focus,
    canEmergencyBlock: roleDef.can_emergency_block,
  } as Partial<Agent>);

  if (updated) {
    appendAudit(agentId, 'role_claimed', agentId, { role: roleName });
  }

  return updated;
}

export function getAgent(id: string): Agent | undefined {
  return store.findById(id);
}

export function getAllAgents(filter?: { role?: string; status?: string }): Agent[] {
  const all = store.readAll();
  return all.filter(a => {
    if (filter?.role && a.role !== filter.role) return false;
    if (filter?.status && a.status !== filter.status) return false;
    return true;
  });
}

export function getAgentByKeyHash(keyHash: string): Agent | undefined {
  return store.readAll().find(a => a.apiKey === keyHash);
}

export function updateAgentStats(agentId: string, statUpdates: Partial<Agent['stats']>): void {
  const agent = store.findById(agentId);
  if (!agent) return;
  store.update(agentId, {
    stats: { ...agent.stats, ...statUpdates },
  } as Partial<Agent>);
}
