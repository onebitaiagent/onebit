import type { Proposal, ScanResult, ConsensusConfig } from '../models/types.js';

export function scanProposal(proposal: Proposal, config: ConsensusConfig): ScanResult {
  const failures: string[] = [];
  let requiresHuman = false;

  // 1. Diff size check
  const totalLines = proposal.linesAdded + proposal.linesRemoved;
  if (totalLines > config.max_lines_per_proposal) {
    failures.push(`Diff too large: ${totalLines} lines (max ${config.max_lines_per_proposal})`);
  }

  // 2. Test coverage check
  if (proposal.testResults.coverage < config.mandatory_test_coverage) {
    failures.push(`Test coverage ${(proposal.testResults.coverage * 100).toFixed(0)}% below minimum ${(config.mandatory_test_coverage * 100).toFixed(0)}%`);
  }

  // 3. Failing tests
  if (proposal.testResults.failed > 0) {
    failures.push(`${proposal.testResults.failed} test(s) failing`);
  }

  // 4. Blocked patterns in file paths and security notes
  for (const pattern of config.auto_reject_patterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(proposal.securityNotes)) {
      failures.push(`Blocked pattern in security notes: ${pattern}`);
    }
    for (const file of proposal.filesChanged) {
      if (regex.test(file)) {
        failures.push(`Blocked pattern in file path: ${file} matches ${pattern}`);
      }
    }
  }

  // 5. Human review triggers
  for (const trigger of config.human_review_triggers) {
    for (const file of proposal.filesChanged) {
      if (file.toLowerCase().includes(trigger.toLowerCase())) {
        requiresHuman = true;
        break;
      }
    }
    if (requiresHuman) break;
  }

  // 6. New dependencies always need human review
  if (proposal.dependenciesAdded.length > 0) {
    requiresHuman = true;
  }

  return { passed: failures.length === 0, failures, requiresHuman };
}
