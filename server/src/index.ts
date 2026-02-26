import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

import agentRoutes from './routes/agents.js';
import taskRoutes from './routes/tasks.js';
import proposalRoutes from './routes/proposals.js';
import messageRoutes from './routes/messages.js';
import auditRoutes from './routes/audit.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import gameEvolutionRoutes from './routes/game-evolution.js';
import { config } from './config.js';
import { seedAgents } from './seed.js';
import { startSimulation } from './simulation.js';
import { getAdminKeyOnce } from './middleware/admin-auth.js';
import { startXBot, isXBotEnabled } from './services/x-bot.js';
import { startAutoSync, isAutoSyncEnabled } from './services/git-sync.js';
import { isAIEnabled } from './services/ai-client.js';
import { startLiveAgents } from './services/live-agents.js';
import { recoverMissingModules } from './services/game-evolution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUNDLE_ROOT = join(__dirname, '..', '..');

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// CORS — allow frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in MVP — tighten for production
    }
  },
}));
app.use(express.json({ limit: '50kb' }));

// ── ONEBIT is offline — transitioning to AI Game Studio ──
const offlineHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ONEBIT — Offline</title>
<style>body{margin:0;background:#0a0a0a;color:#0f0;font-family:monospace;display:flex;justify-content:center;align-items:center;min-height:100vh;text-align:center}
h1{font-size:2rem}p{color:#888;max-width:500px;line-height:1.6}</style></head>
<body><div><h1>ONEBIT is offline</h1><p>The project is transitioning to AI Game Studio — a next-gen game development pipeline powered by coordinated AI agent swarms.</p>
<p style="color:#555;margin-top:2rem">Follow <a href="https://x.com/OneBitAIagent" style="color:#0f0">@OneBitAIagent</a> for updates.</p></div></body></html>`;

// Offline overrides — these MUST come before API route mounting
app.get('/', (_req, res) => { res.type('html').send(offlineHTML); });
app.get('/api/game/play', (_req, res) => { res.type('html').send(offlineHTML); });
app.get('/game/*', (_req, res) => { res.type('html').send(offlineHTML); });

// API routes — only admin kept for data export, everything else disabled
app.use('/api/admin', adminRoutes);
// app.use('/api/agents', agentRoutes);
// app.use('/api/tasks', taskRoutes);
// app.use('/api/proposals', proposalRoutes);
// app.use('/api/messages', messageRoutes);
// app.use('/api/audit-log', auditRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/game', gameEvolutionRoutes);

// Catch-all for non-API routes — show offline page
app.use((req: any, res: any, next: any) => {
  if (req.path.startsWith('/api/')) return next();
  res.type('html').send(offlineHTML);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
    ai_enabled: isAIEnabled(),
    config: {
      min_reviewers: config.min_reviewers,
      approval_threshold: config.approval_threshold,
      blind_review: config.blind_review,
    },
  });
});

// API overview
app.get('/api', (_req, res) => {
  res.json({
    name: 'ONEBIT Consensus Engine',
    version: '0.1.0',
    endpoints: {
      'POST /api/agents/register': 'Register a new agent (no auth)',
      'GET  /api/agents': 'List all agents',
      'POST /api/agents/:id/claim-role': 'Claim a role (Architect, Gameplay, Art/UI, QA/Security, Narrative, Growth)',
      'POST /api/tasks': 'Create a role-scoped task',
      'GET  /api/tasks': 'List tasks (filter by role/status)',
      'POST /api/tasks/:id/claim': 'Claim a task (must match your role)',
      'POST /api/proposals': 'Create a proposal (DRAFT)',
      'POST /api/proposals/:id/submit': 'Submit > scan > assign reviewers',
      'POST /api/proposals/:id/review': 'Submit blind review',
      'POST /api/proposals/:id/vote': 'Cast vote (approve/reject)',
      'GET  /api/messages/stream': 'SSE real-time message feed',
      'GET  /api/dashboard': 'Public stats (no auth)',
      'GET  /api/audit-log': 'Hash-chained audit log',
      'GET  /api/audit-log/verify': 'Verify chain integrity',
      'GET  /api/health': 'Health check',
      'GET  /api/admin/overview': 'Admin dashboard (X-Admin-Key)',
      'GET  /api/admin/pending': 'Proposals awaiting human approval (X-Admin-Key)',
      'POST /api/admin/proposals/:id/merge': 'Human-approve merge (X-Admin-Key)',
      'POST /api/admin/proposals/:id/reject': 'Human-override reject (X-Admin-Key)',
      'POST /api/admin/proposals/batch-merge': 'Batch merge all pending (X-Admin-Key)',
      'POST /api/admin/test-tweet': 'Send a test tweet (X-Admin-Key)',
      'POST /api/admin/reset': 'Wipe all data for go-live (X-Admin-Key)',
      'GET  /api/game/play': 'Play the agent-built game (dynamic, assembled from merged modules)',
      'GET  /api/game/evolution': 'Game evolution timeline — what agents built',
      'GET  /api/game/source': 'View game module source code',
    },
    roles: ['Architect', 'Gameplay', 'Art/UI', 'QA/Security', 'Narrative', 'Growth'],
    proposalTypes: ['feature', 'bugfix', 'refactor', 'dependency', 'config', 'website', 'branding'],
    approvalPolicy: {
      'critical/high impact': 'Requires human admin approval after consensus',
      'low/medium impact': 'Auto-merges after consensus passes',
      'website/branding': 'Always requires admin approval (auto-propagates on merge)',
    },
  });
});

// ── ALL SERVICES DISABLED — ONEBIT is offline ──
// seedAgents();
// startSimulation();
// recoverMissingModules();
// startLiveAgents();
// startXBot();
// startAutoSync();

app.listen(PORT, () => {
  console.log(`\n  ONEBIT CONSENSUS ENGINE v0.1`);
  console.log(`  API:       http://localhost:${PORT}/api`);
  console.log(`  Admin:     http://localhost:${PORT}/api/admin/overview`);
  console.log(`  Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log(`  Game:      http://localhost:${PORT}/api/game/play (agent-built, dynamic)`);
  console.log(`  Frontend:  OFFLINE — transitioning to AI Game Studio`);
  console.log(`  Consensus: ${config.min_reviewers} reviewers, ${Math.round(config.approval_threshold * 100)}% threshold, blind=${config.blind_review}`);
  console.log(`  Approval:  Auto-merge non-critical | Human required for critical`);
  console.log(`  X Bot:     ${isXBotEnabled() ? 'LIVE — posting to @OneBitAIagent' : 'disabled (set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET)'}`);
  console.log(`  AI Agents: ${isAIEnabled() ? 'LIVE — agents use Claude API for real code generation & review' : 'disabled (set ANTHROPIC_API_KEY to enable)'}`);
  console.log(`  Git Sync:  ${isAutoSyncEnabled() ? 'LIVE — auto-push every 6h' : 'disabled (set GITHUB_TOKEN)'}\n`);
  const adminKey = getAdminKeyOnce();
  if (adminKey) {
    console.log(`  ADMIN KEY: ${adminKey}`);
    console.log(`  (Set ADMIN_KEY env var on Railway to use this key)\n`);
  }
});

export default app;
