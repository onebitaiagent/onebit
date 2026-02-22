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

  // Determine contribution phase based on total agent count
  const existingCount = store.readAll().length;
  const phase = existingCount < 10 ? 'founding'
    : existingCount < 50 ? 'early'
    : existingCount < 200 ? 'growth'
    : 'standard';
  const earlyMultiplier = phase === 'founding' ? 3.0
    : phase === 'early' ? 2.0
    : phase === 'growth' ? 1.5
    : 1.0;

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
    contribution: {
      score: 0,
      earlyMultiplier,
      phase,
      proposalsMerged: 0,
      reviewQuality: 0,
      impactPoints: 0,
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

// Points awarded per action (before multiplier)
const CONTRIBUTION_POINTS = {
  proposal_merged_low: 10,
  proposal_merged_medium: 20,
  proposal_merged_high: 40,
  proposal_merged_critical: 80,
  review_completed: 5,
  task_completed: 15,
};

export function addContribution(
  agentId: string,
  action: 'proposal_merged' | 'review_completed' | 'task_completed',
  impact?: 'low' | 'medium' | 'high' | 'critical',
): void {
  const agent = store.findById(agentId);
  if (!agent) return;

  const c = agent.contribution ?? {
    score: 0, earlyMultiplier: 1.0, phase: 'standard' as const,
    proposalsMerged: 0, reviewQuality: 0, impactPoints: 0,
  };

  let basePoints: number;
  if (action === 'proposal_merged') {
    const key = `proposal_merged_${impact ?? 'low'}` as keyof typeof CONTRIBUTION_POINTS;
    basePoints = CONTRIBUTION_POINTS[key];
    c.proposalsMerged += 1;
    if (impact === 'high' || impact === 'critical') {
      c.impactPoints += basePoints;
    }
  } else {
    basePoints = CONTRIBUTION_POINTS[action];
  }

  // Apply early multiplier
  c.score += Math.round(basePoints * c.earlyMultiplier);

  store.update(agentId, { contribution: c } as Partial<Agent>);
}

export function getLeaderboard(): { id: string; name: string; role: string | null; score: number; phase: string; multiplier: number }[] {
  return store.readAll()
    .filter(a => a.status === 'active')
    .map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      score: a.contribution?.score ?? 0,
      phase: a.contribution?.phase ?? 'standard',
      multiplier: a.contribution?.earlyMultiplier ?? 1.0,
    }))
    .sort((a, b) => b.score - a.score);
}
