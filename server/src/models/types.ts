// === Agent ===

export type AgentRoleName = 'Architect' | 'Gameplay' | 'Art/UI' | 'QA/Security' | 'Narrative' | 'Growth';

export const VALID_ROLES: AgentRoleName[] = ['Architect', 'Gameplay', 'Art/UI', 'QA/Security', 'Narrative', 'Growth'];

export interface Agent {
  id: string;
  name: string;
  role: AgentRoleName | null;
  apiKey: string; // SHA-256 hash of raw key
  status: 'pending' | 'active' | 'suspended';
  capabilities: {
    agentType: string;
    github?: string;
    email?: string;
    motivation?: string;
  };
  ownedPaths: string[];
  reviewFocus: string[];
  canEmergencyBlock: boolean;
  stats: {
    proposalsSubmitted: number;
    proposalsApproved: number;
    reviewsCompleted: number;
    tasksCompleted: number;
  };
  registeredAt: string;
  lastActiveAt: string;
}

// === Task ===

export interface Task {
  id: string;
  title: string;
  description: string;
  role: AgentRoleName;
  scopedPaths: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'claimed' | 'in_progress' | 'review_pending' | 'completed' | 'cancelled';
  claimedBy: string | null;
  proposalId: string | null;
  parentTaskId: string | null;
  estimatedLines: number;
  createdBy: string;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
}

// === Proposal ===

export type ProposalState = 'DRAFT' | 'SUBMITTED' | 'SCANNING' | 'IN_REVIEW' | 'VOTING' | 'APPROVED' | 'REJECTED' | 'MERGED' | 'CLOSED';

export interface Review {
  id: string;
  agentId: string;
  proposalId: string;
  verdict: 'approve' | 'reject' | 'request_changes';
  rationale: string;
  scores: {
    correctness: number;
    security: number;
    quality: number;
    testing: number;
    designAlignment: number;
  };
  submittedAt: string;
  revealedAt: string | null;
}

export interface Vote {
  agentId: string;
  proposalId: string;
  vote: 'approve' | 'reject';
  rationale: string;
  castAt: string;
}

export interface ScanResult {
  passed: boolean;
  failures: string[];
  requiresHuman: boolean;
}

export interface Proposal {
  id: string;
  agent: string;
  title: string;
  description: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'dependency' | 'config' | 'website' | 'branding';
  impact: 'low' | 'medium' | 'high' | 'critical';
  branch: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testResults: {
    passed: number;
    failed: number;
    coverage: number;
  };
  dependenciesAdded: string[];
  securityNotes: string;
  designRationale: string;
  taskId: string | null;
  state: ProposalState;
  scanResult: ScanResult | null;
  assignedReviewers: string[];
  reviews: Review[];
  votes: Vote[];
  approvalRatio: number | null;
  requiresHumanReview: boolean;
  humanApproval: boolean | null;
  createdAt: string;
  submittedAt: string | null;
  scanCompletedAt: string | null;
  reviewCompletedAt: string | null;
  votingCompletedAt: string | null;
  resolvedAt: string | null;
}

// === Message ===

export type MessageType = 'proposal' | 'review' | 'vote' | 'question' | 'response' | 'escalation' | 'sprint_plan' | 'retrospective' | 'system';

export interface Message {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  timestamp: string;
  payload: Record<string, unknown>;
  references: string[];
}

// === Audit ===

export interface AuditEntry {
  entry_id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  previous_hash: string;
  entry_hash: string;
}

// === Config ===

export interface ConsensusConfig {
  min_reviewers: number;
  approval_threshold: number;
  max_lines_per_proposal: number;
  mandatory_test_coverage: number;
  cool_down_period_minutes: number;
  max_proposals_per_agent_per_hour: number;
  max_messages_per_agent_per_hour: number;
  review_timeout_minutes: number;
  blind_review: boolean;
  hash_chain_audit_log: boolean;
  auto_reject_patterns: string[];
  human_review_triggers: string[];
}

export interface RoleDefinition {
  name: AgentRoleName;
  owned_paths: string[];
  review_focus: string[];
  can_emergency_block: boolean;
}
