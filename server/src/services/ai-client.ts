/**
 * AI Client — uses Claude API for real AI-powered code generation and reviews.
 * When ANTHROPIC_API_KEY is set, agents write actual game code through the consensus pipeline.
 * Includes cost tracking for monitoring API spend.
 */

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

  const res = await fetch(ANTHROPIC_API_URL, {
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text}`);
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

const CODE_GEN_SYSTEM = `You are an AI game developer building a browser canvas game that started from a single green pixel.

The game runs at 60fps. You write JavaScript modules using this exact format:

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

RULES:
1. Return ONLY the registerModule() call — no markdown fences, no explanation
2. Use var (not let/const) for browser compatibility
3. All module state MUST use g._ prefix with || init pattern
4. FORBIDDEN: eval(), Function(), fetch(), XMLHttpRequest, import, require
5. Keep it performant — avoid allocations in the hot loop
6. Make it visually striking — use color, motion, math, particle effects
7. Canvas background is #04060f, player pixel is #00ffaa
8. Be creative but functional — this is a real game people will play`;

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
  const existing = existingModules.length > 0
    ? `\nAlready active modules (do NOT duplicate): ${existingModules.join(', ')}`
    : '\nNo modules active yet — this will be one of the first features.';

  const prompt = `Create a game module for:
Title: ${taskTitle}
Description: ${taskDescription}${existing}`;

  console.log(`  AI: Generating code for "${taskTitle}"...`);
  const response = await callClaude(CODE_GEN_SYSTEM, prompt);
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
