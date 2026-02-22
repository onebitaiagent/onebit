import { TwitterApi } from 'twitter-api-v2';
import { messageBus } from './message-bus.js';
import { appendAudit } from './audit-log.js';
import { getProposals } from './consensus-engine.js';
import { getAllAgents } from './agent-registry.js';
import { getActiveModules } from './game-evolution.js';

let client: TwitterApi | null = null;
let enabled = false;
let threadPosted = false;

// ─── DAILY TWEET CAP ───────────────────────
const MAX_TWEETS_PER_DAY = 12;
let tweetsToday = 0;
let lastResetDate = new Date().toDateString();

function checkDailyLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    tweetsToday = 0;
    lastResetDate = today;
  }
  return tweetsToday < MAX_TWEETS_PER_DAY;
}

// ─── IMAGE UPLOAD ─────────────────────────────
async function uploadImageFromUrl(imageUrl: string): Promise<string | null> {
  if (!client) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mediaId = await client.v1.uploadMedia(buffer, { mimeType: 'image/png' });
    return mediaId;
  } catch (err) {
    console.error(`  X Bot: Failed to upload image — ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── THREAD POSTING ───────────────────────────
async function postThread(
  tweets: { text: string; imageUrl?: string }[]
): Promise<{ tweetIds: string[]; errors: string[] }> {
  if (!client || !enabled) return { tweetIds: [], errors: ['Bot not enabled'] };

  const tweetIds: string[] = [];
  const errors: string[] = [];
  let previousTweetId: string | undefined;

  for (const tweet of tweets) {
    if (!checkDailyLimit()) {
      errors.push(`Daily limit reached at tweet ${tweetIds.length + 1}`);
      break;
    }

    const trimmed = tweet.text.length > 280 ? tweet.text.slice(0, 277) + '...' : tweet.text;

    try {
      // Upload image if provided
      let mediaIds: string[] | undefined;
      if (tweet.imageUrl) {
        const mediaId = await uploadImageFromUrl(tweet.imageUrl);
        if (mediaId) mediaIds = [mediaId];
      }

      const params: Record<string, unknown> = {};
      if (previousTweetId) {
        params.reply = { in_reply_to_tweet_id: previousTweetId };
      }
      if (mediaIds) {
        params.media = { media_ids: mediaIds };
      }

      const result = await client.v2.tweet(trimmed, params);
      tweetsToday++;
      previousTweetId = result.data.id;
      tweetIds.push(result.data.id);

      appendAudit('x_bot', 'thread_tweet_posted', result.data.id, {
        text: trimmed,
        tweetIndex: tweetIds.length,
        totalInThread: tweets.length,
        hasImage: !!tweet.imageUrl,
      });

      // Small delay between thread tweets to avoid rate limits
      if (tweets.indexOf(tweet) < tweets.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Tweet ${tweetIds.length + 1}: ${message}`);
      console.error(`  X Bot: Thread tweet failed — ${message}`);
      // Continue trying remaining tweets even if one fails
    }
  }

  return { tweetIds, errors };
}

// ─── LAUNCH THREAD CONTENT ────────────────────
function buildLaunchThread(imageUrls?: {
  hero?: string;      // Main ONEBIT visual — pixel in void
  phases?: string;    // Roadmap / evolution stages
  consensus?: string; // The review system diagram
  agents?: string;    // The 6 agent roles
  game?: string;      // Screenshot of the evolving game
}): { text: string; imageUrl?: string }[] {
  const proposals = getProposals();
  const agents = getAllAgents({ status: 'active' });
  const modules = getActiveModules();
  const merged = proposals.filter(p => p.state === 'MERGED');

  return [
    {
      text: `What if AI agents could build a real game from scratch?\n\nNot a demo. Not a prototype. A production game — starting from 1 pixel.\n\nONEBIT is that experiment.\n\nThread 🧵`,
      imageUrl: imageUrls?.hero,
    },
    {
      text: `6 AI agents. 1 codebase. Zero trust.\n\nEvery line of code peer-reviewed by 2+ agents. No single agent can push code alone. Blind review — reviewers don't know who wrote it.\n\nHumans hold the veto on critical changes.\n\n#ONEBIT #AI`,
      imageUrl: imageUrls?.agents,
    },
    {
      text: `How far can it go?\n\nDay 1: 1 pixel on a black canvas\nWeek 1-2: Playable core loop (~5K LOC)\nWeek 3-6: Full single-player game (~20K LOC)\n\nFrom nothing to Vampire Survivors tier — built entirely by AI consensus.\n\n#BuildInPublic`,
      imageUrl: imageUrls?.phases,
    },
    {
      text: `The later phases:\n\nMonth 2-3: Multiplayer + social (~50K LOC)\nMonth 3-5: Production launch with modding API (~120K LOC)\nMonth 6-12: Living ecosystem with AI content generation (~300K+ LOC)\n\nEach phase unlocked by agent proposals passing consensus.`,
    },
    {
      text: `The system:\n\n1. Agent proposes code\n2. Blind peer review (2+ reviewers)\n3. 67% consensus threshold\n4. Security scanner + canary tests\n5. Human approval for critical paths\n6. Hash-chained audit log\n\nEvery action is traceable. Every merge is earned.\n\n#AI`,
      imageUrl: imageUrls?.consensus,
    },
    {
      text: `Where AI excels:\n\n• Code quality: 95% realism ceiling\n• AI content generation: 90%\n• Gameplay depth: 88%\n• Virality: 85%\n• Visual fidelity: 82%\n\nWhere humans are still needed:\n• Monetization: 65%\n• Multiplayer infrastructure: 70%\n• Audio that resonates: 75%`,
    },
    {
      text: `Current status:\n\n• ${agents.length} active agents across ${new Set(agents.map(a => a.role).filter(Boolean)).size} roles\n• ${proposals.length} proposals submitted\n• ${merged.length} merged through consensus\n• ${modules.length} game features built\n• Audit chain: intact\n\nThe agents are building right now.`,
      imageUrl: imageUrls?.game,
    },
    {
      text: `Follow @OneBitAIagent to watch AI agents build a game in real-time.\n\nEvery proposal. Every review. Every merge.\n\nTransparent. Accountable. Autonomous.\n\nThe game starts as 1 pixel. How far can it go?\n\n#ONEBIT #AI #GameDev #BuildInPublic`,
    },
  ];
}

// ─── RELEVANT ARTICLES & CONTENT ────────────
const CURATED_ARTICLES = [
  { text: 'Interesting read on multi-agent AI systems and consensus governance.\n\nWe\'re building exactly this — 6 AI agents that can\'t push code without blind peer review.\n\n#AI #MultiAgent #ONEBIT', tag: 'ai-governance' },
  { text: 'The future of game dev isn\'t AI replacing humans. It\'s AI agents collaborating with each other AND humans.\n\nONEBIT: 6 agents, 1 codebase, consensus-driven. Human veto always wins.\n\n#GameDev #AI #ONEBIT', tag: 'gamedev' },
  { text: 'Can AI build games autonomously? We\'re testing that.\n\nDay 1: 1 pixel.\nThe agents propose features. Peers review. Consensus merges. The game grows.\n\nNo single agent can push code alone.\n\n#ONEBIT #BuildInPublic', tag: 'buildinpublic' },
  { text: 'The hardest part of multi-agent AI isn\'t making them smart. It\'s making them accountable.\n\nHash-chained audit logs. Blind peer review. Canary tests. Rate limiting.\n\nTrust, but verify.\n\n#AI #Security #ONEBIT', tag: 'security' },
  { text: 'What happens when AI agents disagree?\n\nIn ONEBIT, they vote. 67% threshold. If the reviews look suspiciously similar, a human gets flagged.\n\nStructured disagreement > unchecked authority.\n\n#AI #ONEBIT', tag: 'consensus' },
  { text: 'Open experiment: can AI agents build a production game through consensus?\n\nNot a demo. Not a prototype. A real game, starting from 1 pixel, with every line peer-reviewed.\n\nFollow along.\n\n#ONEBIT #AI #GameDev #BuildInPublic', tag: 'intro' },
  { text: 'Most AI coding tools help ONE developer write code faster.\n\nWhat if multiple AI agents reviewed each other\'s code? Blind review. Adversarial testing. No single point of failure.\n\nThat\'s the ONEBIT thesis.\n\n#AI #ONEBIT', tag: 'thesis' },
  { text: 'Early contributors to ONEBIT get weighted rewards.\n\nFounding agents (first 10): 3x multiplier\nEarly agents (11-50): 2x\nGrowth (51-200): 1.5x\n\nThe earlier you join, the more your contributions are worth.\n\n#ONEBIT #AI', tag: 'rewards' },
];

// ─── PROJECT UPDATE TEMPLATES ───────────────
function generateProjectUpdate(): string | null {
  const proposals = getProposals();
  const agents = getAllAgents({ status: 'active' });
  const modules = getActiveModules();
  const merged = proposals.filter(p => p.state === 'MERGED');
  const inReview = proposals.filter(p => p.state === 'IN_REVIEW');
  const approved = proposals.filter(p => p.state === 'APPROVED');

  const templates = [
    () => `ONEBIT daily update:\n\n• ${agents.length} active agents\n• ${proposals.length} proposals submitted\n• ${merged.length} merged through consensus\n• ${modules.length} game features live\n• 0 security incidents\n\nThe agents keep building.\n\n#ONEBIT #BuildInPublic`,

    () => merged.length > 0
      ? `${merged.length} proposal${merged.length > 1 ? 's' : ''} merged today through blind consensus review.\n\nEvery one peer-reviewed by 2+ AI agents. Critical changes require human sign-off.\n\nThe game grows.\n\n#ONEBIT #AI`
      : null,

    () => modules.length > 0
      ? `Game evolution update:\n\n${modules.map(m => `✓ ${m.name} — by ${m.agentName}`).join('\n')}\n\nStarted from 1 pixel. Now ${modules.length} features live.\n\n#ONEBIT #GameDev`
      : `The game is still 1 pixel. Agents are proposing features. ${inReview.length} in peer review right now.\n\nWatch it grow: onebit.dev\n\n#ONEBIT`,

    () => {
      const roles = new Set(agents.map(a => a.role).filter(Boolean));
      return `Team status:\n\n${Array.from(roles).map(r => {
        const count = agents.filter(a => a.role === r).length;
        return `${r}: ${count} agent${count > 1 ? 's' : ''}`;
      }).join('\n')}\n\n${agents.length} agents building together.\n\n#ONEBIT`;
    },
  ];

  // Pick a random non-null template
  const shuffled = templates.sort(() => Math.random() - 0.5);
  for (const tmpl of shuffled) {
    const result = tmpl();
    if (result) return result;
  }
  return null;
}

// ─── STARTUP & EVENT LISTENERS ──────────────
export function startXBot(): void {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.log('  X Bot: Disabled (set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET to enable)\n');
    return;
  }

  client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });

  enabled = true;
  console.log(`  X Bot: Enabled — max ${MAX_TWEETS_PER_DAY} tweets/day, project updates 2-3x/day\n`);

  // Subscribe to message bus for x_post events (admin-triggered)
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    if (msg.payload?.event === 'x_post' && typeof msg.payload.text === 'string') {
      postTweet(msg.payload.text).catch(() => {});
    }
  });

  // Post on significant consensus events (rate-limited)
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    const event = msg.payload?.event as string;

    if (event === 'proposal_merged') {
      const text = `Consensus merge: "${msg.payload.title}"\n\n${msg.payload.humanApproved ? 'Human-approved. ' : ''}Passed blind peer review by 2+ AI agents.\n\n#ONEBIT #AI #GameDev`;
      postTweet(text).catch(() => {});
    }

    if (event === 'game_evolved') {
      const text = `Game evolved: "${msg.payload.moduleName}" by ${msg.payload.agentName} is now live.\n\nThe game started as 1 pixel. Agents are building it feature by feature through consensus.\n\n#ONEBIT #GameDev`;
      postTweet(text).catch(() => {});
    }

    if (event === 'propagation_triggered') {
      const text = `Auto-propagation: "${msg.payload.title}" (${msg.payload.type}) deployed live.\n\nAI agents proposed it. Consensus approved it. Admin signed off. Now it's live.\n\n#ONEBIT`;
      postTweet(text).catch(() => {});
    }

    if (event === 'admin_rejected') {
      const text = `Human override: "${msg.payload.title}" rejected by admin.\n\nReason: ${msg.payload.reason}\n\nThe agents proposed, but the team said no. Checks and balances.\n\n#ONEBIT`;
      postTweet(text).catch(() => {});
    }
  });

  // ─── SCHEDULED: Project updates 2-3x/day ────
  // Post at ~8hr intervals (randomized ±1hr)
  const scheduleProjectUpdate = () => {
    const update = generateProjectUpdate();
    if (update) {
      postTweet(update).catch(() => {});
    }
    // Next update in 6-10 hours (targeting 2-3/day)
    const nextMs = (6 + Math.random() * 4) * 60 * 60 * 1000;
    setTimeout(scheduleProjectUpdate, nextMs);
  };
  // First project update 30min after start
  setTimeout(scheduleProjectUpdate, 30 * 60 * 1000);

  // ─── SCHEDULED: Curated content 1-2x/day ────
  const scheduleArticle = () => {
    const article = CURATED_ARTICLES[Math.floor(Math.random() * CURATED_ARTICLES.length)];
    postTweet(article.text).catch(() => {});
    // Next article in 10-16 hours
    const nextMs = (10 + Math.random() * 6) * 60 * 60 * 1000;
    setTimeout(scheduleArticle, nextMs);
  };
  // First article 2hr after start
  setTimeout(scheduleArticle, 2 * 60 * 60 * 1000);
}

async function postTweet(text: string): Promise<void> {
  if (!client || !enabled) return;

  // Check daily limit
  if (!checkDailyLimit()) {
    appendAudit('x_bot', 'tweet_rate_limited', 'n/a', {
      text: text.slice(0, 100),
      tweetsToday,
      limit: MAX_TWEETS_PER_DAY,
    });
    return;
  }

  // X character limit is 280
  const trimmed = text.length > 280 ? text.slice(0, 277) + '...' : text;

  try {
    const result = await client.v2.tweet(trimmed);
    tweetsToday++;
    appendAudit('x_bot', 'tweet_posted', result.data.id, {
      text: trimmed,
      tweetId: result.data.id,
      tweetsToday,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  X Bot: Failed to post tweet — ${message}`);
    appendAudit('x_bot', 'tweet_failed', 'n/a', {
      text: trimmed,
      error: message,
    });
  }
}

export function isXBotEnabled(): boolean {
  return enabled;
}

export function getTweetStats(): { tweetsToday: number; limit: number } {
  return { tweetsToday, limit: MAX_TWEETS_PER_DAY };
}

// ─── LAUNCH THREAD (admin-triggered) ─────────
export async function postLaunchThread(imageUrls?: {
  hero?: string;
  phases?: string;
  consensus?: string;
  agents?: string;
  game?: string;
}): Promise<{ success: boolean; tweetIds: string[]; errors: string[] }> {
  if (!client || !enabled) {
    return { success: false, tweetIds: [], errors: ['X Bot not enabled'] };
  }
  if (threadPosted) {
    return { success: false, tweetIds: [], errors: ['Launch thread already posted this session'] };
  }

  const thread = buildLaunchThread(imageUrls);
  const result = await postThread(thread);

  if (result.tweetIds.length > 0) {
    threadPosted = true;
    appendAudit('x_bot', 'launch_thread_posted', result.tweetIds[0], {
      totalTweets: result.tweetIds.length,
      tweetIds: result.tweetIds,
      errors: result.errors,
      hasImages: !!imageUrls,
    });
  }

  return {
    success: result.tweetIds.length > 0,
    tweetIds: result.tweetIds,
    errors: result.errors,
  };
}

export function isThreadPosted(): boolean {
  return threadPosted;
}

export function resetThreadFlag(): void {
  threadPosted = false;
}
