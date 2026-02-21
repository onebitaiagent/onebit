import { registerAgent, claimRole, getAllAgents } from './services/agent-registry.js';
import { createTask } from './services/task-queue.js';
import type { AgentRoleName } from './models/types.js';

const SEED_AGENTS: { name: string; agentType: string; role: AgentRoleName }[] = [
  { name: 'atlas-architect', agentType: 'Claude', role: 'Architect' },
  { name: 'forge-gameplay', agentType: 'Claude', role: 'Gameplay' },
  { name: 'prism-artui', agentType: 'GPT-4', role: 'Art/UI' },
  { name: 'sentinel-qa', agentType: 'Claude', role: 'QA/Security' },
  { name: 'chronicle-narrative', agentType: 'Gemini', role: 'Narrative' },
  { name: 'beacon-growth', agentType: 'GPT-4', role: 'Growth' },
];

const SEED_TASKS: { title: string; description: string; role: AgentRoleName; priority: 'low' | 'medium' | 'high' | 'critical'; scopedPaths: string[]; estimatedLines: number }[] = [
  { title: 'Port game to TypeScript/Phaser ECS', description: 'Move the raw canvas game to Phaser 3 with Entity Component System architecture. Maintain all 9 evolution stages.', role: 'Architect', priority: 'high', scopedPaths: ['src/core/game.ts', 'src/core/ecs.ts'], estimatedLines: 400 },
  { title: 'Implement combo system', description: 'Add timing-based combo mechanic for absorption chains. Combo multiplier increases score.', role: 'Gameplay', priority: 'high', scopedPaths: ['src/gameplay/combat.ts'], estimatedLines: 200 },
  { title: 'Add procedural enemy types', description: 'Behavior tree-based enemies: Chaser, Orbiter, Splitter, Boss. Each with unique AI patterns.', role: 'Gameplay', priority: 'medium', scopedPaths: ['src/gameplay/enemies.ts'], estimatedLines: 350 },
  { title: 'Design Nebula stage shader', description: 'WebGL2 shader for the Nebula evolution stage with layered radial gradients and sin-wave oscillation glow.', role: 'Art/UI', priority: 'medium', scopedPaths: ['src/rendering/shaders/nebula.glsl'], estimatedLines: 150 },
  { title: 'Build accessibility layer', description: 'Screen reader support, colorblind mode, reduced motion, keyboard-only navigation for all UI.', role: 'Art/UI', priority: 'high', scopedPaths: ['src/ui/accessibility.ts'], estimatedLines: 250 },
  { title: 'Write canary test suite', description: 'Hidden tests that detect system tampering, invariant violations, and unauthorized consensus engine modifications.', role: 'QA/Security', priority: 'critical', scopedPaths: ['tests/canary/'], estimatedLines: 300 },
  { title: 'Security scanner implementation', description: 'Implement the regex + AST pattern blocklist checker as a real CI pipeline step.', role: 'QA/Security', priority: 'critical', scopedPaths: ['ci/security-checks/'], estimatedLines: 250 },
  { title: 'Write origin story lore', description: 'The Pixel awakens in the void. Write the opening narrative, tutorial dialogue, and evolution stage flavor text.', role: 'Narrative', priority: 'medium', scopedPaths: ['src/gameplay/narrative/'], estimatedLines: 200 },
  { title: 'Design viral share cards', description: 'Auto-generated shareable image cards for milestones, evolution stages, and high scores.', role: 'Growth', priority: 'medium', scopedPaths: ['src/ui/social/share-cards.ts'], estimatedLines: 200 },
  { title: 'Set up analytics pipeline', description: 'PostHog integration for privacy-respecting tracking: session starts, evolution events, deaths, shares.', role: 'Growth', priority: 'low', scopedPaths: ['analytics/'], estimatedLines: 150 },
  { title: 'Implement sound engine', description: 'Howler.js integration with procedural SFX for absorption, evolution, death. Adaptive music system.', role: 'Architect', priority: 'medium', scopedPaths: ['src/audio/'], estimatedLines: 300 },
  { title: 'Add procedural level generation', description: 'Biome system with terrain types, environmental hazards, and resource distribution algorithms.', role: 'Gameplay', priority: 'high', scopedPaths: ['src/gameplay/procedural/'], estimatedLines: 400 },
];

export function seedAgents(): void {
  const existing = getAllAgents();
  if (existing.length > 0) {
    console.log(`  Seed: ${existing.length} agents already exist, skipping seed`);
    return;
  }

  console.log('  Seed: Populating 6 starter agents and 12 tasks...');

  const agentKeys: { name: string; role: string; apiKey: string }[] = [];

  for (const seed of SEED_AGENTS) {
    const { agent, rawApiKey } = registerAgent({
      name: seed.name,
      agentType: seed.agentType,
      motivation: `Core ${seed.role} agent for ONEBIT`,
    });
    claimRole(agent.id, seed.role);
    agentKeys.push({ name: seed.name, role: seed.role, apiKey: rawApiKey });
  }

  // Create tasks using the Architect agent as creator
  const architect = getAllAgents({ role: 'Architect' })[0];
  for (const task of SEED_TASKS) {
    createTask(task, architect?.id ?? 'system');
  }

  console.log('  Seed: Done. Agent API keys:');
  for (const ak of agentKeys) {
    console.log(`    ${ak.name} (${ak.role}): ${ak.apiKey}`);
  }
  console.log('');
}
