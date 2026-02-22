/**
 * Pre-written game code modules that AI agents propose through consensus.
 * Each module is a self-contained JavaScript block using the registerModule(name, updateFn) API.
 * The game object provides: px, py, vx, vy, speed, canvas, ctx, keys, tick, particles, entities, score, absorbed, stage, rand, dist, lerp
 *
 * These are ordered by game evolution — from ambient visuals to full gameplay.
 */

export interface GameCodeModule {
  name: string;
  description: string;
  code: string;
  order: number;
  taskTitle: string;   // Matches a simulation task title
  role: string;        // Which agent role would propose this
}

export const GAME_CODE_MODULES: GameCodeModule[] = [
  {
    name: 'Background Stars',
    description: 'Ambient starfield that slowly drifts. First sign of life beyond the pixel.',
    order: 10,
    taskTitle: 'Add ambient background starfield',
    role: 'Art/UI',
    code: `registerModule('Background Stars', (game) => {
  if (!game._stars) {
    game._stars = [];
    for (let i = 0; i < 60; i++) {
      game._stars.push({
        x: Math.random() * game.canvas.width,
        y: Math.random() * game.canvas.height,
        size: Math.random() * 1.2 + 0.3,
        brightness: Math.random(),
        drift: Math.random() * 0.15 + 0.02,
      });
    }
  }
  const ctx = game.ctx;
  for (const s of game._stars) {
    s.y += s.drift;
    if (s.y > game.canvas.height) { s.y = 0; s.x = Math.random() * game.canvas.width; }
    const flicker = 0.5 + Math.sin(game.tick * 0.02 + s.brightness * 10) * 0.5;
    ctx.fillStyle = \`rgba(255,255,255,\${(0.15 + s.brightness * 0.4) * flicker})\`;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size > 0.8 ? 2 : 1, 1);
  }
});`,
  },
  {
    name: 'Pixel Glow',
    description: 'Radial glow emanating from the player pixel. Makes the pixel feel alive.',
    order: 15,
    taskTitle: 'Add pixel glow effect',
    role: 'Art/UI',
    code: `registerModule('Pixel Glow', (game) => {
  const ctx = game.ctx;
  const intensity = 0.3 + Math.sin(game.tick * 0.03) * 0.15;
  const grad = ctx.createRadialGradient(game.px, game.py, 0, game.px, game.py, 40);
  grad.addColorStop(0, \`rgba(0,255,170,\${intensity})\`);
  grad.addColorStop(0.5, \`rgba(0,255,170,\${intensity * 0.3})\`);
  grad.addColorStop(1, 'rgba(0,255,170,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(game.px - 40, game.py - 40, 80, 80);
});`,
  },
  {
    name: 'Movement Trail',
    description: 'Fading trail behind the pixel when moving. Shows player history.',
    order: 20,
    taskTitle: 'Implement movement trail system',
    role: 'Gameplay',
    code: `registerModule('Movement Trail', (game) => {
  if (!game._trail) game._trail = [];
  if (game.vx !== 0 || game.vy !== 0) {
    game._trail.push({ x: game.px, y: game.py, age: 0 });
  }
  const ctx = game.ctx;
  for (let i = game._trail.length - 1; i >= 0; i--) {
    const t = game._trail[i];
    t.age++;
    if (t.age > 30) { game._trail.splice(i, 1); continue; }
    const alpha = (1 - t.age / 30) * 0.6;
    ctx.fillStyle = \`rgba(0,255,170,\${alpha})\`;
    ctx.fillRect(Math.round(t.x), Math.round(t.y), 1, 1);
  }
});`,
  },
  {
    name: 'Floating Particles',
    description: 'Tiny energy particles that float around the void. Can be absorbed by the pixel.',
    order: 30,
    taskTitle: 'Create floating particle spawner',
    role: 'Gameplay',
    code: `registerModule('Floating Particles', (game) => {
  if (!game._floaters) game._floaters = [];
  // Spawn particles
  if (game._floaters.length < 25 && game.tick % 30 === 0) {
    game._floaters.push({
      x: game.rand(0, game.canvas.width),
      y: game.rand(0, game.canvas.height),
      vx: game.rand(-0.3, 0.3),
      vy: game.rand(-0.3, 0.3),
      size: game.rand(1, 3),
      color: \`hsl(\${game.rand(140, 180)}, 100%, \${game.rand(60, 80)}%)\`,
    });
  }
  const ctx = game.ctx;
  for (let i = game._floaters.length - 1; i >= 0; i--) {
    const p = game._floaters[i];
    p.x += p.vx; p.y += p.vy;
    // Wrap
    if (p.x < 0) p.x = game.canvas.width;
    if (p.x > game.canvas.width) p.x = 0;
    if (p.y < 0) p.y = game.canvas.height;
    if (p.y > game.canvas.height) p.y = 0;
    // Absorb check
    const d = game.dist({ x: game.px, y: game.py }, p);
    if (d < 20) {
      game._floaters.splice(i, 1);
      game.absorbed++;
      game.score += 10;
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    ctx.globalAlpha = 1;
  }
});`,
  },
  {
    name: 'Score HUD',
    description: 'Minimal heads-up display showing score and absorbed count.',
    order: 35,
    taskTitle: 'Build score display HUD',
    role: 'Art/UI',
    code: `registerModule('Score HUD', (game) => {
  const ctx = game.ctx;
  ctx.save();
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(100,116,139,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(\`SCORE \${game.score}\`, 12, 20);
  ctx.fillText(\`ABSORBED \${game.absorbed}\`, 12, 34);
  ctx.fillStyle = 'rgba(0,255,170,0.5)';
  ctx.textAlign = 'right';
  const stage = game.absorbed < 10 ? 'Pixel' : game.absorbed < 30 ? 'Spark' : game.absorbed < 60 ? 'Mote' : game.absorbed < 100 ? 'Wisp' : 'Ember';
  ctx.fillText(stage, game.canvas.width - 12, 20);
  ctx.restore();
});`,
  },
  {
    name: 'Grid Pulse',
    description: 'Subtle background grid that pulses with player movement. Gives depth to the void.',
    order: 25,
    taskTitle: 'Add background grid environment',
    role: 'Art/UI',
    code: `registerModule('Grid Pulse', (game) => {
  const ctx = game.ctx;
  const spacing = 60;
  const moving = game.vx !== 0 || game.vy !== 0;
  const pulse = moving ? 0.06 + Math.sin(game.tick * 0.05) * 0.02 : 0.03;
  ctx.strokeStyle = \`rgba(0,255,170,\${pulse})\`;
  ctx.lineWidth = 0.5;
  const offsetX = (-game.px * 0.1) % spacing;
  const offsetY = (-game.py * 0.1) % spacing;
  for (let x = offsetX; x < game.canvas.width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, game.canvas.height); ctx.stroke();
  }
  for (let y = offsetY; y < game.canvas.height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(game.canvas.width, y); ctx.stroke();
  }
});`,
  },
  {
    name: 'Enemy Spawner',
    description: 'Red hostile entities that chase the pixel. Death on contact. First real challenge.',
    order: 40,
    taskTitle: 'Implement enemy AI spawner',
    role: 'Gameplay',
    code: `registerModule('Enemy Spawner', (game) => {
  if (!game._enemies) game._enemies = [];
  // Spawn after absorbing 15+ particles
  if (game.absorbed >= 15 && game._enemies.length < 3 + Math.floor(game.absorbed / 20) && game.tick % 120 === 0) {
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 300;
    game._enemies.push({
      x: game.px + Math.cos(angle) * spawnDist,
      y: game.py + Math.sin(angle) * spawnDist,
      speed: 0.8 + Math.random() * 0.4,
      size: 3,
    });
  }
  const ctx = game.ctx;
  for (let i = game._enemies.length - 1; i >= 0; i--) {
    const e = game._enemies[i];
    // Chase player
    const dx = game.px - e.x, dy = game.py - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) { e.x += (dx / d) * e.speed; e.y += (dy / d) * e.speed; }
    // Collision — reset
    if (d < 8) {
      game.score = Math.max(0, game.score - 50);
      game.absorbed = Math.max(0, game.absorbed - 5);
      game._enemies = [];
      game.px = game.canvas.width / 2;
      game.py = game.canvas.height / 2;
      break;
    }
    // Draw
    ctx.fillStyle = '#ff3366';
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 6;
    ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, e.size, e.size);
    ctx.shadowBlur = 0;
  }
});`,
  },
  {
    name: 'Absorption Field',
    description: 'Hold Space to project an absorption field that pulls nearby particles toward the pixel.',
    order: 45,
    taskTitle: 'Create absorption field mechanic',
    role: 'Gameplay',
    code: `registerModule('Absorption Field', (game) => {
  const absorbing = game.keys[' '];
  if (!absorbing || !game._floaters) return;
  const ctx = game.ctx;
  const radius = 80;
  // Draw field
  ctx.beginPath();
  ctx.arc(game.px, game.py, radius, 0, Math.PI * 2);
  ctx.strokeStyle = \`rgba(0,255,170,\${0.2 + Math.sin(game.tick * 0.1) * 0.1})\`;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Pull particles
  for (const p of game._floaters) {
    const d = game.dist({ x: game.px, y: game.py }, p);
    if (d < radius && d > 5) {
      const pull = 2.0 * (1 - d / radius);
      const dx = game.px - p.x, dy = game.py - p.y;
      p.vx += (dx / d) * pull * 0.1;
      p.vy += (dy / d) * pull * 0.1;
    }
  }
});`,
  },
  {
    name: 'Screen Shake',
    description: 'Camera shake on enemy collision and evolution moments. Adds impact to events.',
    order: 50,
    taskTitle: 'Add screen shake VFX system',
    role: 'Art/UI',
    code: `registerModule('Screen Shake', (game) => {
  if (!game._shake) game._shake = { intensity: 0, decay: 0.9 };
  // Trigger shake on score loss (enemy hit) — checked via score delta
  if (!game._lastScore) game._lastScore = game.score;
  if (game.score < game._lastScore) game._shake.intensity = 8;
  game._lastScore = game.score;
  if (game._shake.intensity > 0.5) {
    const ox = (Math.random() - 0.5) * game._shake.intensity;
    const oy = (Math.random() - 0.5) * game._shake.intensity;
    game.ctx.translate(ox, oy);
    game._shake.intensity *= game._shake.decay;
  } else {
    game._shake.intensity = 0;
  }
});`,
  },
  {
    name: 'Absorption Burst VFX',
    description: 'Particle explosion when absorbing energy. Visual reward for collecting.',
    order: 38,
    taskTitle: 'Design absorption burst particle effects',
    role: 'Art/UI',
    code: `registerModule('Absorption Burst VFX', (game) => {
  if (!game._bursts) game._bursts = [];
  if (!game._lastAbsorbed) game._lastAbsorbed = game.absorbed;
  // New absorption happened
  if (game.absorbed > game._lastAbsorbed) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = game.rand(1, 3);
      game._bursts.push({
        x: game.px, y: game.py,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 20,
      });
    }
  }
  game._lastAbsorbed = game.absorbed;
  const ctx = game.ctx;
  for (let i = game._bursts.length - 1; i >= 0; i--) {
    const b = game._bursts[i];
    b.x += b.vx; b.y += b.vy;
    b.life--;
    if (b.life <= 0) { game._bursts.splice(i, 1); continue; }
    const alpha = b.life / 20;
    ctx.fillStyle = \`rgba(0,255,170,\${alpha})\`;
    ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
  }
});`,
  },
];
