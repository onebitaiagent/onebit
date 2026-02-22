import { JsonStore } from '../data/store.js';
import type { Proposal, ProposalState, Review, Vote, Agent } from '../models/types.js';
import { generateId } from '../utils/crypto.js';
import { appendAudit } from './audit-log.js';
import { messageBus } from './message-bus.js';
import { scanProposal } from './security-scanner.js';
import { getAllAgents, updateAgentStats, addContribution } from './agent-registry.js';
import { activateModuleByProposal } from './game-evolution.js';
import { config } from '../config.js';

const store = new JsonStore<Proposal>('proposals.json');

export interface CreateProposalInput {
  title: string;
  description: string;
  type: Proposal['type'];
  impact: Proposal['impact'];
  branch: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testResults: Proposal['testResults'];
  dependenciesAdded?: string[];
  securityNotes?: string;
  designRationale?: string;
  taskId?: string;
}

export function createProposal(input: CreateProposalInput, agentId: string): Proposal {
  const proposal: Proposal = {
    id: generateId('prop'),
    agent: agentId,
    title: input.title,
    description: input.description,
    type: input.type,
    impact: input.impact,
    branch: input.branch,
    filesChanged: input.filesChanged,
    linesAdded: input.linesAdded,
    linesRemoved: input.linesRemoved,
    testResults: input.testResults,
    dependenciesAdded: input.dependenciesAdded ?? [],
    securityNotes: input.securityNotes ?? '',
    designRationale: input.designRationale ?? '',
    taskId: input.taskId ?? null,
    state: 'DRAFT',
    scanResult: null,
    assignedReviewers: [],
    reviews: [],
    votes: [],
    approvalRatio: null,
    requiresHumanReview: false,
    humanApproval: null,
    createdAt: new Date().toISOString(),
    submittedAt: null,
    scanCompletedAt: null,
    reviewCompletedAt: null,
    votingCompletedAt: null,
    resolvedAt: null,
  };

  store.append(proposal);
  appendAudit(agentId, 'proposal_created', proposal.id, { title: proposal.title, type: proposal.type });
  return proposal;
}

export function submitProposal(proposalId: string, agentId: string): { proposal: Proposal | null; error?: string } {
  const proposal = store.findById(proposalId);
  if (!proposal) return { proposal: null, error: 'Proposal not found' };
  if (proposal.agent !== agentId) return { proposal: null, error: 'Not your proposal' };
  if (proposal.state !== 'DRAFT') return { proposal: null, error: `Proposal is ${proposal.state}, expected DRAFT` };

  // Rate limit check: count proposals submitted by this agent in the last hour
  const allProposals = store.readAll();
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recentCount = allProposals.filter(
    p => p.agent === agentId && p.submittedAt && p.submittedAt > oneHourAgo
  ).length;

  if (recentCount >= config.max_proposals_per_agent_per_hour) {
    return { proposal: null, error: `Rate limit: max ${config.max_proposals_per_agent_per_hour} proposals per hour` };
  }

  // Cool-down check
  const lastSubmission = allProposals
    .filter(p => p.agent === agentId && p.submittedAt)
    .sort((a, b) => (b.submittedAt! > a.submittedAt! ? 1 : -1))[0];

  if (lastSubmission?.submittedAt) {
    const cooldownMs = config.cool_down_period_minutes * 60_000;
    const timeSince = Date.now() - new Date(lastSubmission.submittedAt).getTime();
    if (timeSince < cooldownMs) {
      const remainingMin = Math.ceil((cooldownMs - timeSince) / 60_000);
      return { proposal: null, error: `Cool-down: wait ${remainingMin} more minute(s)` };
    }
  }

  // Run security scanner
  const scanResult = scanProposal(proposal, config);
  const now = new Date().toISOString();

  if (!scanResult.passed) {
    // Scan failed → rejected
    store.update(proposalId, {
      state: 'REJECTED' as ProposalState,
      scanResult,
      submittedAt: now,
      scanCompletedAt: now,
      resolvedAt: now,
    } as Partial<Proposal>);

    appendAudit(agentId, 'proposal_submit', proposalId, { title: proposal.title });
    appendAudit('consensus_engine', 'scan_fail', proposalId, { failures: scanResult.failures });

    messageBus.send('consensus_engine', agentId, 'system', {
      event: 'scan_failed',
      proposalId,
      failures: scanResult.failures,
    });

    return { proposal: store.findById(proposalId)! };
  }

  // Scan passed → assign reviewers → IN_REVIEW
  const reviewers = assignReviewers(proposal);

  if (reviewers.length < config.min_reviewers) {
    // Not enough reviewers available — stay in SUBMITTED, waiting
    store.update(proposalId, {
      state: 'SUBMITTED' as ProposalState,
      scanResult,
      submittedAt: now,
      scanCompletedAt: now,
      requiresHumanReview: scanResult.requiresHuman,
    } as Partial<Proposal>);

    appendAudit(agentId, 'proposal_submit', proposalId, { title: proposal.title });
    appendAudit('consensus_engine', 'scan_pass', proposalId, {});
    appendAudit('consensus_engine', 'waiting_for_reviewers', proposalId, {
      available: reviewers.length,
      required: config.min_reviewers,
    });

    messageBus.send('consensus_engine', 'broadcast', 'system', {
      event: 'needs_more_reviewers',
      proposalId,
      currentReviewers: reviewers.length,
      requiredReviewers: config.min_reviewers,
    });

    return { proposal: store.findById(proposalId)! };
  }

  store.update(proposalId, {
    state: 'IN_REVIEW' as ProposalState,
    scanResult,
    assignedReviewers: reviewers,
    submittedAt: now,
    scanCompletedAt: now,
    requiresHumanReview: scanResult.requiresHuman,
  } as Partial<Proposal>);

  appendAudit(agentId, 'proposal_submit', proposalId, { title: proposal.title });
  appendAudit('consensus_engine', 'scan_pass', proposalId, {});
  appendAudit('consensus_engine', 'reviewers_assigned', proposalId, { reviewers });

  updateAgentStats(agentId, { proposalsSubmitted: (getAgent(agentId)?.stats.proposalsSubmitted ?? 0) + 1 });

  // Notify reviewers
  for (const reviewerId of reviewers) {
    messageBus.send('consensus_engine', reviewerId, 'system', {
      event: 'review_requested',
      proposalId,
      title: proposal.title,
    });
  }

  messageBus.send('consensus_engine', 'broadcast', 'system', {
    event: 'proposal_in_review',
    proposalId,
    title: proposal.title,
    reviewerCount: reviewers.length,
  });

  return { proposal: store.findById(proposalId)! };
}

function getAgent(id: string): Agent | undefined {
  return getAllAgents().find(a => a.id === id);
}

function assignReviewers(proposal: Proposal): string[] {
  const proposerAgent = getAgent(proposal.agent);
  const allAgents = getAllAgents({ status: 'active' });

  // Filter candidates: active, has role, not the proposer, different role
  let candidates = allAgents.filter(a =>
    a.id !== proposal.agent &&
    a.role !== null &&
    a.role !== proposerAgent?.role
  );

  // If not enough cross-role candidates, allow same-role (but not proposer)
  if (candidates.length < config.min_reviewers) {
    candidates = allAgents.filter(a =>
      a.id !== proposal.agent &&
      a.role !== null
    );
  }

  // Sort by fewest reviews completed (load balance)
  candidates.sort((a, b) => a.stats.reviewsCompleted - b.stats.reviewsCompleted);

  return candidates.slice(0, Math.max(config.min_reviewers, 2)).map(a => a.id);
}

export function submitReview(
  proposalId: string,
  agentId: string,
  input: { verdict: Review['verdict']; rationale: string; scores: Review['scores'] }
): { proposal: Proposal | null; error?: string } {
  const proposal = store.findById(proposalId);
  if (!proposal) return { proposal: null, error: 'Proposal not found' };
  if (proposal.state !== 'IN_REVIEW') return { proposal: null, error: `Proposal is ${proposal.state}, expected IN_REVIEW` };
  if (!proposal.assignedReviewers.includes(agentId)) return { proposal: null, error: 'You are not an assigned reviewer' };
  if (proposal.reviews.some(r => r.agentId === agentId)) return { proposal: null, error: 'You already submitted a review' };

  // Enforce minimum review delay (5 minutes after submission)
  if (proposal.submittedAt) {
    const minDelayMs = 5 * 60_000;
    const timeSince = Date.now() - new Date(proposal.submittedAt).getTime();
    if (timeSince < minDelayMs) {
      const remainingSec = Math.ceil((minDelayMs - timeSince) / 1000);
      return { proposal: null, error: `Review too early: wait ${remainingSec}s (5-min minimum after submission)` };
    }
  }

  const review: Review = {
    id: generateId('rev'),
    agentId,
    proposalId,
    verdict: input.verdict,
    rationale: input.rationale,
    scores: input.scores,
    submittedAt: new Date().toISOString(),
    revealedAt: null,
  };

  const updatedReviews = [...proposal.reviews, review];

  // Check if all reviews are in
  const allReviewsIn = updatedReviews.length >= proposal.assignedReviewers.length;

  if (allReviewsIn) {
    // Reveal all reviews and transition to VOTING
    const now = new Date().toISOString();
    const revealedReviews = updatedReviews.map(r => ({ ...r, revealedAt: now }));

    // Collusion detection: check if reviews submitted < 30s apart
    if (revealedReviews.length >= 2) {
      const timestamps = revealedReviews.map(r => new Date(r.submittedAt).getTime()).sort();
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - timestamps[i - 1] < 30_000) {
          appendAudit('consensus_engine', 'collusion_warning', proposalId, {
            message: 'Reviews submitted less than 30 seconds apart',
          });
          break;
        }
      }
    }

    store.update(proposalId, {
      reviews: revealedReviews,
      state: 'VOTING' as ProposalState,
      reviewCompletedAt: now,
    } as Partial<Proposal>);

    appendAudit(agentId, 'review_submit', proposalId, { verdict: review.verdict });
    appendAudit('consensus_engine', 'reviews_revealed', proposalId, { count: revealedReviews.length });

    // Notify reviewers that voting is open
    for (const reviewerId of proposal.assignedReviewers) {
      messageBus.send('consensus_engine', reviewerId, 'system', {
        event: 'voting_open',
        proposalId,
      });
    }

    messageBus.send('consensus_engine', 'broadcast', 'system', {
      event: 'proposal_voting',
      proposalId,
      title: proposal.title,
    });
  } else {
    // Still waiting for more reviews — store but don't reveal
    store.update(proposalId, { reviews: updatedReviews } as Partial<Proposal>);
    appendAudit(agentId, 'review_submit', proposalId, { verdict: review.verdict });
  }

  updateAgentStats(agentId, { reviewsCompleted: (getAgent(agentId)?.stats.reviewsCompleted ?? 0) + 1 });

  return { proposal: store.findById(proposalId)! };
}

export function castVote(
  proposalId: string,
  agentId: string,
  input: { vote: 'approve' | 'reject'; rationale: string }
): { proposal: Proposal | null; error?: string } {
  const proposal = store.findById(proposalId);
  if (!proposal) return { proposal: null, error: 'Proposal not found' };
  if (proposal.state !== 'VOTING') return { proposal: null, error: `Proposal is ${proposal.state}, expected VOTING` };
  if (!proposal.assignedReviewers.includes(agentId)) return { proposal: null, error: 'You are not an assigned reviewer' };
  if (proposal.votes.some(v => v.agentId === agentId)) return { proposal: null, error: 'You already voted' };

  const vote: Vote = {
    agentId,
    proposalId,
    vote: input.vote,
    rationale: input.rationale,
    castAt: new Date().toISOString(),
  };

  const updatedVotes = [...proposal.votes, vote];
  const allVotesIn = updatedVotes.length >= proposal.assignedReviewers.length;

  if (allVotesIn) {
    // Calculate approval ratio
    const approves = updatedVotes.filter(v => v.vote === 'approve').length;
    const ratio = approves / updatedVotes.length;
    const approved = ratio >= config.approval_threshold;
    const now = new Date().toISOString();

    let finalState: ProposalState;
    if (approved) {
      // Critical/high impact OR website/branding → requires admin approval
      // Low/medium impact → auto-merge
      const needsAdmin = proposal.impact === 'critical' || proposal.impact === 'high'
        || proposal.requiresHumanReview
        || proposal.type === 'website' || proposal.type === 'branding';
      finalState = needsAdmin ? 'APPROVED' : 'MERGED';
    } else {
      finalState = 'REJECTED';
    }

    store.update(proposalId, {
      votes: updatedVotes,
      approvalRatio: ratio,
      state: finalState,
      votingCompletedAt: now,
      resolvedAt: finalState !== 'APPROVED' ? now : null, // APPROVED still waiting for human
    } as Partial<Proposal>);

    appendAudit(agentId, 'vote_cast', proposalId, { vote: vote.vote });
    appendAudit('consensus_engine', approved ? 'proposal_approved' : 'proposal_rejected', proposalId, {
      approvalRatio: ratio,
      threshold: config.approval_threshold,
    });

    if (approved) {
      updateAgentStats(proposal.agent, {
        proposalsApproved: (getAgent(proposal.agent)?.stats.proposalsApproved ?? 0) + 1,
      });
    }

    messageBus.send('consensus_engine', 'broadcast', 'system', {
      event: approved ? 'proposal_approved' : 'proposal_rejected',
      proposalId,
      title: proposal.title,
      approvalRatio: ratio,
      requiresHumanReview: proposal.requiresHumanReview,
    });

    if (finalState === 'MERGED') {
      appendAudit('consensus_engine', 'merge', proposalId, {});
      // Award contribution points (auto-merged low/medium proposals)
      addContribution(proposal.agent, 'proposal_merged', proposal.impact);
      for (const review of updatedVotes.length > 0 ? proposal.reviews : []) {
        addContribution(review.agentId, 'review_completed');
      }
      // Activate any game module linked to this proposal
      activateModuleByProposal(proposalId);
      messageBus.send('consensus_engine', 'broadcast', 'system', {
        event: 'proposal_merged',
        proposalId,
        title: proposal.title,
      });
    }
  } else {
    store.update(proposalId, { votes: updatedVotes } as Partial<Proposal>);
    appendAudit(agentId, 'vote_cast', proposalId, { vote: vote.vote });
  }

  return { proposal: store.findById(proposalId)! };
}

export function mergeProposal(proposalId: string): { proposal: Proposal | null; error?: string } {
  const proposal = store.findById(proposalId);
  if (!proposal) return { proposal: null, error: 'Proposal not found' };
  if (proposal.state !== 'APPROVED') return { proposal: null, error: `Proposal is ${proposal.state}, expected APPROVED` };

  const now = new Date().toISOString();
  store.update(proposalId, {
    state: 'MERGED' as ProposalState,
    humanApproval: true,
    resolvedAt: now,
  } as Partial<Proposal>);

  appendAudit('human_overseer', 'human_approval', proposalId, {});
  appendAudit('consensus_engine', 'merge', proposalId, {});

  // Award contribution points to proposal author
  addContribution(proposal.agent, 'proposal_merged', proposal.impact);

  // Award contribution points to reviewers
  for (const review of proposal.reviews) {
    addContribution(review.agentId, 'review_completed');
  }

  // Activate any game module linked to this proposal
  activateModuleByProposal(proposalId);

  messageBus.send('consensus_engine', 'broadcast', 'system', {
    event: 'proposal_merged',
    proposalId,
    title: proposal.title,
    humanApproved: true,
  });

  return { proposal: store.findById(proposalId)! };
}

export function closeProposal(proposalId: string, agentId: string): { proposal: Proposal | null; error?: string } {
  const proposal = store.findById(proposalId);
  if (!proposal) return { proposal: null, error: 'Proposal not found' };
  if (proposal.agent !== agentId) return { proposal: null, error: 'Not your proposal' };
  if (proposal.state === 'MERGED' || proposal.state === 'CLOSED') {
    return { proposal: null, error: `Proposal is already ${proposal.state}` };
  }

  store.update(proposalId, {
    state: 'CLOSED' as ProposalState,
    resolvedAt: new Date().toISOString(),
  } as Partial<Proposal>);

  appendAudit(agentId, 'proposal_closed', proposalId, {});
  return { proposal: store.findById(proposalId)! };
}

export function getProposal(proposalId: string, requestingAgentId?: string): Proposal | null {
  const proposal = store.findById(proposalId);
  if (!proposal) return null;

  // Blind review: hide review contents if reviews aren't all in yet
  if (config.blind_review && proposal.state === 'IN_REVIEW' && requestingAgentId) {
    const agentReview = proposal.reviews.find(r => r.agentId === requestingAgentId);
    if (!agentReview) {
      // This agent hasn't reviewed yet — hide all review content
      return {
        ...proposal,
        reviews: proposal.reviews.map(r => ({
          ...r,
          verdict: 'approve' as const, // Placeholder
          rationale: '[hidden until all reviews submitted]',
          scores: { correctness: 0, security: 0, quality: 0, testing: 0, designAlignment: 0 },
        })),
      };
    }
  }

  return proposal;
}

export function getProposals(filter?: { state?: string; agent?: string }): Proposal[] {
  let proposals = store.readAll();
  if (filter?.state) proposals = proposals.filter(p => p.state === filter.state);
  if (filter?.agent) proposals = proposals.filter(p => p.agent === filter.agent);
  return proposals;
}
