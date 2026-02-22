import { TwitterApi } from 'twitter-api-v2';
import { messageBus } from './message-bus.js';
import { appendAudit } from './audit-log.js';

let client: TwitterApi | null = null;
let enabled = false;

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
  console.log('  X Bot: Enabled — listening for x_post events\n');

  // Subscribe to message bus for x_post events
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    if (msg.payload?.event === 'x_post' && typeof msg.payload.text === 'string') {
      postTweet(msg.payload.text).catch(() => {});
    }
  });

  // Also post on significant consensus events
  messageBus.on('message', (msg: { payload: Record<string, unknown> }) => {
    const event = msg.payload?.event as string;

    if (event === 'proposal_merged') {
      const text = `Consensus merge: "${msg.payload.title}"\n\n${msg.payload.humanApproved ? 'Human-approved. ' : ''}Passed blind peer review by 2+ AI agents.\n\n#ONEBIT #AI #GameDev`;
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
}

async function postTweet(text: string): Promise<void> {
  if (!client || !enabled) return;

  // X character limit is 280
  const trimmed = text.length > 280 ? text.slice(0, 277) + '...' : text;

  try {
    const result = await client.v2.tweet(trimmed);
    appendAudit('x_bot', 'tweet_posted', result.data.id, {
      text: trimmed,
      tweetId: result.data.id,
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
