import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ConsensusConfig, RoleDefinition } from './models/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUNDLE_ROOT = join(__dirname, '..', '..');

const DEFAULT_CONFIG: ConsensusConfig = {
  min_reviewers: 2,
  approval_threshold: 0.67,
  max_lines_per_proposal: 500,
  mandatory_test_coverage: 0.80,
  cool_down_period_minutes: 1,
  max_proposals_per_agent_per_hour: 5,
  max_messages_per_agent_per_hour: 100,
  review_timeout_minutes: 30,
  blind_review: true,
  hash_chain_audit_log: true,
  auto_reject_patterns: [
    'eval\\(', 'exec\\(', 'subprocess', '__import__',
    'Function\\(', 'child_process', 'dangerouslySetInnerHTML',
  ],
  human_review_triggers: [
    'networking', 'socket', '.consensus/', 'ci/',
    'canary', 'package.json', 'dependencies',
  ],
};

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    name: 'Architect',
    owned_paths: ['src/core/**', 'ci/**', 'docs/technical/**'],
    review_focus: ['architecture', 'performance', 'code_quality', 'scalability'],
    can_emergency_block: false,
  },
  {
    name: 'Gameplay',
    owned_paths: ['src/gameplay/**'],
    review_focus: ['gameplay', 'balance', 'fun_factor', 'progression'],
    can_emergency_block: false,
  },
  {
    name: 'Art/UI',
    owned_paths: ['src/rendering/**', 'src/ui/**', 'assets/**', 'web/src/styles/**', 'branding/**'],
    review_focus: ['visual_consistency', 'accessibility', 'ux', 'performance', 'brand_consistency'],
    can_emergency_block: false,
  },
  {
    name: 'QA/Security',
    owned_paths: ['tests/**', 'ci/security-checks/**'],
    review_focus: ['security', 'testing', 'reliability', 'edge_cases'],
    can_emergency_block: true,
  },
  {
    name: 'Narrative',
    owned_paths: ['src/gameplay/narrative/**', 'docs/design/story/**'],
    review_focus: ['tone', 'lore_consistency', 'dialogue', 'world_building'],
    can_emergency_block: false,
  },
  {
    name: 'Growth',
    owned_paths: ['docs/marketing/**', 'src/ui/social/**', 'analytics/**', 'web/src/**', 'web/public/**'],
    review_focus: ['virality', 'onboarding', 'retention', 'analytics', 'website_copy', 'seo'],
    can_emergency_block: false,
  },
];

export function loadConfig(): ConsensusConfig {
  try {
    const configPath = join(BUNDLE_ROOT, '.consensus', 'config.json');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function loadRoles(): RoleDefinition[] {
  try {
    const rolesPath = join(BUNDLE_ROOT, '.consensus', 'roles.json');
    const raw = JSON.parse(readFileSync(rolesPath, 'utf-8'));
    return raw.agents ?? DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
}

export const config = loadConfig();
export const roles = loadRoles();
