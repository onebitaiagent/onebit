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

// API routes
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameEvolutionRoutes);

// Serve static files — game (legacy)
app.use('/game', express.static(join(BUNDLE_ROOT, 'game')));

// Serve built frontend (if web/dist exists — for single-service Railway deploy)
const webDist = join(BUNDLE_ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/game/')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

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

// Seed 6 starter agents on first run
seedAgents();

// Start agent simulation (disabled by default — use live agents instead)
startSimulation();

// Start live AI agents — independent agents that use Claude to write real code
startLiveAgents();

// Start X bot — posts to @OneBitAIagent when env vars are set
startXBot();

// Start auto-sync — pushes data snapshots to GitHub every 6 hours
startAutoSync();

app.listen(PORT, () => {
  console.log(`\n  ONEBIT CONSENSUS ENGINE v0.1`);
  console.log(`  API:       http://localhost:${PORT}/api`);
  console.log(`  Admin:     http://localhost:${PORT}/api/admin/overview`);
  console.log(`  Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log(`  Game:      http://localhost:${PORT}/api/game/play (agent-built, dynamic)`);
  console.log(`  Frontend:  ${existsSync(webDist) ? `http://localhost:${PORT}` : 'not built (run: cd ../web && npm run build)'}`);
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
