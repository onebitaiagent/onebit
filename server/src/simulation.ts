import { getAllAgents, updateAgentStats } from './services/agent-registry.js';
import { getTasks, claimTask, updateTaskStatus, createTask } from './services/task-queue.js';
import {
  createProposal, submitProposal, submitReview, castVote, getProposals,
  mergeProposal,
  type CreateProposalInput,
} from './services/consensus-engine.js';
import { registerGameModule, getActiveModules } from './services/game-evolution.js';
import { messageBus } from './services/message-bus.js';
import type { Agent, AgentRoleName } from './models/types.js';
import { GAME_CODE_MODULES } from './game-modules.js';
import { isAIEnabled, generateGameCode, reviewCode, type AIReviewResult } from './services/ai-client.js';

const TITLES = [
  // Game code modules — these have REAL code that gets injected into the live game
  'Add ambient background starfield',
  'Add pixel glow effect',
  'Implement movement trail system',
  'Create floating particle spawner',
  'Build score display HUD',
  'Add background grid environment',
  'Design absorption burst particle effects',
  'Implement enemy AI spawner',
  'Create absorption field mechanic',
  'Add screen shake VFX system',
  // Additional game tasks — AI can generate code for these too
  'Refactor absorption field calculations',
  'Optimize particle pooling system',
  'Add adaptive difficulty scaling',
  'Implement enemy behavior tree framework',
  'Add colorblind-safe palette toggle',
  'Implement score streak mechanic',
  'Add ambient audio layer manager',
  'Optimize WebGL draw call batching',
  // Website & branding tasks
  'Update homepage hero copy and CTA',
  'Redesign feed page layout for mobile',
  'Add dark/light theme toggle to website',
  'Create ONEBIT brand style guide page',
  'Build agent activity dashboard widget',
  'Add open graph meta tags for social sharing',
  'Design evolution stage showcase section',
  'Update website favicon and app icons',
  'Create animated logo SVG for header',
  'Build real-time consensus stats ticker',
];

const WEBSITE_TITLES = new Set([
  'Update homepage hero copy and CTA',
  'Redesign feed page layout for mobile',
  'Add dark/light theme toggle to website',
  'Build agent activity dashboard widget',
  'Add open graph meta tags for social sharing',
  'Design evolution stage showcase section',
  'Build real-time consensus stats ticker',
]);

const BRANDING_TITLES = new Set([
  'Create ONEBIT brand style guide page',
  'Update website favicon and app icons',
  'Create animated logo SVG for header',
]);

const RATIONALES = [
  'Clean implementation with good test coverage. Follows existing patterns well.',
  'Solid work. The edge cases are handled correctly. Minor style nit but not blocking.',
  'Excellent separation of concerns. The component boundaries are clean.',
  'Good approach. I verified the math and it checks out. Performance is within budget.',
  'Well-structured proposal. Tests cover the critical paths. Approving.',
  'This addresses a real need. Implementation is straightforward and maintainable.',
];

const REJECT_RATIONALES = [
  'The approach works but I think we should use the existing utility for this instead of creating a new one.',
  'Test coverage is good but missing the edge case where stage transitions happen during absorption.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getProposalType(title: string): 'feature' | 'website' | 'branding' {
  if (WEBSITE_TITLES.has(title)) return 'website';
  if (BRANDING_TITLES.has(title)) return 'branding';
  return 'feature';
}

function getWebsitePaths(title: string): string[] {
  if (WEBSITE_TITLES.has(title)) return ['web/src/App.jsx', `web/src/components/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}.jsx`];
  if (BRANDING_TITLES.has(title)) return ['web/public/favicon.ico', 'branding/style-guide.md', 'web/src/App.jsx'];
  return [];
}

function isGameTask(title: string): boolean {
  return !WEBSITE_TITLES.has(title) && !BRANDING_TITLES.has(title);
}

let titleIndex = 0;

async function simulateAgentWork(): Promise<void> {
  const agents = getAllAgents({ status: 'active' }).filter(a => a.role !== null);
  if (agents.length < 3) return;

  // Pick a random agent to do work
  const worker = pick(agents);

  // Try to claim an open task for this agent's role
  const openTasks = getTasks({ role: worker.role!, status: 'open' });

  if (openTasks.length > 0) {
    const task = pick(openTasks);
    const claimed = claimTask(task.id, worker.id, worker.role);

    if (claimed.task) {
      const usingAI = isAIEnabled();

      messageBus.send(worker.id, 'broadcast', 'system', {
        event: 'agent_working',
        agentName: worker.name,
        role: worker.role,
        taskTitle: task.title,
        message: `${worker.name} is ${usingAI ? 'writing code' : 'working on'} "${task.title}"`,
      });

      // After a delay, generate code + submit proposal
      setTimeout(async () => {
        try {
          const title = task.title;
          const proposalType = getProposalType(title);
          const websitePaths = getWebsitePaths(title);

          // ─── Code Generation ──────────────────────────
          let moduleData: { name: string; description: string; code: string; order: number } | null = null;

          if (isGameTask(title)) {
            if (usingAI) {
              // AI generates real code
              try {
                const existingNames = getActiveModules().map(m => m.name);
                moduleData = await generateGameCode(title, task.description, existingNames);
              } catch (err) {
                console.error(`  AI: Code generation failed for "${title}":`, err instanceof Error ? err.message : err);
                // Fall back to pre-written module if available
                const fallback = GAME_CODE_MODULES.find(m => m.taskTitle === title);
                if (fallback) {
                  moduleData = { name: fallback.name, description: fallback.description, code: fallback.code, order: fallback.order };
                  console.log(`  AI: Fell back to pre-written module for "${title}"`);
                }
              }
            } else {
              // No AI — use pre-written module if available
              const prewritten = GAME_CODE_MODULES.find(m => m.taskTitle === title);
              if (prewritten) {
                moduleData = { name: prewritten.name, description: prewritten.description, code: prewritten.code, order: prewritten.order };
              }
            }
          }

          // ─── Create Proposal ──────────────────────────
          const linesAdded = moduleData ? moduleData.code.split('\n').length : randInt(40, 300);
          const linesRemoved = randInt(0, 50);

          const proposal = createProposal({
            title,
            description: moduleData
              ? `AI-generated implementation for: ${task.description}\n\nCode:\n${moduleData.code}`
              : `Implementation for: ${task.description}`,
            type: proposalType,
            impact: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'medium' : 'low',
            branch: `agent/${worker.name}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
            filesChanged: websitePaths.length > 0
              ? websitePaths
              : (moduleData
                ? [`src/game/modules/${moduleData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.js`]
                : (task.scopedPaths.length > 0 ? task.scopedPaths : [`src/${worker.role?.toLowerCase().replace('/', '-')}/impl.ts`])),
            linesAdded,
            linesRemoved,
            testResults: { passed: randInt(12, 60), failed: 0, coverage: 0.82 + Math.random() * 0.15 },
            dependenciesAdded: [],
            securityNotes: '',
            designRationale: moduleData
              ? `AI-generated module: ${moduleData.name}. Task: ${task.title}.`
              : `Addresses task: ${task.title}. Follows existing patterns in the codebase.`,
            taskId: task.id,
          }, worker.id);

          // ─── Register Game Module ─────────────────────
          if (moduleData) {
            registerGameModule({
              name: moduleData.name,
              description: moduleData.description,
              code: moduleData.code,
              order: moduleData.order,
              proposalId: proposal.id,
              agentId: worker.id,
              agentName: worker.name,
            });

            if (usingAI) {
              messageBus.send(worker.id, 'broadcast', 'system', {
                event: 'ai_code_generated',
                agentName: worker.name,
                moduleName: moduleData.name,
                codeLength: moduleData.code.length,
                message: `${worker.name} generated "${moduleData.name}" using Claude AI (${moduleData.code.length} chars)`,
              });
            }
          }

          // Mark task as review_pending
          updateTaskStatus(task.id, worker.id, 'review_pending', proposal.id);

          // Submit the proposal (triggers scan + reviewer assignment)
          const result = submitProposal(proposal.id, worker.id);

          if (result.proposal?.state === 'IN_REVIEW') {
            const reviewers = result.proposal.assignedReviewers;

            // ─── Pre-generate Reviews ─────────────────
            // Generate all reviews upfront (AI or random), then schedule them on timers
            const reviewResults: {
              reviewerId: string;
              verdict: 'approve' | 'request_changes';
              rationale: string;
              scores: { correctness: number; security: number; quality: number; testing: number; designAlignment: number };
            }[] = [];

            for (const reviewerId of reviewers) {
              const reviewer = agents.find(a => a.id === reviewerId);
              if (!reviewer) continue;

              if (usingAI && moduleData) {
                // AI reviews the code
                try {
                  const aiReview = await reviewCode(
                    title,
                    moduleData.code,
                    reviewer.role || 'Gameplay',
                    reviewer.reviewFocus || [],
                  );
                  reviewResults.push({ reviewerId, ...aiReview });
                  console.log(`  AI: ${reviewer.name} reviewed "${title}" → ${aiReview.verdict}`);
                } catch (err) {
                  console.error(`  AI: Review failed for ${reviewer.name}:`, err instanceof Error ? err.message : err);
                  // Fallback to random review
                  const approve = Math.random() > 0.15;
                  reviewResults.push({
                    reviewerId,
                    verdict: approve ? 'approve' : 'request_changes',
                    rationale: approve ? pick(RATIONALES) : pick(REJECT_RATIONALES),
                    scores: {
                      correctness: approve ? randInt(4, 5) : randInt(2, 3),
                      security: randInt(4, 5),
                      quality: approve ? randInt(4, 5) : randInt(3, 4),
                      testing: randInt(4, 5),
                      designAlignment: approve ? randInt(4, 5) : randInt(3, 4),
                    },
                  });
                }
              } else {
                // Non-AI: random review
                const approve = Math.random() > 0.15;
                reviewResults.push({
                  reviewerId,
                  verdict: approve ? 'approve' : 'request_changes',
                  rationale: approve ? pick(RATIONALES) : pick(REJECT_RATIONALES),
                  scores: {
                    correctness: approve ? randInt(4, 5) : randInt(2, 3),
                    security: randInt(4, 5),
                    quality: approve ? randInt(4, 5) : randInt(3, 4),
                    testing: randInt(4, 5),
                    designAlignment: approve ? randInt(4, 5) : randInt(3, 4),
                  },
                });
              }
            }

            // ─── Schedule Review Submissions ────────────
            reviewResults.forEach((review, idx) => {
              setTimeout(() => {
                submitReview(proposal.id, review.reviewerId, {
                  verdict: review.verdict,
                  rationale: review.rationale,
                  scores: review.scores,
                });
              }, 310_000 + (idx * randInt(10_000, 30_000))); // 5min 10s+ delay + stagger
            });

            // ─── Schedule Votes ─────────────────────────
            // Votes derive from review verdicts
            const lastReviewTime = 310_000 + (reviewers.length * 30_000) + 10_000;
            reviewResults.forEach((review, idx) => {
              const voteApprove = review.verdict === 'approve';
              setTimeout(() => {
                castVote(proposal.id, review.reviewerId, {
                  vote: voteApprove ? 'approve' : 'reject',
                  rationale: voteApprove
                    ? (usingAI ? `Confirming approval: ${review.rationale.slice(0, 60)}` : 'Good to merge.')
                    : (usingAI ? `Rejecting: ${review.rationale.slice(0, 60)}` : 'Needs revision before merge.'),
                });
              }, lastReviewTime + randInt(3000, 8000) + (idx * randInt(3000, 6000)));
            });
          }
        } catch (err) {
          console.error(`  Simulation: Error in proposal flow:`, err);
        }
      }, usingAI ? randInt(8000, 20000) : randInt(5000, 15000)); // AI gets slightly more time
    }
  }

  // Occasionally create new tasks (including website/branding)
  if (Math.random() < 0.3 && titleIndex < TITLES.length) {
    const title = TITLES[titleIndex++];
    // Website/branding tasks go to Art/UI or Growth
    let roleForTask: AgentRoleName;
    if (WEBSITE_TITLES.has(title)) {
      roleForTask = pick(['Art/UI', 'Growth'] as AgentRoleName[]);
    } else if (BRANDING_TITLES.has(title)) {
      roleForTask = 'Art/UI';
    } else {
      roleForTask = pick(agents).role!;
    }

    createTask({
      title,
      description: WEBSITE_TITLES.has(title)
        ? `Website update: ${title}. Changes auto-propagate on merge.`
        : BRANDING_TITLES.has(title)
        ? `Branding update: ${title}. Propagates across all outputs on merge.`
        : `Agent-generated task: ${title}`,
      role: roleForTask,
      priority: pick(['low', 'medium', 'high'] as const),
      estimatedLines: randInt(50, 350),
    }, worker.id);
  }
}

// Generate mock X-style posts from recent consensus activity
function generateMockXPost(): void {
  const proposals = getProposals();
  const agents = getAllAgents({ status: 'active' });
  const merged = proposals.filter(p => p.state === 'MERGED');
  const approved = proposals.filter(p => p.state === 'APPROVED');
  const rejected = proposals.filter(p => p.state === 'REJECTED');
  const inReview = proposals.filter(p => p.state === 'IN_REVIEW');

  const templates = [
    () => merged.length > 0 ? `Build #${merged.length} deployed. ${pick(agents).name}'s "${pick(merged).title}" passed consensus ${Math.round((pick(merged).approvalRatio ?? 0.8) * 100)}%. The agents are shipping.` : null,
    () => rejected.length > 0 ? `Consensus voted NO on "${pick(rejected).title}". ${Math.round((pick(rejected).approvalRatio ?? 0.3) * 100)}% approval (needed 67%). Back to the drawing board.` : null,
    () => inReview.length > 0 ? `${pick(agents).name} just submitted "${pick(inReview).title}" for peer review. ${inReview.length} proposals currently in the pipeline.` : null,
    () => `Weekly stats:\n- ${proposals.length} proposals submitted\n- ${merged.length} merged, ${approved.length} awaiting admin approval\n- ${rejected.length} rejected by consensus\n- ${agents.length} active agents across ${new Set(agents.map(a => a.role)).size} roles\n- 0 security incidents`,
    () => agents.length >= 2 ? `${pick(agents).name} and ${pick(agents).name} are debating ${pick(['enemy spawn rates', 'absorption field radius', 'evolution thresholds', 'shader performance', 'combo timing windows', 'homepage copy', 'brand colors', 'mobile layout'])}. Democracy in action.` : null,
    () => approved.length > 0 ? `${approved.length} proposal${approved.length > 1 ? 's' : ''} passed agent consensus and ${approved.length > 1 ? 'are' : 'is'} awaiting human approval. Critical changes need the team's sign-off. No agent can bypass this.` : null,
    () => `Milestone: ${merged.length} proposals merged through blind consensus review. Every line peer-reviewed by 2+ agents. Critical changes require human approval.`,
    () => {
      const webProps = proposals.filter(p => p.type === 'website' || p.type === 'branding');
      return webProps.length > 0 ? `The agents are building the brand now. ${webProps.length} website/branding proposals in the pipeline. Changes auto-propagate on admin approval.` : null;
    },
  ];

  const post = pick(templates)();
  if (post) {
    messageBus.send('consensus_engine', 'broadcast', 'system', {
      event: 'x_post',
      handle: '@ONEBIT_ai',
      text: post,
      likes: randInt(50, 900),
      rts: randInt(10, 350),
    });
  }
}

export function startSimulation(): void {
  if (process.env.SIMULATION_ENABLED === 'false') {
    console.log('  Simulation: DISABLED (set SIMULATION_ENABLED=true to enable)\n');
    return;
  }

  const aiMode = isAIEnabled();
  console.log(`  Simulation: ${aiMode ? 'AI-POWERED — agents use Claude to write real code' : 'Simulated — using pre-written modules'}`);
  console.log('  Simulation: Agents will begin working in 10 seconds...\n');

  // Stagger the start
  setTimeout(() => {
    // Run agent work cycles every 20-40 seconds (slightly slower for AI to manage costs)
    const interval = aiMode ? [30_000, 60_000] : [20_000, 40_000];
    const workLoop = () => {
      simulateAgentWork().catch(err => {
        console.error('  Simulation: Work loop error:', err instanceof Error ? err.message : err);
      });
      setTimeout(workLoop, randInt(interval[0], interval[1]));
    };
    workLoop();

    // Generate mock X posts every 3-5 hours (stays within daily cap)
    const xLoop = () => {
      generateMockXPost();
      setTimeout(xLoop, randInt(3 * 3600_000, 5 * 3600_000));
    };
    // First X post after 30s
    setTimeout(xLoop, 30_000);

    // Auto-merge APPROVED proposals (simulates periodic admin approval)
    const mergeLoop = () => {
      const approved = getProposals({ state: 'APPROVED' });
      for (const p of approved) {
        mergeProposal(p.id);
      }
      // Check every 2 minutes
      setTimeout(mergeLoop, 120_000);
    };
    // First check after 3 minutes
    setTimeout(mergeLoop, 180_000);

  }, 10_000);
}
