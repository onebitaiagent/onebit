import { Router } from 'express';
import {
  assembleGameHTML,
  getActiveModules,
  getAllModules,
  getEvolutionTimeline,
} from '../services/game-evolution.js';

const router = Router();

// GET /api/game/play — serve the dynamically assembled game
router.get('/play', (_req, res) => {
  const html = assembleGameHTML();
  res.type('html').send(html);
});

// GET /api/game/evolution — public timeline of features added
router.get('/evolution', (_req, res) => {
  const timeline = getEvolutionTimeline();
  const modules = getAllModules();
  res.json({
    activeFeatures: timeline.length,
    totalModules: modules.length,
    timeline,
    modules: modules.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      status: m.status,
      agentName: m.agentName,
      proposalId: m.proposalId,
      activatedAt: m.activatedAt,
      order: m.order,
    })),
  });
});

// GET /api/game/source — view the current assembled game source
router.get('/source', (_req, res) => {
  const modules = getActiveModules();
  res.json({
    activeModules: modules.length,
    modules: modules.map(m => ({
      name: m.name,
      agentName: m.agentName,
      code: m.code,
      order: m.order,
    })),
  });
});

export default router;
