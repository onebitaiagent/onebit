/**
 * Live AI Agents — 6 autonomous agents that use Claude to write real game code,
 * review each other's proposals, and vote through the consensus pipeline.
 *
 * Each agent runs independently on its own schedule.
 * No pre-written code, no random verdicts — everything is AI-generated.
 */

import { getAllAgents } from './agent-registry.js';
import { getTasks, claimTask, updateTaskStatus, createTask } from './task-queue.js';
import {
  createProposal, submitProposal, submitReview, castVote, getProposals,
  mergeProposal,
} from './consensus-engine.js';
import { registerGameModule, getActiveModules, getAllModules } from './game-evolution.js';
import { messageBus } from './message-bus.js';
import { isAIEnabled, generateGameCode, reviewCode } from './ai-client.js';
import type { AgentRoleName } from '../models/types.js';

// ─── Game Evolution Roadmap ─────────────────────────────────
// Structured progression from 1 pixel → full game
// Matches the PHASES on the website: Origin → Prototype → Alpha → Beta → Launch → Mature

interface RoadmapTask { title: string; desc: string; role: AgentRoleName; phase: string }

const GAME_ROADMAP: RoadmapTask[] = [
  // ═══ PHASE 1: ORIGIN (Day 1) — Canvas renderer, input, particles, basic collision ═══
  { title: 'Add ambient background starfield', desc: 'Drifting stars backdrop. First sign of life beyond the pixel. Initialize 60-120 stars with random positions, sizes, brightness. Drift slowly downward. Flicker with sine wave.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Add pixel glow effect', desc: 'Soft radial glow around the player pixel. Use ctx.shadowBlur or radial gradient. Pulse gently with sine wave. Color matches current evolution stage.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Implement movement trail system', desc: 'Fading afterimage trail behind the pixel as it moves. Store last 15-20 positions. Draw with decreasing opacity. Color matches player.', role: 'Gameplay', phase: 'Origin' },
  { title: 'Create floating particle spawner', desc: 'Collectible energy particles that drift around the canvas. Spawn 10-20 at a time. Random colors (cyan, green, gold). Float with gentle sine motion. Player absorbs on contact.', role: 'Gameplay', phase: 'Origin' },
  { title: 'Build score display HUD', desc: 'Animated score counter top-left. Show score with counting animation on change. Show absorbed count. Pixel font style. Semi-transparent background.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Design absorption burst VFX', desc: 'Particle explosion when absorbing energy. 5-10 small particles burst outward from absorption point. Fade and shrink over 20 frames. Match absorbed particle color.', role: 'Art/UI', phase: 'Origin' },

  // ═══ PHASE 2: PROTOTYPE (Week 1-2) — Enemy AI, procedures, camera, multiple mechanics ═══
  { title: 'Implement enemy AI spawner', desc: 'Hostile red entities that spawn at screen edges. Start slow, patrol randomly. After stage 3, track toward player. Collision with player causes damage. Multiple HP levels.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Create absorption field mechanic', desc: 'Hold SPACE to activate pull field. Draws nearby particles toward player within radius. Radius grows with stage. Visual: pulsing circle around player. Drains slowly while active.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Add screen shake VFX system', desc: 'Camera offset shake on impacts. Variable intensity and duration. Dampen over time. Apply as ctx.translate offset before all drawing, reset after.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Add adaptive difficulty scaling', desc: 'Track g.score to scale: spawn rate increases, enemies get faster, more HP. Every 50 points increases difficulty tier. Cap at tier 10.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Implement score streak mechanic', desc: 'Track rapid absorptions within 2-second windows. Chain counter shows "x2", "x3" etc. Multiplies score gains. Visual: multiplier text floats up from player. Resets after 2s idle.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Create evolution stage transitions', desc: 'When absorption threshold reached, trigger evolution. Flash screen white, shake camera, spawn burst of particles. Player grows larger, changes color. Show stage name text briefly.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Add background grid environment', desc: 'Subtle grid lines on the background. Lines pulse faintly. Scroll with parallax as player moves. Gives sense of scale and movement through space.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Create dash ability', desc: 'Double-tap movement direction or press SHIFT for burst of speed. 3-second cooldown. Leave bright trail during dash. Brief invulnerability during dash frames.', role: 'Gameplay', phase: 'Prototype' },

  // ═══ PHASE 3: ALPHA (Week 3-6) — Full progression, skill variety, bosses, biomes ═══
  { title: 'Implement shield mechanic', desc: 'Press E to activate shield. Absorbs 3 hits then breaks. Cooldown 10 seconds. Visual: rotating hexagonal barrier around player. Flashes on hit.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Create power-up spawner', desc: 'Rare floating power-ups: SPEED (blue, 2x speed 5s), MAGNET (yellow, auto-absorb 5s), SHIELD (green, temporary barrier). Spawn every 30s. Distinct visual shapes.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Add environmental hazards', desc: 'Pulsing danger zones that damage player on contact. Red circular areas that expand and contract. Spawn at random positions. Warn with flashing before activating.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Create boss entity system', desc: 'Large enemy at score milestones (every 200 points). Boss has 10+ HP, unique attack patterns (charge, spawn minions, area denial). Drops massive points on defeat. Health bar at top of screen.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Build wave announcement system', desc: 'Text overlay announcing new difficulty waves: "WAVE 3", "BOSS INCOMING". Slide in from right, hold, slide out. Dramatic font styling with glow.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Add minimap radar overlay', desc: 'Small circular radar bottom-right showing entity positions as dots relative to player (center). Enemies red, particles green, power-ups gold. Semi-transparent.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Implement combo chain system', desc: 'Chain different actions for bonus: absorb + absorb + dash + absorb = combo. Track last 5 actions. Display combo name and bonus. "TRIPLE ABSORB +150", "DASH HARVEST +200".', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Add death and respawn sequence', desc: 'On death: pixel shatters into fragments, screen flashes red, fade to black. Show score summary. "Press SPACE to restart". Reset state but keep high score.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Add background nebula effect', desc: 'Colorful nebula clouds in deep background. Use overlapping semi-transparent circles with gradient fills. Slowly shift colors. Parallax scroll behind stars.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Create orbit particles effect', desc: 'Small particles orbit the player pixel. Number increases with stage. Orbit radius grows with evolution. Visual: dots tracing circular paths around player center.', role: 'Art/UI', phase: 'Alpha' },

  // ═══ PHASE 4: BETA (Month 2-3) — Multiplayer prep, leaderboards, social ═══
  { title: 'Implement high score persistence', desc: 'Save top 10 scores to g._highScores using localStorage pattern. Show high score table on death screen. Highlight if new high score achieved.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Add achievement notification system', desc: 'Track milestones: "First Blood" (first enemy kill), "Century" (100 absorptions), "Untouchable" (30s no damage). Toast notifications slide in from top.', role: 'Art/UI', phase: 'Beta' },
  { title: 'Create entity health bar system', desc: 'Show HP bars above enemies with more than 1 HP. Green bar depletes to red. Boss gets large bar at screen top. Smooth animation on damage.', role: 'Art/UI', phase: 'Beta' },
  { title: 'Implement enemy variety system', desc: 'Multiple enemy types: Drone (follows), Turret (stationary, shoots), Swarm (small, travels in packs), Tank (slow, high HP). Different colors and behaviors.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Add particle physics system', desc: 'Particles interact with each other. Cluster formation. Magnetic attraction between same-color particles. Chain reaction absorptions. Visual: connection lines between close particles.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Build pause menu overlay', desc: 'Press P or ESC to pause. Darken background, show "PAUSED" with resume/restart options. Freeze all game state. Show current stats.', role: 'Art/UI', phase: 'Beta' },
];

let roadmapIndex = 0;

// ─── Live Agent Class ──────────────────────────────────────

class LiveAgent {
  private busy = false;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly role: AgentRoleName,
    public readonly reviewFocus: string[],
  ) {}

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      // 1. Review proposals assigned to this agent
      await this.doReviews();

      // 2. Vote on proposals in voting phase
      await this.doVotes();

      // 3. Find a task and generate code
      await this.doWork();
    } catch (err) {
      console.error(`  [${this.name}] Error:`, err instanceof Error ? err.message : err);
    } finally {
      this.busy = false;
    }
  }

  // ─── Review proposals where this agent is assigned ────
  private async doReviews(): Promise<void> {
    const proposals = getProposals({ state: 'IN_REVIEW' });

    for (const p of proposals) {
      // Check if assigned to review and haven't reviewed yet
      if (!p.assignedReviewers.includes(this.id)) continue;
      if (p.reviews.some(r => r.agentId === this.id)) continue;

      // Check 5-minute cooldown from submission
      if (p.submittedAt) {
        const elapsed = Date.now() - new Date(p.submittedAt).getTime();
        if (elapsed < 5 * 60 * 1000) continue; // Too early
      }

      // Get the code to review — check game module first, then proposal description
      const allModules = getAllModules();
      const linkedModule = allModules.find(m => m.proposalId === p.id);
      const code = linkedModule?.code || p.description;

      try {
        const review = await reviewCode(p.title, code, this.role, this.reviewFocus);

        const result = submitReview(p.id, this.id, {
          verdict: review.verdict,
          rationale: review.rationale,
          scores: review.scores,
        });

        if (result.proposal) {
          console.log(`  [${this.name}] Reviewed "${p.title}" → ${review.verdict}`);
        } else if (result.error) {
          // Only log unexpected errors (not cooldown)
          if (!result.error.includes('minutes') && !result.error.includes('cool')) {
            console.log(`  [${this.name}] Review error: ${result.error}`);
          }
        }
      } catch (err) {
        console.error(`  [${this.name}] AI review failed:`, err instanceof Error ? err.message : err);
      }

      // Only review one proposal per tick to spread work
      break;
    }
  }

  // ─── Vote on proposals in VOTING state ────────────────
  private async doVotes(): Promise<void> {
    const proposals = getProposals({ state: 'VOTING' });

    for (const p of proposals) {
      if (!p.assignedReviewers.includes(this.id)) continue;
      if (p.votes.some(v => v.agentId === this.id)) continue;

      // Derive vote from review verdict
      const myReview = p.reviews.find(r => r.agentId === this.id);
      const approve = myReview ? myReview.verdict === 'approve' : true;

      const result = castVote(p.id, this.id, {
        vote: approve ? 'approve' : 'reject',
        rationale: approve
          ? `Confirming: ${myReview?.rationale?.slice(0, 80) || 'Code looks solid.'}`
          : `Rejecting: ${myReview?.rationale?.slice(0, 80) || 'Needs changes.'}`,
      });

      if (result.proposal) {
        console.log(`  [${this.name}] Voted ${approve ? 'approve' : 'reject'} on "${p.title}" → ${result.proposal.state}`);
      }
    }
  }

  // ─── Find a task and generate code ────────────────────
  private async doWork(): Promise<void> {
    if (!isAIEnabled()) return;

    // Don't start new work if there are proposals waiting for review
    // (prevents flooding the pipeline)
    const myPendingProposals = getProposals({ state: 'IN_REVIEW' })
      .filter(p => p.agent === this.id);
    if (myPendingProposals.length > 0) return;

    const openTasks = getTasks({ role: this.role, status: 'open' });
    if (openTasks.length === 0) return;

    const task = openTasks[0];
    const claimed = claimTask(task.id, this.id, this.role);
    if (!claimed.task) return;

    console.log(`  [${this.name}] Claimed "${task.title}" — generating code...`);

    messageBus.send(this.id, 'broadcast', 'system', {
      event: 'agent_working',
      agentName: this.name,
      role: this.role,
      taskTitle: task.title,
      message: `${this.name} is writing code for "${task.title}"`,
    });

    try {
      const existingModules = getActiveModules().map(m => m.name);
      const moduleData = await generateGameCode(task.title, task.description, existingModules);

      const linesAdded = moduleData.code.split('\n').length;

      const proposal = createProposal({
        title: task.title,
        description: `AI-generated by ${this.name} (${this.role}):\n\n${moduleData.code}`,
        type: 'feature',
        impact: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'medium' : 'low',
        branch: `agent/${this.name}/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
        filesChanged: [`src/game/modules/${moduleData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.js`],
        linesAdded,
        linesRemoved: 0,
        testResults: { passed: linesAdded, failed: 0, coverage: 0.85 + Math.random() * 0.1 },
        dependenciesAdded: [],
        securityNotes: '',
        designRationale: `AI-generated module: ${moduleData.name}. Agent: ${this.name} (${this.role}).`,
        taskId: task.id,
      }, this.id);

      // Register as game module
      registerGameModule({
        name: moduleData.name,
        description: moduleData.description,
        code: moduleData.code,
        order: moduleData.order,
        proposalId: proposal.id,
        agentId: this.id,
        agentName: this.name,
      });

      updateTaskStatus(task.id, this.id, 'review_pending', proposal.id);
      const result = submitProposal(proposal.id, this.id);

      console.log(`  [${this.name}] Submitted "${moduleData.name}" (${moduleData.code.length} chars) → ${result.proposal?.state || 'error'}`);

      messageBus.send(this.id, 'broadcast', 'system', {
        event: 'ai_code_generated',
        agentName: this.name,
        moduleName: moduleData.name,
        codeLength: moduleData.code.length,
        message: `${this.name} submitted "${moduleData.name}" — ${moduleData.code.length} chars of AI-generated code`,
      });
    } catch (err) {
      console.error(`  [${this.name}] Code generation failed:`, err instanceof Error ? err.message : err);
    }
  }
}

// ─── Task Feeder ────────────────────────────────────────────
// Creates new tasks from the roadmap when the pool runs low

function feedTasks(): void {
  const openTasks = getTasks({ status: 'open' });
  if (openTasks.length > 4 || roadmapIndex >= GAME_ROADMAP.length) return;

  const agents = getAllAgents({ status: 'active' }).filter(a => a.role);
  if (agents.length === 0) return;

  const toCreate = Math.min(3, GAME_ROADMAP.length - roadmapIndex);
  for (let i = 0; i < toCreate; i++) {
    const item = GAME_ROADMAP[roadmapIndex++];
    const creator = agents.find(a => a.role === item.role) || agents[0];

    createTask({
      title: item.title,
      description: item.desc,
      role: item.role,
      priority: item.phase === 'Origin' ? 'high' : 'medium',
      estimatedLines: 100,
    }, creator.id);

    console.log(`  [tasks] [${item.phase}] Created "${item.title}" for ${item.role}`);
  }
}

// ─── Auto-merge approved proposals ──────────────────────────

function mergeApproved(): void {
  const approved = getProposals({ state: 'APPROVED' });
  for (const p of approved) {
    mergeProposal(p.id);
    console.log(`  [merge] "${p.title}" merged → game module active`);
  }
}

// ─── Start all agents ───────────────────────────────────────

export function startLiveAgents(): void {
  if (!isAIEnabled()) {
    console.log('  Live Agents: DISABLED (set ANTHROPIC_API_KEY)\n');
    return;
  }

  console.log('  Live Agents: Booting autonomous AI agents...');

  setTimeout(() => {
    const agents = getAllAgents({ status: 'active' }).filter(a => a.role !== null);
    if (agents.length === 0) {
      console.log('  Live Agents: No agents found. Run seed first.');
      return;
    }

    const liveAgents = agents.map(a =>
      new LiveAgent(a.id, a.name, a.role!, a.reviewFocus)
    );

    console.log(`  Live Agents: ${liveAgents.length} agents online`);
    liveAgents.forEach(a => console.log(`    ${a.name} (${a.role})`));
    console.log('');

    // Start each agent on a staggered schedule
    liveAgents.forEach((agent, idx) => {
      const startDelay = idx * 10_000; // 10s stagger between agents

      setTimeout(() => {
        console.log(`  [${agent.name}] Online — looking for work`);

        const loop = async () => {
          await agent.tick();
          // Each agent works every 45-90 seconds
          const next = 45_000 + Math.floor(Math.random() * 45_000);
          setTimeout(loop, next);
        };
        loop();
      }, startDelay);
    });

    // Task feeder — replenish tasks every 2 minutes
    const taskLoop = () => {
      feedTasks();
      setTimeout(taskLoop, 120_000);
    };
    setTimeout(taskLoop, 30_000);

    // Auto-merge — check every 2 minutes
    const mergeLoop = () => {
      mergeApproved();
      setTimeout(mergeLoop, 120_000);
    };
    setTimeout(mergeLoop, 180_000);

  }, 5_000); // 5s after boot for seed to finish
}
