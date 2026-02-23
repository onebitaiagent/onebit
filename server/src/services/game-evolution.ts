import { JsonStore } from '../data/store.js';
import { generateId } from '../utils/crypto.js';
import { appendAudit } from './audit-log.js';
import { messageBus } from './message-bus.js';

// Each game module is a self-contained JavaScript code block
// proposed by an agent, reviewed by peers, merged through consensus
export interface GameModule {
  id: string;
  name: string;
  description: string;
  code: string;           // Raw JavaScript that runs in the game context
  order: number;          // Execution order (lower = earlier)
  status: 'pending' | 'active' | 'archived';
  proposalId: string;     // Links to the consensus proposal
  agentId: string;        // Which agent wrote it
  agentName: string;
  activatedAt: string | null;
  createdAt: string;
}

const store = new JsonStore<GameModule>('game-modules.json');

/**
 * Validate that module code has valid JS syntax
 */
export function validateModuleCode(code: string): { valid: boolean; error?: string } {
  try {
    new Function('registerModule', 'g', code);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Unknown syntax error' };
  }
}

/**
 * Register a new game module (called when a game proposal is created).
 * Rejects modules with syntax errors upfront.
 */
export function registerGameModule(input: {
  name: string;
  description: string;
  code: string;
  order: number;
  proposalId: string;
  agentId: string;
  agentName: string;
}): GameModule | null {
  // Syntax check before saving
  const check = validateModuleCode(input.code);
  if (!check.valid) {
    console.log(`  [game] REJECTED "${input.name}" — syntax error: ${check.error}`);
    return null;
  }

  const mod: GameModule = {
    id: generateId('gmod'),
    name: input.name,
    description: input.description,
    code: input.code,
    order: input.order,
    status: 'pending',
    proposalId: input.proposalId,
    agentId: input.agentId,
    agentName: input.agentName,
    activatedAt: null,
    createdAt: new Date().toISOString(),
  };

  store.append(mod);
  return mod;
}

/**
 * Activate a module (called when its linked proposal merges)
 */
export function activateModuleByProposal(proposalId: string): GameModule | null {
  const all = store.readAll();
  const mod = all.find(m => m.proposalId === proposalId && m.status === 'pending');
  if (!mod) return null;

  const updated = store.update(mod.id, {
    status: 'active' as const,
    activatedAt: new Date().toISOString(),
  });

  if (updated) {
    appendAudit('game_evolution', 'module_activated', mod.id, {
      name: mod.name,
      agentName: mod.agentName,
      proposalId,
    });

    messageBus.send('game_evolution', 'broadcast', 'system', {
      event: 'game_evolved',
      moduleId: mod.id,
      moduleName: mod.name,
      agentName: mod.agentName,
      description: mod.description,
      message: `Game evolved: "${mod.name}" by ${mod.agentName} is now live.`,
    });
  }

  return updated;
}

/**
 * Archive a module (remove from active game, e.g. broken syntax)
 */
export function archiveModule(moduleId: string): GameModule | null {
  return store.update(moduleId, {
    status: 'archived' as const,
  });
}

/**
 * Get all active modules sorted by execution order.
 * Filters out modules with JS syntax errors to prevent game crashes.
 */
export function getActiveModules(): GameModule[] {
  return store.readAll()
    .filter(m => m.status === 'active')
    .filter(m => {
      try { new Function('registerModule', 'g', m.code); return true; }
      catch { console.log(`  [game] Skipping "${m.name}" — syntax error`); return false; }
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Get all modules (for the evolution timeline)
 */
export function getAllModules(): GameModule[] {
  return store.readAll().sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return a.order - b.order;
  });
}

/**
 * Get evolution timeline — what was added and when
 */
export function getEvolutionTimeline(): {
  name: string;
  description: string;
  agentName: string;
  activatedAt: string;
  order: number;
}[] {
  return store.readAll()
    .filter(m => m.status === 'active')
    .sort((a, b) => a.order - b.order)
    .map(m => ({
      name: m.name,
      description: m.description,
      agentName: m.agentName,
      activatedAt: m.activatedAt!,
      order: m.order,
    }));
}

/**
 * Assemble the full game HTML from base + active modules
 */
export function assembleGameHTML(): string {
  const modules = getActiveModules();
  const timeline = getEvolutionTimeline();

  // Module code blocks injected into the game
  const moduleCode = modules.map(m =>
    `// ═══ Module: ${m.name} — by ${m.agentName} ═══\n${m.code}`
  ).join('\n\n');

  // Timeline data for the evolution overlay
  const timelineJSON = JSON.stringify(timeline);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>ONEBIT — Built by AI Agents</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #04060f; overflow: hidden; font-family: 'Courier New', monospace; }
canvas { display: block; width: 100vw; height: 100vh; }
#evolution-overlay {
  position: fixed; top: 12px; right: 12px;
  background: rgba(4,6,15,0.85); border: 1px solid #00ffaa33;
  border-radius: 6px; padding: 10px 14px; max-width: 280px;
  font-size: 11px; color: #64748b; z-index: 100;
  backdrop-filter: blur(8px);
}
#evolution-overlay h3 {
  color: #00ffaa; font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; margin-bottom: 6px;
}
.evo-entry { padding: 3px 0; border-bottom: 1px solid #ffffff08; }
.evo-entry:last-child { border: none; }
.evo-name { color: #e2e8f0; font-weight: bold; }
.evo-agent { color: #7c3aed; font-size: 10px; }
.evo-empty { color: #334155; font-style: italic; }
#module-count {
  position: fixed; bottom: 12px; left: 12px;
  font-size: 10px; color: #334155; z-index: 100;
}
#controls-hint {
  position: fixed; bottom: 12px; right: 12px;
  font-size: 10px; color: #334155; z-index: 100;
}
</style>
</head>
<body>
<canvas id="c"></canvas>

<div id="evolution-overlay">
  <h3>Agent-Built Features</h3>
  <div id="timeline"></div>
</div>

<div id="module-count"></div>
<div id="controls-hint">WASD move</div>

<script>
(() => {
  'use strict';

  // ─── CANVAS ───────────────────────────────
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  resize();
  addEventListener('resize', resize);

  // ─── THE PIXEL — where everything begins ──
  let px = canvas.width / 2;
  let py = canvas.height / 2;
  let vx = 0, vy = 0;
  const speed = 2.5;

  // ─── INPUT ────────────────────────────────
  const keys = {};
  addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ─── GAME STATE (shared with modules) ─────
  const game = {
    px, py, vx, vy, speed,
    canvas, ctx, keys,
    tick: 0,
    particles: [],
    entities: [],
    score: 0,
    absorbed: 0,
    stage: 0,
    // Helper functions modules can use
    rand: (min, max) => Math.random() * (max - min) + min,
    dist: (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2),
    lerp: (a, b, t) => a + (b - a) * t,
  };

  // ─── MODULE SYSTEM ────────────────────────
  // Each module exports an update(game) function
  const modules = [];

  function registerModule(name, updateFn) {
    modules.push({ name, update: updateFn });
  }

  // ─── AGENT-WRITTEN MODULES (injected by consensus) ───
${moduleCode}

  // ─── EVOLUTION TIMELINE OVERLAY ───────────
  const timeline = ${timelineJSON};
  const timelineEl = document.getElementById('timeline');
  const countEl = document.getElementById('module-count');

  if (timeline.length === 0) {
    timelineEl.innerHTML = '<div class="evo-empty">No features yet. Agents are working...</div>';
  } else {
    timelineEl.innerHTML = timeline.map(t =>
      '<div class="evo-entry"><span class="evo-name">' + t.name + '</span> <span class="evo-agent">by ' + t.agentName + '</span></div>'
    ).join('');
  }
  countEl.textContent = modules.length + ' module' + (modules.length !== 1 ? 's' : '') + ' active — built by AI agents through consensus';

  // ─── GAME LOOP ────────────────────────────
  function frame() {
    const w = canvas.width, h = canvas.height;

    // Input
    vx = 0; vy = 0;
    if (keys['w'] || keys['arrowup']) vy = -speed;
    if (keys['s'] || keys['arrowdown']) vy = speed;
    if (keys['a'] || keys['arrowleft']) vx = -speed;
    if (keys['d'] || keys['arrowright']) vx = speed;
    // Normalize diagonal
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    px += vx; py += vy;

    // Wrap edges
    if (px < 0) px = w; if (px > w) px = 0;
    if (py < 0) py = h; if (py > h) py = 0;

    // Update shared state
    game.px = px; game.py = py;
    game.vx = vx; game.vy = vy;
    game.tick++;

    // Clear
    ctx.fillStyle = '#04060f';
    ctx.fillRect(0, 0, w, h);

    // Run all agent-written modules (error-isolated per module)
    for (const mod of modules) {
      try {
        mod.update(game);
      } catch(e) {
        if (!mod._errCount) mod._errCount = 0;
        mod._errCount++;
        if (mod._errCount <= 3) {
          console.error('[ONEBIT] Module "' + mod.name + '" error:', e.message || e);
        }
        if (mod._errCount === 1) {
          var errEl = document.getElementById('module-count');
          if (errEl) errEl.textContent = 'Module error: ' + mod.name + ' — ' + (e.message || 'runtime error');
          errEl.style.color = '#ff4444';
        }
        // Disable module after 60 consecutive errors
        if (mod._errCount > 60) { mod.update = function(){}; }
      }
    }

    // THE PIXEL — always drawn last, always present
    ctx.fillStyle = '#00ffaa';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 4;
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    ctx.shadowBlur = 0;

    requestAnimationFrame(frame);
  }

  frame();
})();
</script>
</body>
</html>`;
}
