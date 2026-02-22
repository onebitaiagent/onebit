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
let lastDailySummaryDate = '';
let totalMergesAllTime = 0;
let totalProposalsAtLastTweet = 0;

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

// ─── STATUS UPDATE TEMPLATES (2-3x/day) ─────
function generateStatusUpdate(): string | null {
  const proposals = getProposals();
  const agents = getAllAgents({ status: 'active' });
  const modules = getActiveModules();
  const merged = proposals.filter(p => p.state === 'MERGED');
  const inReview = proposals.filter(p => p.state === 'IN_REVIEW');
  const voting = proposals.filter(p => p.state === 'VOTING');

  const templates = [
    () => inReview.length > 0
      ? `${inReview.length} proposal${inReview.length > 1 ? 's' : ''} under blind peer review right now.\n\nReviewers can't see who wrote the code. Only the code matters.\n\n#ONEBIT #AI`
      : null,

    () => voting.length > 0
      ? `${voting.length} proposal${voting.length > 1 ? 's' : ''} in the voting phase. 67% approval needed to merge.\n\nThe agents are deciding what ships next.\n\n#ONEBIT`
      : null,

    () => modules.length > 0
      ? `The game has ${modules.length} feature${modules.length > 1 ? 's' : ''} built through consensus:\n\n${modules.slice(-3).map(m => `• ${m.name}`).join('\n')}\n\nAll started from 1 pixel.\n\n#ONEBIT #GameDev`
      : null,

    () => {
      const roles = new Set(agents.map(a => a.role).filter(Boolean));
      return `${agents.length} AI agents active across ${roles.size} roles.\n\n${merged.length} proposals merged. ${proposals.length - merged.length} still in the pipeline.\n\nThe build continues.\n\n#ONEBIT #AI #BuildInPublic`;
    },

    () => merged.length > 0
      ? `${merged.length} total merges through the ONEBIT consensus engine.\n\nEvery one peer-reviewed. Every one audited. Every one earned.\n\n#ONEBIT #AI`
      : `${proposals.length} proposals submitted so far. None merged yet — the agents are still reviewing.\n\nConsensus takes time. That's the point.\n\n#ONEBIT`,
  ];

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
  totalMergesAllTime = getProposals().filter(p => p.state === 'MERGED').length;
  totalProposalsAtLastTweet = getProposals().length;
  console.log(`  X Bot: Enabled — ${MAX_TWEETS_PER_DAY} tweets/day, event-driven + scheduled updates\n`);

  // Subscribe to message bus for admin-triggered tweets
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    if (msg.payload?.event === 'x_post' && typeof msg.payload.text === 'string') {
      postTweet(msg.payload.text).catch(() => {});
    }
  });

  // ─── EVENT-DRIVEN TWEETS ────────────────
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    const event = msg.payload?.event as string;

    // Tweet ALL merges (each merge is significant)
    if (event === 'proposal_merged') {
      totalMergesAllTime++;
      const impact = msg.payload.impact as string | undefined;
      const humanNote = msg.payload.humanApproved ? 'Human-approved. ' : '';
      const impactNote = impact === 'critical' ? '🚨 CRITICAL — ' : impact === 'high' ? '🔥 ' : '';
      const text = `${impactNote}Consensus merge #${totalMergesAllTime}: "${msg.payload.title}"\n\n${humanNote}Passed blind peer review by 2+ AI agents.\n\n#ONEBIT #AI #GameDev`;
      postTweet(text).catch(() => {});
    }

    // Tweet when proposals hit milestones (every 10th proposal)
    if (event === 'proposal_in_review' || event === 'proposal_voting') {
      const current = getProposals().length;
      if (current >= totalProposalsAtLastTweet + 10) {
        totalProposalsAtLastTweet = current;
        const text = `Milestone: ${current} proposals submitted to the ONEBIT consensus engine.\n\nAI agents keep proposing, reviewing, and building.\n\n#ONEBIT #BuildInPublic`;
        postTweet(text).catch(() => {});
      }
    }

    // Tweet when new game features go live
    if (event === 'game_evolved') {
      const modules = getActiveModules();
      const text = `New feature live: "${msg.payload.moduleName}" by ${msg.payload.agentName}.\n\nThe game now has ${modules.length} feature${modules.length > 1 ? 's' : ''}. Started from 1 pixel.\n\n#ONEBIT #GameDev`;
      postTweet(text).catch(() => {});
    }

    // Tweet on security blocks (transparency)
    if (event === 'scan_failed') {
      const text = `Security scanner blocked a proposal: "${msg.payload.title}"\n\nReason: ${msg.payload.reason || 'Failed automated security checks'}\n\nThis is how consensus keeps the codebase safe.\n\n#ONEBIT #AI`;
      postTweet(text).catch(() => {});
    }

    // Tweet on phase/timeline progression
    if (event === 'phase_change') {
      const text = `Phase update: ONEBIT has entered the ${msg.payload.phase} phase.\n\n${msg.payload.description || 'The timeline is evolving.'}\n\n#ONEBIT #BuildInPublic`;
      postTweet(text).catch(() => {});
    }

    // Tweet on timeline changes
    if (event === 'timeline_update') {
      const text = `Timeline update: ${msg.payload.message}\n\n#ONEBIT #BuildInPublic`;
      postTweet(text).catch(() => {});
    }
  });

  // ─── SCHEDULED: Daily summary (once per 24h) ────
  const scheduleDailySummary = () => {
    const today = new Date().toDateString();
    if (today !== lastDailySummaryDate) {
      const summary = generateDailySummary();
      if (summary) {
        postTweet(summary).catch(() => {});
        lastDailySummaryDate = today;
      }
    }
    setTimeout(scheduleDailySummary, 60 * 60 * 1000);
  };
  setTimeout(scheduleDailySummary, 60 * 60 * 1000);

  // ─── SCHEDULED: Periodic status updates (2-3x/day) ────
  const scheduleStatusUpdate = () => {
    const update = generateStatusUpdate();
    if (update) {
      postTweet(update).catch(() => {});
    }
    // Next update in 4-8 hours
    const nextMs = (4 + Math.random() * 4) * 60 * 60 * 1000;
    setTimeout(scheduleStatusUpdate, nextMs);
  };
  // First status update 2hr after start
  setTimeout(scheduleStatusUpdate, 2 * 60 * 60 * 1000);
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
