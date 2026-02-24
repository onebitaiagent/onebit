import { Router, type Request, type Response } from 'express';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import {
  mergeProposal,
  getProposals,
  getProposal,
} from '../services/consensus-engine.js';
import { getAllAgents } from '../services/agent-registry.js';
import { getTasks } from '../services/task-queue.js';
import { appendAudit, verifyChain } from '../services/audit-log.js';
import { messageBus } from '../services/message-bus.js';
import { postLaunchThread, isThreadPosted, getTweetStats, deleteTweets, deleteAllMyTweets } from '../services/x-bot.js';
import { pushDataToGitHub, getLastPushTime, isAutoSyncEnabled } from '../services/git-sync.js';
import { getCurrentPhase, advancePhase, getAgentStatus, stopAgents } from '../services/live-agents.js';
import { getAICosts } from '../services/ai-client.js';
import { archiveModule, registerGameModule, activateModuleByProposal, getAllModules, updateModuleCode } from '../services/game-evolution.js';
import { generateId } from '../utils/crypto.js';
import { JsonStore } from '../data/store.js';
import type { Proposal, ProposalState } from '../models/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const proposalStore = new JsonStore<Proposal>('proposals.json');
const router = Router();

// Admin dashboard HTML — no auth (key entered in the UI)
router.get('/dashboard', (_req: Request, res: Response) => {
  res.type('html').send(adminDashboardHTML());
});

// All other admin routes require the admin key
router.use(adminAuthMiddleware);

// GET /api/admin/overview — admin dashboard
router.get('/overview', (_req: Request, res: Response) => {
  const agents = getAllAgents();
  const proposals = getProposals();
  const tasks = getTasks({});
  const chainValid = verifyChain();

  const pendingApproval = proposals.filter(p => p.state === 'APPROVED');
  const merged = proposals.filter(p => p.state === 'MERGED');
  const rejected = proposals.filter(p => p.state === 'REJECTED');

  res.json({
    agents: {
      total: agents.length,
      active: agents.filter(a => a.status === 'active').length,
      byRole: agents.reduce((acc, a) => {
        if (a.role) acc[a.role] = (acc[a.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    proposals: {
      total: proposals.length,
      pendingApproval: pendingApproval.length,
      merged: merged.length,
      rejected: rejected.length,
      inReview: proposals.filter(p => p.state === 'IN_REVIEW').length,
      voting: proposals.filter(p => p.state === 'VOTING').length,
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter(t => t.status === 'open').length,
      completed: tasks.filter(t => t.status === 'completed').length,
    },
    security: {
      auditChainValid: chainValid,
    },
  });
});

// GET /api/admin/pending — proposals awaiting human approval
router.get('/pending', (_req: Request, res: Response) => {
  const pending = getProposals({ state: 'APPROVED' });
  res.json({
    proposals: pending.map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      impact: p.impact,
      agent: p.agent,
      approvalRatio: p.approvalRatio,
      reviewCount: p.reviews.length,
      filesChanged: p.filesChanged,
      linesAdded: p.linesAdded,
      linesRemoved: p.linesRemoved,
      votingCompletedAt: p.votingCompletedAt,
    })),
    total: pending.length,
  });
});

// POST /api/admin/proposals/:id/merge — human approves merge
router.post('/proposals/:id/merge', (req: Request, res: Response) => {
  const proposal = getProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  if (proposal.state !== 'APPROVED') {
    res.status(400).json({ error: `Proposal is ${proposal.state}, expected APPROVED` });
    return;
  }

  const result = mergeProposal(req.params.id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Emit propagation event for website/branding proposals
  if (proposal.type === 'website' || proposal.type === 'branding') {
    messageBus.send('admin', 'broadcast', 'system', {
      event: 'propagation_triggered',
      proposalId: proposal.id,
      type: proposal.type,
      title: proposal.title,
      filesChanged: proposal.filesChanged,
      message: `Auto-propagation: "${proposal.title}" (${proposal.type}) deployed.`,
    });

    appendAudit('admin', 'propagation_triggered', proposal.id, {
      type: proposal.type,
      filesChanged: proposal.filesChanged,
    });
  }

  res.json({ proposal: result.proposal, propagated: proposal.type === 'website' || proposal.type === 'branding' });
});

// POST /api/admin/proposals/:id/reject — human override reject
router.post('/proposals/:id/reject', (req: Request, res: Response) => {
  const { reason } = req.body;
  const proposal = getProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  // Admin can reject from any non-terminal state
  if (proposal.state === 'MERGED' || proposal.state === 'CLOSED') {
    res.status(400).json({ error: `Proposal is already ${proposal.state}` });
    return;
  }

  const now = new Date().toISOString();
  proposalStore.update(req.params.id, {
    state: 'REJECTED' as ProposalState,
    humanApproval: false,
    resolvedAt: now,
  } as Partial<Proposal>);

  appendAudit('admin', 'admin_reject', req.params.id, {
    reason: reason || 'Rejected by admin override',
    previousState: proposal.state,
  });

  messageBus.send('admin', 'broadcast', 'system', {
    event: 'admin_rejected',
    proposalId: proposal.id,
    title: proposal.title,
    reason: reason || 'Rejected by admin override',
  });

  res.json({ proposal: getProposal(req.params.id) });
});

// POST /api/admin/proposals/batch-merge — merge all pending non-critical
router.post('/proposals/batch-merge', (_req: Request, res: Response) => {
  const pending = getProposals({ state: 'APPROVED' });
  const results: { id: string; title: string; merged: boolean; error?: string }[] = [];

  for (const p of pending) {
    const result = mergeProposal(p.id);
    results.push({
      id: p.id,
      title: p.title,
      merged: !result.error,
      error: result.error,
    });

    // Propagation for website/branding
    if (!result.error && (p.type === 'website' || p.type === 'branding')) {
      messageBus.send('admin', 'broadcast', 'system', {
        event: 'propagation_triggered',
        proposalId: p.id,
        type: p.type,
        title: p.title,
        filesChanged: p.filesChanged,
      });
    }
  }

  res.json({ merged: results.filter(r => r.merged).length, total: results.length, results });
});

// POST /api/admin/test-tweet — send a test tweet via the X bot
router.post('/test-tweet', (req: Request, res: Response) => {
  const { text } = req.body;
  const tweetText = text || `ONEBIT Consensus Engine is live. AI agents are building a game from 1 pixel through blind peer review.\n\nEvery line of code reviewed by 2+ AI agents. Critical changes require human approval.\n\nWatch it happen: onebit.dev\n\n#ONEBIT #AI #GameDev`;

  messageBus.send('admin', 'broadcast', 'system', {
    event: 'x_post',
    handle: '@OneBitAIagent',
    text: tweetText,
  });

  appendAudit('admin', 'test_tweet_triggered', 'x_bot', { text: tweetText });
  res.json({ sent: true, text: tweetText });
});

// POST /api/admin/launch-thread — post the introductory thread to X
router.post('/launch-thread', async (req: Request, res: Response) => {
  const { imageUrls } = req.body as {
    imageUrls?: {
      hero?: string;
      phases?: string;
      consensus?: string;
      agents?: string;
      game?: string;
    };
  };

  if (isThreadPosted()) {
    res.status(400).json({ error: 'Launch thread already posted this session. Restart server to reset.' });
    return;
  }

  const result = await postLaunchThread(imageUrls);
  appendAudit('admin', 'launch_thread_triggered', 'x_bot', {
    success: result.success,
    tweetCount: result.tweetIds.length,
    hasImages: !!imageUrls,
  });

  res.json(result);
});

// GET /api/admin/tweet-stats — check daily tweet usage
router.get('/tweet-stats', (_req: Request, res: Response) => {
  res.json(getTweetStats());
});

// POST /api/admin/delete-tweets — delete tweets by ID
router.post('/delete-tweets', async (req: Request, res: Response) => {
  const { tweetIds } = req.body as { tweetIds: string[] };
  if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
    res.status(400).json({ error: 'Provide { "tweetIds": ["id1", "id2", ...] }' });
    return;
  }

  const result = await deleteTweets(tweetIds);
  res.json(result);
});

// POST /api/admin/nuke-tweets — delete ALL tweets from the account
router.post('/nuke-tweets', async (_req: Request, res: Response) => {
  const result = await deleteAllMyTweets();
  res.json(result);
});

// POST /api/admin/reset — wipe all data for go-live
router.post('/reset', (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'RESET_ALL_DATA') {
    res.status(400).json({ error: 'Send { "confirm": "RESET_ALL_DATA" } to proceed' });
    return;
  }

  const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
  const stores = ['agents.json', 'tasks.json', 'proposals.json', 'messages.json', 'audit.json', 'game-modules.json'];
  const cleared: string[] = [];
  for (const file of stores) {
    try {
      writeFileSync(join(dataDir, file), '[]', 'utf-8');
      cleared.push(file);
    } catch {
      // Skip if file doesn't exist
    }
  }

  appendAudit('admin', 'full_reset', 'system', { cleared });
  res.json({ reset: true, cleared });
});

// POST /api/admin/git-push — push data snapshot to GitHub
router.post('/git-push', async (_req: Request, res: Response) => {
  const result = await pushDataToGitHub();
  res.json({
    ...result,
    autoSyncEnabled: isAutoSyncEnabled(),
  });
});

// GET /api/admin/git-status — check git sync status
router.get('/git-status', (_req: Request, res: Response) => {
  res.json({
    autoSyncEnabled: isAutoSyncEnabled(),
    lastPush: getLastPushTime() || 'never',
    githubTokenSet: !!process.env.GITHUB_TOKEN,
    repo: 'onebitaiagent/onebit',
    schedule: 'every 6 hours',
  });
});

// GET /api/admin/phase — current phase + progress
router.get('/phase', (_req: Request, res: Response) => {
  res.json(getCurrentPhase());
});

// POST /api/admin/advance-phase — manually advance to next phase
router.post('/advance-phase', (_req: Request, res: Response) => {
  const result = advancePhase();
  appendAudit('admin', 'phase_advanced', 'system', result);
  res.json(result);
});

// GET /api/admin/costs — AI API cost tracking
router.get('/costs', (_req: Request, res: Response) => {
  res.json(getAICosts());
});

// GET /api/admin/agents-status — live agent runtime status
router.get('/agents-status', (_req: Request, res: Response) => {
  res.json(getAgentStatus());
});

// POST /api/admin/modules/:id/archive — remove a broken module from the game
router.post('/modules/:id/archive', (req: Request, res: Response) => {
  const result = archiveModule(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  appendAudit('admin', 'module_archived', req.params.id, { name: result.name });
  res.json({ archived: true, module: result });
});

// PATCH /api/admin/modules/:id — update a module's code or order (hotfix)
router.patch('/modules/:id', (req: Request, res: Response) => {
  const { code, order } = req.body;
  if (!code && order === undefined) {
    res.status(400).json({ error: 'Provide { code } and/or { order }' });
    return;
  }
  const result = updateModuleCode(req.params.id, { code, order });
  if (!result) {
    res.status(400).json({ error: 'Module not found or code validation failed' });
    return;
  }
  appendAudit('admin', 'module_updated', req.params.id, { name: result.name });
  res.json({ updated: true, module: { id: result.id, name: result.name, order: result.order } });
});

// POST /api/admin/modules/inject — manually inject a game module (e.g. to restore a lost one)
router.post('/modules/inject', (req: Request, res: Response) => {
  const { name, description, code, order } = req.body;
  if (!name || !code) {
    res.status(400).json({ error: 'Provide { name, description, code, order }' });
    return;
  }

  const fakeProposalId = generateId('admin');
  const mod = registerGameModule({
    name,
    description: description || 'Manually injected by admin',
    code,
    order: order || 50,
    proposalId: fakeProposalId,
    agentId: 'admin',
    agentName: 'admin',
  });

  if (!mod) {
    res.status(400).json({ error: 'Module has syntax errors — rejected' });
    return;
  }

  // Immediately activate it (skip consensus)
  const activated = activateModuleByProposal(fakeProposalId);
  appendAudit('admin', 'module_injected', mod.id, { name: mod.name });
  res.json({ injected: true, module: activated || mod });
});

// POST /api/admin/stop-agents — manually stop all agents
router.post('/stop-agents', (_req: Request, res: Response) => {
  stopAgents();
  appendAudit('admin', 'agents_stopped', 'system', { reason: 'manual_stop' });
  res.json({ stopped: true, costs: getAICosts() });
});

// GET /api/admin/data/export — download all live data as JSON backup
router.get('/data/export', (_req: Request, res: Response) => {
  const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
  const stores = ['agents.json', 'tasks.json', 'proposals.json', 'messages.json', 'audit.json', 'game-modules.json'];
  const snapshot: Record<string, unknown> = { exportedAt: new Date().toISOString() };

  for (const file of stores) {
    const filePath = join(dataDir, file);
    try {
      if (existsSync(filePath)) {
        snapshot[file.replace('.json', '')] = JSON.parse(readFileSync(filePath, 'utf-8'));
      }
    } catch { /* skip */ }
  }

  res.setHeader('Content-Disposition', `attachment; filename="onebit-backup-${Date.now()}.json"`);
  res.json(snapshot);
});

// POST /api/admin/data/import — restore data from a JSON backup
router.post('/data/import', (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'IMPORT_DATA') {
    res.status(400).json({
      error: 'Send full backup JSON with { "confirm": "IMPORT_DATA" } to proceed',
      hint: 'Include agents, tasks, proposals, messages, audit, game-modules arrays',
    });
    return;
  }

  const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
  const mapping: Record<string, string> = {
    agents: 'agents.json',
    tasks: 'tasks.json',
    proposals: 'proposals.json',
    messages: 'messages.json',
    audit: 'audit.json',
    'game-modules': 'game-modules.json',
  };

  const restored: string[] = [];
  const errors: string[] = [];

  for (const [key, file] of Object.entries(mapping)) {
    if (req.body[key] && Array.isArray(req.body[key])) {
      try {
        writeFileSync(join(dataDir, file), JSON.stringify(req.body[key], null, 2), 'utf-8');
        restored.push(file);
      } catch (e) {
        errors.push(`${file}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  appendAudit('admin', 'data_imported', 'system', { restored, errors });
  res.json({ restored, errors, note: 'Restart server or wait for stores to reload for full effect' });
});

function adminDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ONEBIT Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#04060f;color:#e2e8f0;font-family:'Courier New',monospace;padding:20px}
h1{color:#00ffaa;font-size:18px;margin-bottom:4px}
.sub{color:#64748b;font-size:11px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:20px}
.card{background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;padding:14px}
.card h3{color:#00ffaa;font-size:11px;text-transform:uppercase;letter-spacing:.15em;margin-bottom:10px}
.stat{display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #0f172a}
.stat .v{color:#00ffaa;font-weight:700}
.stat .warn{color:#ff4444}
.btn{background:#00ffaa;color:#04060f;border:none;padding:8px 16px;border-radius:4px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;margin:4px}
.btn:hover{background:#44ffcc}
.btn.danger{background:#ff4444;color:#fff}
.btn.danger:hover{background:#ff6666}
.btn:disabled{opacity:.4;cursor:not-allowed}
.proposals{margin-top:10px}
.prop{background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.prop .title{font-size:12px;font-weight:700}
.prop .meta{font-size:10px;color:#64748b}
.prop .actions{display:flex;gap:4px}
.log{background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;padding:14px;margin-top:14px;max-height:200px;overflow-y:auto;font-size:10px;color:#64748b}
.log .entry{padding:2px 0;border-bottom:1px solid #0f172a}
.key-input{background:#0f172a;border:1px solid #1e293b;color:#e2e8f0;padding:8px 12px;border-radius:4px;font-family:inherit;font-size:11px;width:100%;margin-bottom:12px}
#status{font-size:10px;color:#64748b;margin-top:8px}
.pulse{animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
</style>
</head><body>
<h1>ONEBIT ADMIN</h1>
<div class="sub">Consensus Engine Control Panel</div>

<div style="margin-bottom:16px">
  <input type="password" id="key" class="key-input" placeholder="Enter admin key..." />
</div>

<div class="grid" id="cards"></div>

<div style="margin-bottom:12px">
  <button class="btn" onclick="batchMerge()">Merge All Pending</button>
  <button class="btn" onclick="advancePhase()">Advance Phase</button>
  <button class="btn" onclick="refresh()">Refresh</button>
  <button class="btn danger" onclick="stopAgents()">Stop Agents</button>
</div>

<h3 style="color:#00ffaa;font-size:11px;letter-spacing:.15em;margin-bottom:8px">PENDING PROPOSALS</h3>
<div id="proposals" class="proposals"></div>

<div id="log" class="log"><div class="entry">Waiting for admin key...</div></div>
<div id="status"></div>

<script>
var KEY = '';
var BASE = '';

document.getElementById('key').addEventListener('input', function(e) {
  KEY = e.target.value;
  if (KEY.length > 10) refresh();
});

function hdr() { return { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' }; }

function log(msg) {
  var el = document.getElementById('log');
  var d = document.createElement('div');
  d.className = 'entry';
  d.textContent = new Date().toLocaleTimeString() + ' ' + msg;
  el.prepend(d);
  if (el.children.length > 50) el.removeChild(el.lastChild);
}

async function api(path, opts) {
  try {
    var r = await fetch(BASE + '/api/admin/' + path, Object.assign({ headers: hdr() }, opts || {}));
    if (!r.ok) { log('ERROR: ' + r.status + ' on ' + path); return null; }
    return await r.json();
  } catch(e) { log('FETCH ERROR: ' + e.message); return null; }
}

async function refresh() {
  var [overview, phase, costs, agents, pending] = await Promise.all([
    api('overview'), api('phase'), api('costs'), api('agents-status'), api('pending')
  ]);
  if (!overview) return;

  var cards = '';

  // Phase card
  if (phase) {
    cards += '<div class="card"><h3>Phase</h3>' +
      '<div class="stat"><span>Current</span><span class="v">' + phase.phase + '</span></div>' +
      '<div class="stat"><span>Progress</span><span class="v">' + phase.phaseProgress + '</span></div>' +
      '<div class="stat"><span>Phases</span><span class="v">' + phase.allPhases.join(' → ') + '</span></div>' +
      '</div>';
  }

  // Agents card
  if (agents) {
    var running = agents.running;
    var timeLeft = Math.round(agents.timeRemainingMs / 60000);
    cards += '<div class="card"><h3>Agents</h3>' +
      '<div class="stat"><span>Status</span><span class="v' + (running ? ' pulse' : '') + '">' + (running ? 'RUNNING' : 'STOPPED') + '</span></div>' +
      '<div class="stat"><span>Time Left</span><span class="v">' + (running ? timeLeft + 'm' : '—') + '</span></div>' +
      '<div class="stat"><span>Runtime</span><span class="v">' + (agents.runtimeMs / 60000).toFixed(1) + 'm</span></div>' +
      '</div>';
  }

  // Costs card
  if (costs) {
    cards += '<div class="card"><h3>Costs</h3>' +
      '<div class="stat"><span>Total</span><span class="v">' + costs.estimatedCost + '</span></div>' +
      '<div class="stat"><span>Rate</span><span class="v">' + costs.costPerHour + '</span></div>' +
      '<div class="stat"><span>Projected</span><span class="v">' + costs.projectedDaily + '</span></div>' +
      '<div class="stat"><span>API Calls</span><span class="v">' + costs.totalCalls + '</span></div>' +
      '</div>';
  }

  // Pipeline card
  if (overview) {
    cards += '<div class="card"><h3>Pipeline</h3>' +
      '<div class="stat"><span>Agents</span><span class="v">' + overview.agents.active + '/' + overview.agents.total + '</span></div>' +
      '<div class="stat"><span>Pending Merge</span><span class="v">' + overview.proposals.pendingApproval + '</span></div>' +
      '<div class="stat"><span>In Review</span><span class="v">' + overview.proposals.inReview + '</span></div>' +
      '<div class="stat"><span>Merged</span><span class="v">' + overview.proposals.merged + '</span></div>' +
      '<div class="stat"><span>Rejected</span><span class="v' + (overview.proposals.rejected > 0 ? ' warn' : '') + '">' + overview.proposals.rejected + '</span></div>' +
      '<div class="stat"><span>Tasks Open</span><span class="v">' + overview.tasks.open + '/' + overview.tasks.total + '</span></div>' +
      '</div>';
  }

  document.getElementById('cards').innerHTML = cards;

  // Proposals
  if (pending && pending.proposals) {
    var html = '';
    if (pending.proposals.length === 0) {
      html = '<div style="color:#64748b;font-size:11px;padding:8px">No proposals waiting for approval</div>';
    }
    pending.proposals.forEach(function(p) {
      html += '<div class="prop">' +
        '<div><div class="title">' + p.title + '</div>' +
        '<div class="meta">' + p.type + ' | ' + p.impact + ' impact | ' + p.reviewCount + ' reviews | ' + Math.round(p.approvalRatio * 100) + '% approval | +' + p.linesAdded + ' lines</div></div>' +
        '<div class="actions">' +
        '<button class="btn" onclick="mergeOne(\\'' + p.id + '\\')">Merge</button>' +
        '<button class="btn danger" onclick="rejectOne(\\'' + p.id + '\\')">Reject</button>' +
        '</div></div>';
    });
    document.getElementById('proposals').innerHTML = html;
  }

  document.getElementById('status').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
  log('Refreshed — ' + (pending ? pending.total : 0) + ' pending, ' + (overview ? overview.proposals.merged : 0) + ' merged');
}

async function batchMerge() {
  log('Batch merging all pending...');
  var r = await api('proposals/batch-merge', { method: 'POST' });
  if (r) { log('Merged ' + r.merged + '/' + r.total); refresh(); }
}

async function mergeOne(id) {
  log('Merging ' + id + '...');
  var r = await api('proposals/' + id + '/merge', { method: 'POST' });
  if (r) { log('Merged: ' + (r.proposal ? r.proposal.title : id)); refresh(); }
}

async function rejectOne(id) {
  if (!confirm('Reject this proposal?')) return;
  log('Rejecting ' + id + '...');
  var r = await api('proposals/' + id + '/reject', { method: 'POST', body: JSON.stringify({ reason: 'Admin rejected' }) });
  if (r) { log('Rejected: ' + id); refresh(); }
}

async function advancePhase() {
  if (!confirm('Advance to next phase?')) return;
  log('Advancing phase...');
  var r = await api('advance-phase', { method: 'POST' });
  if (r) { log(r.message); refresh(); }
}

async function stopAgents() {
  if (!confirm('Stop all agents?')) return;
  log('Stopping agents...');
  var r = await api('stop-agents', { method: 'POST' });
  if (r) { log('Agents stopped. Cost: ' + r.costs.estimatedCost); refresh(); }
}

// Auto-refresh every 30s
setInterval(function() { if (KEY.length > 10) refresh(); }, 30000);
</script>
</body></html>`;
}

export default router;
