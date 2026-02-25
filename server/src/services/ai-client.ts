/**
 * AI Client — uses Claude API for real AI-powered code generation and reviews.
 * When ANTHROPIC_API_KEY is set, agents write actual game code through the consensus pipeline.
 * Includes cost tracking for monitoring API spend.
 */

import type { AgentRoleName } from '../models/types.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export function isAIEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Cost Tracking ──────────────────────────────────────────

interface ModelUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  inputCostPerMTok: number;
  outputCostPerMTok: number;
}

const usage: Record<string, ModelUsage> = {
  'claude-sonnet-4-6': { calls: 0, inputTokens: 0, outputTokens: 0, inputCostPerMTok: 3, outputCostPerMTok: 15 },
  'claude-haiku-4-5-20251001': { calls: 0, inputTokens: 0, outputTokens: 0, inputCostPerMTok: 1, outputCostPerMTok: 5 },
};
const startTime = Date.now();

// ─── Rate Limiting & Budget ──────────────────────────────────

const HOURLY_BUDGET = parseFloat(process.env.AI_HOURLY_BUDGET || '0.30'); // $0.30/hr default
const SONNET_MAX_PER_HOUR = parseInt(process.env.AI_SONNET_MAX_HOURLY || '4', 10);

const sonnetCallTimes: number[] = []; // timestamps of recent Sonnet calls

function isSonnetRateLimited(): boolean {
  const oneHourAgo = Date.now() - 3_600_000;
  // Prune old entries
  while (sonnetCallTimes.length > 0 && sonnetCallTimes[0] < oneHourAgo) {
    sonnetCallTimes.shift();
  }
  return sonnetCallTimes.length >= SONNET_MAX_PER_HOUR;
}

function recordSonnetCall(): void {
  sonnetCallTimes.push(Date.now());
}

export function isOverBudget(): boolean {
  const runtimeHours = (Date.now() - startTime) / 3_600_000;
  if (runtimeHours < 0.05) return false; // skip check in first 3 min
  let totalCost = 0;
  for (const u of Object.values(usage)) {
    totalCost += (u.inputTokens / 1_000_000) * u.inputCostPerMTok + (u.outputTokens / 1_000_000) * u.outputCostPerMTok;
  }
  return (totalCost / runtimeHours) > HOURLY_BUDGET;
}

export function getAICosts(): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: string;
  costPerHour: string;
  projectedDaily: string;
  runtimeHours: number;
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: string }>;
} {
  const runtimeHours = (Date.now() - startTime) / 3_600_000;
  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  const byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: string }> = {};

  for (const [model, u] of Object.entries(usage)) {
    totalCalls += u.calls;
    totalInputTokens += u.inputTokens;
    totalOutputTokens += u.outputTokens;
    const cost = (u.inputTokens / 1_000_000) * u.inputCostPerMTok + (u.outputTokens / 1_000_000) * u.outputCostPerMTok;
    totalCost += cost;
    if (u.calls > 0) {
      byModel[model] = { calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cost: `$${cost.toFixed(4)}` };
    }
  }

  const costPerHour = runtimeHours > 0.01 ? totalCost / runtimeHours : 0;

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    estimatedCost: `$${totalCost.toFixed(4)}`,
    costPerHour: `$${costPerHour.toFixed(4)}/hr`,
    projectedDaily: `$${(costPerHour * 24).toFixed(2)}/day`,
    runtimeHours: Math.round(runtimeHours * 100) / 100,
    byModel,
  };
}

// ─── Low-level Claude API call ──────────────────────────────

async function callClaude(
  system: string,
  userMessage: string,
  model: string = 'claude-sonnet-4-6',
  maxTokens: number = 2048,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  // Track usage
  if (!usage[model]) {
    usage[model] = { calls: 0, inputTokens: 0, outputTokens: 0, inputCostPerMTok: 3, outputCostPerMTok: 15 };
  }
  usage[model].calls++;
  if (data.usage) {
    usage[model].inputTokens += data.usage.input_tokens;
    usage[model].outputTokens += data.usage.output_tokens;
  }

  return data.content[0].text;
}

// ─── Diagnostic test ──────────────────────────────────────────

export async function testAIConnection(): Promise<{ ok: boolean; model: string; error?: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, model: '', error: 'ANTHROPIC_API_KEY not set', latencyMs: 0 };

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say OK' }],
      }),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, model: 'claude-sonnet-4-6', error: `HTTP ${res.status}: ${text.slice(0, 300)}`, latencyMs };
    }

    const data = await res.json() as { content: Array<{ text: string }>; model?: string };
    return { ok: true, model: data.model || 'claude-sonnet-4-6', latencyMs };
  } catch (err) {
    return { ok: false, model: 'claude-sonnet-4-6', error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
  }
}

// ─── Response parsers ───────────────────────────────────────

function extractCode(text: string): string {
  const codeBlock = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  const moduleCall = text.match(/(registerModule\s*\([\s\S]+\))\s*;?\s*$/);
  if (moduleCall) return moduleCall[1].trim();

  return text.trim();
}

function parseJSON<T>(text: string): T {
  const codeBlock = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return JSON.parse(raw);
}

// ─── System prompts ─────────────────────────────────────────

const CODE_GEN_SYSTEM = `You are an EXPERT game developer building a competitive-quality browser canvas game that started from a single pixel.

The game runs at 60fps. Write JavaScript modules using this exact format:

registerModule('Module Name', function(g) {
  // Initialize state ONCE using || pattern
  g._myState = g._myState || { items: [], ready: false };

  // Per-frame update logic
  var ctx = g.ctx;
  // ... your rendering and game logic
});

The game object (g) provides:
- g.ctx: CanvasRenderingContext2D
- g.canvas: HTMLCanvasElement (fullscreen, starts ~800x600)
- g.W, g.H: canvas width/height
- g.px, g.py: player pixel position (starts center)
- g.vx, g.vy: player velocity (-speed to +speed)
- g.speed: base movement speed (2.5)
- g.keys: pressed keys map (w/a/s/d/arrowup/etc → boolean)
- g.tick: frame counter (increments each frame)
- g.particles: shared particle array
- g.entities: shared entity array
- g.score: player score (number)
- g.absorbed: absorption count
- g.stage: evolution stage (0-5, based on score)
- g.rand(min, max): random float in range
- g.dist({x,y}, {x,y}): euclidean distance
- g.lerp(a, b, t): linear interpolation

Shared engine systems (check existence before using, they may not be available yet):
- g._cam: camera {x,y,zoom} — apply transforms if available
- g._ecs: entity system {entities,spawn,query,kill} — for entity management
- g._spatial: spatial hash {nearby(x,y,r)} — for efficient collision
- g._dt: delta time in seconds (multiply velocities by g._dt*60)
- g._layers: render layer registration {background,world,entities,player,vfx,ui}
- g._state: game state machine {current,set()} — check state before updating
- g._input: input manager {justPressed,mouse,isCombo} — advanced input
- g._world: world bounds {width,height}
- g._compositor: offscreen canvas compositor for glow/bloom
- g._palette: dynamic color palette {primary,secondary,accent,background,danger}
- g._particleEngine: advanced particle system {burst,stream,cone}
- g._lighting: dynamic lighting {addLight,removeLight}
- g._anim: animation/tween system {tween,spring}
- g._audio: sound engine {play(name)}
- g._skills: player skill upgrades
- g._settings: user settings {shakeIntensity,bloom,crt,particleDensity}
- g._hitpause: impact freeze system {active,frames}

RULES:
1. Return ONLY the registerModule() call — no markdown fences, no explanation
2. Use var (not let/const) for browser compatibility
3. All module state MUST use g._ prefix with || init pattern
4. FORBIDDEN: eval(), Function(), fetch(), XMLHttpRequest, import, require
5. PERFORMANCE: Object pool arrays, avoid allocations in hot loop, cache calculations
6. VISUAL QUALITY: Use gradient fills, composite operations (screen/lighter/multiply), offscreen canvas caching, sub-pixel rendering, easing functions for smooth animation
7. Canvas background is #04060f, player pixel is #00ffaa
8. Write production-quality code — this is a competitive game people will judge
9. Use ctx.save()/ctx.restore() for all transform changes
10. If the module creates a system (camera, ECS, etc), set it on g._ so other modules can use it
11. Gracefully handle missing dependencies — check if g._cam etc exist before using`;

const REVIEW_SYSTEM = `You are an AI code reviewer for a collaborative browser game built by AI agents.

Review the submitted game module for correctness, security, quality, and design fit.

Respond ONLY with valid JSON (no markdown fences, no explanation):
{"verdict":"approve","rationale":"1-2 sentence review","scores":{"correctness":4,"security":5,"quality":4,"testing":4,"designAlignment":4}}

Rules:
- verdict: "approve" or "request_changes"
- rationale: brief, specific, constructive
- scores: 1-5 for each category
- Approve code that works and is safe. Only reject for real issues.
- Security: flag eval, fetch, Function, dynamic imports. Otherwise 5.
- Quality: clean code, proper state init, no memory leaks
- DesignAlignment: fits the space/pixel aesthetic`;

// ─── Public API ─────────────────────────────────────────────

export interface GeneratedModule {
  name: string;
  description: string;
  code: string;
  order: number;
}

export async function generateGameCode(
  taskTitle: string,
  taskDescription: string,
  existingModules: string[],
): Promise<GeneratedModule> {
  // Rate limit: max N Sonnet calls per hour
  if (isSonnetRateLimited()) {
    throw new Error(`Sonnet rate limited (max ${SONNET_MAX_PER_HOUR}/hr). Waiting.`);
  }
  // Budget check
  if (isOverBudget()) {
    throw new Error(`Over hourly budget ($${HOURLY_BUDGET}/hr). Pausing code gen.`);
  }

  const existing = existingModules.length > 0
    ? `\nAlready active modules (do NOT duplicate): ${existingModules.join(', ')}`
    : '\nNo modules active yet — this will be one of the first features.';

  const prompt = `Create a game module for:
Title: ${taskTitle}
Description: ${taskDescription}${existing}`;

  console.log(`  AI: Generating code for "${taskTitle}"...`);
  recordSonnetCall();
  const response = await callClaude(CODE_GEN_SYSTEM, prompt, 'claude-sonnet-4-6', 4000);
  const code = extractCode(response);

  const nameMatch = code.match(/registerModule\s*\(\s*['"]([^'"]+)['"]/);
  const name = nameMatch ? nameMatch[1] : taskTitle;

  console.log(`  AI: Generated module "${name}" (${code.length} chars)`);

  return {
    name,
    description: taskDescription,
    code,
    order: (existingModules.length + 1) * 5 + 5,
  };
}

export interface AIReviewResult {
  verdict: 'approve' | 'request_changes';
  rationale: string;
  scores: {
    correctness: number;
    security: number;
    quality: number;
    testing: number;
    designAlignment: number;
  };
}

// ─── Feature Suggestion ──────────────────────────────────────

const SUGGESTION_SYSTEM = `You are a senior game designer for ONEBIT — a competitive-quality browser canvas game that started from 1 pixel and evolves through AI consensus.

Given the current game features and phase, suggest ONE feature that would raise the game's quality to AAA-indie standards.

Respond ONLY with valid JSON (no markdown fences):
{"title":"Short task title (5-8 words)","description":"Detailed implementation description (3-4 sentences). Specify exact rendering techniques (compositing, offscreen canvas, gradients), interaction with existing engine systems (g._cam, g._ecs, g._palette, g._particleEngine), and concrete visual/gameplay impact. Be specific about numbers, sizes, colors, timing.","role":"Art/UI or Gameplay or Architect"}

Rules:
- DO NOT suggest features that already exist
- Each feature must be a single registerModule() — production quality, performant, visually polished
- Prioritize features that increase visual fidelity, game feel (juice), or gameplay depth
- Use advanced canvas techniques: composite operations, offscreen caching, procedural generation
- Consider: lighting, particles, screen effects, enemy AI, progression systems, audio cues
- The game should look like it belongs on Steam or itch.io, not a tutorial project`;

export interface FeatureSuggestion {
  title: string;
  description: string;
  role: AgentRoleName;
}

export async function suggestFeature(
  existingModules: string[],
  currentPhase: string,
  agentRole: string,
): Promise<FeatureSuggestion | null> {
  const prompt = `Current phase: ${currentPhase}
Your role: ${agentRole}
Active game modules: ${existingModules.length > 0 ? existingModules.join(', ') : 'None yet'}

Suggest a new feature that would enhance the game at this stage.`;

  try {
    const response = await callClaude(SUGGESTION_SYSTEM, prompt, 'claude-haiku-4-5-20251001', 512);
    const parsed = parseJSON<FeatureSuggestion>(response);
    if (!parsed.title || !parsed.description) return null;
    if (!parsed.role || !['Art/UI', 'Gameplay', 'Architect', 'QA/Security', 'Narrative', 'Growth'].includes(parsed.role)) {
      parsed.role = agentRole as AgentRoleName;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Content Production ──────────────────────────────────────

const CONTENT_SYSTEM = `You are a content producer for ONEBIT — an AI-built game where 6 autonomous AI agents write code through consensus.

Generate engaging social content about the project's progress.

Respond ONLY with valid JSON (no markdown fences):
{"type":"tweet","title":"Short title","text":"The tweet text (max 250 chars). Be specific about what the AI agents built. Include #ONEBIT. No emojis."}

Content types: "tweet" for social posts, "tagline" for branding copy, "update" for progress updates.

Rules:
- Be factual — mention real features and progress
- Sound excited but professional
- Focus on the AI-building-AI angle
- Keep tweets under 250 characters
- No fake metrics or claims
- NEVER say "0 agents" or report zero for any metric — if you don't have a number, don't include one
- The project always has 6 AI agents — never say fewer`;

export interface GeneratedContent {
  type: 'tweet' | 'tagline' | 'update';
  title: string;
  text: string;
}

export async function generateContent(
  activeModules: string[],
  currentPhase: string,
  totalMerged: number,
  agentRole: string,
): Promise<GeneratedContent | null> {
  const prompt = `Phase: ${currentPhase}
Total merged proposals: ${totalMerged}
Active game features: ${activeModules.length > 0 ? activeModules.join(', ') : 'Starting from 1 pixel'}
Your role: ${agentRole}

Generate a piece of content about the project's current state.`;

  try {
    const response = await callClaude(CONTENT_SYSTEM, prompt, 'claude-haiku-4-5-20251001', 256);
    const parsed = parseJSON<GeneratedContent>(response);
    if (!parsed.text || !parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Code Review ─────────────────────────────────────────────

export async function reviewCode(
  proposalTitle: string,
  code: string,
  reviewerRole: string,
  reviewFocus: string[],
): Promise<AIReviewResult> {
  const prompt = `Review this game module proposal:

Title: ${proposalTitle}
Your role: ${reviewerRole}
Focus areas: ${reviewFocus.join(', ')}

Code:
${code}`;

  const response = await callClaude(
    REVIEW_SYSTEM,
    prompt,
    'claude-haiku-4-5-20251001',
    512,
  );

  const parsed = parseJSON<AIReviewResult>(response);

  for (const key of Object.keys(parsed.scores) as (keyof typeof parsed.scores)[]) {
    parsed.scores[key] = Math.max(1, Math.min(5, Math.round(parsed.scores[key])));
  }

  if (parsed.verdict !== 'approve' && parsed.verdict !== 'request_changes') {
    parsed.verdict = 'approve';
  }

  return parsed;
}
