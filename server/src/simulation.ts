import { getAllAgents, updateAgentStats } from './services/agent-registry.js';
import { getTasks, claimTask, updateTaskStatus, createTask } from './services/task-queue.js';
import {
  createProposal, submitProposal, submitReview, castVote, getProposals,
  type CreateProposalInput,
} from './services/consensus-engine.js';
import { messageBus } from './services/message-bus.js';
import type { Agent, AgentRoleName } from './models/types.js';

const TITLES = [
  'Refactor absorption field calculations',
  'Add screen-shake intensity curve',
  'Optimize particle pooling system',
  'Implement combo multiplier HUD',
  'Fix edge-wrap jitter at high speed',
  'Add adaptive difficulty scaling',
  'Create evolution burst VFX system',
  'Implement enemy behavior tree framework',
  'Add colorblind-safe palette toggle',
  'Design achievement notification system',
  'Build replay snapshot encoder',
  'Add procedural biome transitions',
  'Implement score streak mechanic',
  'Create tutorial tooltip system',
  'Add ambient audio layer manager',
  'Build leaderboard data model',
  'Implement dead-zone reduction for mobile',
  'Add cosmetic unlock progression',
  'Create share-card image renderer',
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
      messageBus.send(worker.id, 'broadcast', 'system', {
        event: 'agent_working',
        agentName: worker.name,
        role: worker.role,
        taskTitle: task.title,
        message: `${worker.name} is working on "${task.title}"`,
      });

      // After a delay, submit a proposal for this work
      setTimeout(() => {
        const title = task.title;
        const linesAdded = randInt(40, 300);
        const linesRemoved = randInt(0, 50);
        const proposalType = getProposalType(title);
        const websitePaths = getWebsitePaths(title);

        const proposal = createProposal({
          title,
          description: `Implementation for: ${task.description}`,
          type: proposalType,
          impact: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'medium' : 'low',
          branch: `agent/${worker.name}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
          filesChanged: websitePaths.length > 0 ? websitePaths : (task.scopedPaths.length > 0 ? task.scopedPaths : [`src/${worker.role?.toLowerCase().replace('/', '-')}/impl.ts`]),
          linesAdded,
          linesRemoved,
          testResults: { passed: randInt(12, 60), failed: 0, coverage: 0.82 + Math.random() * 0.15 },
          dependenciesAdded: [],
          securityNotes: '',
          designRationale: `Addresses task: ${task.title}. Follows existing patterns in the codebase.`,
          taskId: task.id,
        }, worker.id);

        // Mark task as review_pending
        updateTaskStatus(task.id, worker.id, 'review_pending', proposal.id);

        // Submit the proposal (triggers scan + reviewer assignment)
        const result = submitProposal(proposal.id, worker.id);

        if (result.proposal?.state === 'IN_REVIEW') {
          // Schedule reviews from assigned reviewers
          const reviewers = result.proposal.assignedReviewers;
          reviewers.forEach((reviewerId, idx) => {
            setTimeout(() => {
              const reviewer = agents.find(a => a.id === reviewerId);
              if (!reviewer) return;

              const approve = Math.random() > 0.15; // 85% approval rate
              submitReview(proposal.id, reviewerId, {
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

              // After review, vote
              setTimeout(() => {
                castVote(proposal.id, reviewerId, {
                  vote: approve ? 'approve' : 'reject',
                  rationale: approve ? 'Good to merge.' : 'Needs revision before merge.',
                });
              }, randInt(3000, 8000));

            }, (idx + 1) * randInt(6000, 15000)); // Stagger reviews
          });
        }
      }, randInt(5000, 15000));
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
  console.log('  Simulation: Agents will begin working in 10 seconds...\n');

  // Stagger the start
  setTimeout(() => {
    // Run agent work cycles every 20-40 seconds
    const workLoop = () => {
      simulateAgentWork().catch(() => {});
      setTimeout(workLoop, randInt(20_000, 40_000));
    };
    workLoop();

    // Generate mock X posts every 60-120 seconds
    const xLoop = () => {
      generateMockXPost();
      setTimeout(xLoop, randInt(60_000, 120_000));
    };
    // First X post after 30s
    setTimeout(xLoop, 30_000);

  }, 10_000);
}
