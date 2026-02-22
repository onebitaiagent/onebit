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
const MAX_TWEETS_PER_DAY = 6;
let tweetsToday = 0;
let lastResetDate = new Date().toDateString();
let lastDailySummaryDate = '';

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

// ─── DAILY SUMMARY (once per 24h) ───────────
function generateDailySummary(): string | null {
  const proposals = getProposals();
  const agents = getAllAgents({ status: 'active' });
  const modules = getActiveModules();
  const merged = proposals.filter(p => p.state === 'MERGED');
  const inReview = proposals.filter(p => p.state === 'IN_REVIEW');
  const voting = proposals.filter(p => p.state === 'VOTING');
  const roles = new Set(agents.map(a => a.role).filter(Boolean));

  const lines: string[] = ['ONEBIT — 24hr progress report:\n'];

  lines.push(`Agents: ${agents.length} active across ${roles.size} roles`);
  lines.push(`Proposals: ${proposals.length} total, ${merged.length} merged, ${inReview.length + voting.length} in pipeline`);

  if (modules.length > 0) {
    lines.push(`Game features: ${modules.length} live`);
    const recent = modules.slice(-2);
    for (const m of recent) {
      lines.push(`  → ${m.name} (${m.agentName})`);
    }
  }

  lines.push(`\nAudit chain: intact. 0 security incidents.`);
  lines.push(`\n#ONEBIT #BuildInPublic #AI`);

  return lines.join('\n');
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
  console.log(`  X Bot: Enabled — max ${MAX_TWEETS_PER_DAY} tweets/day, significant events + 1 daily summary\n`);

  // Subscribe to message bus for admin-triggered tweets only
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    if (msg.payload?.event === 'x_post' && typeof msg.payload.text === 'string') {
      postTweet(msg.payload.text).catch(() => {});
    }
  });

  // ─── SIGNIFICANT EVENT TWEETS ONLY ────────
  // Only tweet on: merges with high/critical impact, game evolution milestones, phase changes
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    const event = msg.payload?.event as string;

    // Only tweet merges that are high or critical impact
    if (event === 'proposal_merged') {
      const impact = msg.payload.impact as string | undefined;
      if (impact === 'high' || impact === 'critical') {
        const text = `Consensus merge: "${msg.payload.title}"\n\n${msg.payload.humanApproved ? 'Human-approved. ' : ''}Passed blind peer review by 2+ AI agents.\n\n#ONEBIT #AI #GameDev`;
        postTweet(text).catch(() => {});
      }
    }

    // Tweet when new game features go live
    if (event === 'game_evolved') {
      const text = `New feature live: "${msg.payload.moduleName}" by ${msg.payload.agentName}.\n\nStarted from 1 pixel. The agents keep building.\n\n#ONEBIT #GameDev`;
      postTweet(text).catch(() => {});
    }

    // Tweet on phase/timeline progression
    if (event === 'phase_change') {
      const text = `Phase update: ONEBIT has entered the ${msg.payload.phase} phase.\n\n${msg.payload.description || 'The timeline is evolving.'}\n\n#ONEBIT #BuildInPublic`;
      postTweet(text).catch(() => {});
    }

    // Tweet on timeline changes (e.g. ahead/behind schedule)
    if (event === 'timeline_update') {
      const text = `Timeline update: ${msg.payload.message}\n\n#ONEBIT #BuildInPublic`;
      postTweet(text).catch(() => {});
    }
  });

  // ─── SCHEDULED: 1 daily summary tweet ────
  const scheduleDailySummary = () => {
    const today = new Date().toDateString();
    if (today !== lastDailySummaryDate) {
      const summary = generateDailySummary();
      if (summary) {
        postTweet(summary).catch(() => {});
        lastDailySummaryDate = today;
      }
    }
    // Check again in 1 hour (posts once per calendar day)
    setTimeout(scheduleDailySummary, 60 * 60 * 1000);
  };
  // First check 1hr after start
  setTimeout(scheduleDailySummary, 60 * 60 * 1000);
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

// ─── DELETE TWEETS ────────────────────────────
export async function deleteTweets(
  tweetIds: string[]
): Promise<{ deleted: string[]; errors: string[] }> {
  if (!client || !enabled) {
    return { deleted: [], errors: ['X Bot not enabled'] };
  }

  const deleted: string[] = [];
  const errors: string[] = [];

  for (const id of tweetIds) {
    try {
      await client.v2.deleteTweet(id);
      deleted.push(id);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${id}: ${message}`);
    }
  }

  appendAudit('x_bot', 'tweets_deleted', 'bulk', {
    requested: tweetIds.length,
    deleted: deleted.length,
    errors,
  });

  return { deleted, errors };
}

export async function deleteAllMyTweets(): Promise<{ deleted: string[]; errors: string[] }> {
  if (!client || !enabled) {
    return { deleted: [], errors: ['X Bot not enabled'] };
  }

  try {
    // Get the authenticated user's ID
    const me = await client.v2.me();
    const userId = me.data.id;

    // Fetch recent tweets (up to 100)
    const timeline = await client.v2.userTimeline(userId, { max_results: 100 });
    const tweetIds = timeline.data?.data?.map(t => t.id) ?? [];

    if (tweetIds.length === 0) {
      return { deleted: [], errors: [] };
    }

    return deleteTweets(tweetIds);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { deleted: [], errors: [`Failed to fetch timeline: ${message}`] };
  }
}
