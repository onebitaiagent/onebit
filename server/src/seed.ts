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
  // Game code modules — these produce REAL code that gets injected into the live game
  { title: 'Add ambient background starfield', description: 'Add drifting stars to the void background. First visual layer beyond the pixel.', role: 'Art/UI', priority: 'medium', scopedPaths: ['game/modules/stars.js'], estimatedLines: 30 },
  { title: 'Add pixel glow effect', description: 'Radial glow emanating from the player pixel. Makes the pixel feel alive.', role: 'Art/UI', priority: 'low', scopedPaths: ['game/modules/glow.js'], estimatedLines: 15 },
  { title: 'Implement movement trail system', description: 'Fading trail behind the pixel when moving. Shows player movement history.', role: 'Gameplay', priority: 'medium', scopedPaths: ['game/modules/trail.js'], estimatedLines: 20 },
  { title: 'Create floating particle spawner', description: 'Tiny energy particles that float around the void. Can be absorbed by the pixel.', role: 'Gameplay', priority: 'high', scopedPaths: ['game/modules/particles.js'], estimatedLines: 40 },
  { title: 'Build score display HUD', description: 'Minimal heads-up display showing score and absorbed count.', role: 'Art/UI', priority: 'medium', scopedPaths: ['game/modules/hud.js'], estimatedLines: 20 },
  { title: 'Add background grid environment', description: 'Subtle grid that pulses with movement. Gives depth to the void.', role: 'Art/UI', priority: 'low', scopedPaths: ['game/modules/grid.js'], estimatedLines: 25 },
  { title: 'Design absorption burst particle effects', description: 'Particle explosion when absorbing energy. Visual feedback for collecting.', role: 'Art/UI', priority: 'medium', scopedPaths: ['game/modules/burst.js'], estimatedLines: 30 },
  { title: 'Implement enemy AI spawner', description: 'Red hostile entities that chase the pixel. Death on contact. First challenge.', role: 'Gameplay', priority: 'high', scopedPaths: ['game/modules/enemies.js'], estimatedLines: 45 },
  { title: 'Create absorption field mechanic', description: 'Hold Space to project a field that pulls nearby particles toward the pixel.', role: 'Gameplay', priority: 'high', scopedPaths: ['game/modules/absorb.js'], estimatedLines: 25 },
  { title: 'Add screen shake VFX system', description: 'Camera shake on enemy collision. Adds impact to events.', role: 'Art/UI', priority: 'low', scopedPaths: ['game/modules/shake.js'], estimatedLines: 20 },
  // Infrastructure tasks
  { title: 'Write canary test suite', description: 'Hidden tests that detect system tampering and unauthorized consensus engine modifications.', role: 'QA/Security', priority: 'critical', scopedPaths: ['tests/canary/'], estimatedLines: 300 },
  { title: 'Security scanner implementation', description: 'Pattern blocklist checker as a CI pipeline step.', role: 'QA/Security', priority: 'critical', scopedPaths: ['ci/security-checks/'], estimatedLines: 250 },
  { title: 'Write origin story lore', description: 'The Pixel awakens in the void. Opening narrative and evolution stage flavor text.', role: 'Narrative', priority: 'medium', scopedPaths: ['src/gameplay/narrative/'], estimatedLines: 200 },
  // Website & branding tasks
  { title: 'Redesign homepage hero section', description: 'Website update: New hero section with animated pixel evolution. Auto-propagates on merge.', role: 'Growth', priority: 'medium', scopedPaths: ['web/src/App.jsx'], estimatedLines: 200 },
  { title: 'Create ONEBIT brand kit', description: 'Branding: Logo variants, color palette, typography guide. Propagates across all outputs.', role: 'Art/UI', priority: 'high', scopedPaths: ['branding/style-guide.md'], estimatedLines: 150 },
  { title: 'Add SEO meta tags and sitemap', description: 'Website update: OG tags, Twitter cards, sitemap. Auto-propagates on merge.', role: 'Growth', priority: 'medium', scopedPaths: ['web/index.html'], estimatedLines: 100 },
];

export function seedAgents(): void {
  const existing = getAllAgents();
  if (existing.length > 0) {
    console.log(`  Seed: ${existing.length} agents already exist, skipping seed`);
    return;
  }

  console.log('  Seed: Populating 6 starter agents and 16 tasks...');

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
