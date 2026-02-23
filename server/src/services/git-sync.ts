import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { appendAudit } from './audit-log.js';

const GITHUB_OWNER = 'onebitaiagent';
const GITHUB_REPO = 'onebit';
const DATA_BRANCH = 'data-snapshots'; // Separate branch — never pollutes main
const DATA_FILES = ['agents.json', 'tasks.json', 'proposals.json', 'audit.json', 'game-modules.json', 'messages.json'];

let lastPushTime = '';

// ─── GitHub API helpers ─────────────────────

async function githubApi(
  path: string,
  method: string = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, status: 0, data: { error: 'GITHUB_TOKEN not set' } };
  }

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

async function ensureBranch(): Promise<boolean> {
  // Check if data-snapshots branch exists
  const check = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${DATA_BRANCH}`);
  if (check.ok) return true;

  // Create from main
  const mainRef = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/main`);
  if (!mainRef.ok) return false;

  const sha = (mainRef.data.object as Record<string, unknown>)?.sha as string;
  if (!sha) return false;

  const create = await githubApi(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`,
    'POST',
    { ref: `refs/heads/${DATA_BRANCH}`, sha }
  );
  return create.ok;
}

async function getFileSha(path: string): Promise<string | null> {
  const result = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${DATA_BRANCH}`);
  if (result.ok && typeof result.data.sha === 'string') {
    return result.data.sha;
  }
  return null;
}

async function pushFile(
  path: string,
  content: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const sha = await getFileSha(path);
  const encoded = Buffer.from(content).toString('base64');

  const body: Record<string, unknown> = {
    message,
    content: encoded,
    branch: DATA_BRANCH,
  };
  if (sha) body.sha = sha;

  const result = await githubApi(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    'PUT',
    body
  );

  if (!result.ok) {
    return { ok: false, error: `${result.status}: ${JSON.stringify(result.data)}` };
  }
  return { ok: true };
}

// ─── Main sync function ─────────────────────

export async function pushDataToGitHub(): Promise<{
  pushed: string[];
  errors: string[];
  skipped: string[];
}> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { pushed: [], errors: ['GITHUB_TOKEN env var not set'], skipped: [] };
  }

  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'dist', 'data');
  const pushed: string[] = [];
  const errors: string[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  // Ensure the data-snapshots branch exists
  const branchOk = await ensureBranch();
  if (!branchOk) {
    return { pushed: [], errors: ['Failed to ensure data-snapshots branch'], skipped: [] };
  }

  for (const file of DATA_FILES) {
    const localPath = join(dataDir, file);
    if (!existsSync(localPath)) {
      skipped.push(file);
      continue;
    }

    try {
      const content = readFileSync(localPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Skip empty files
      if (Array.isArray(parsed) && parsed.length === 0) {
        skipped.push(file);
        continue;
      }

      const result = await pushFile(
        `data/${file}`,
        JSON.stringify(parsed, null, 2),
        `data: sync ${file} — ${now}`
      );

      if (result.ok) {
        pushed.push(file);
      } else {
        errors.push(`${file}: ${result.error}`);
      }

      // Small delay between API calls to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${file}: ${message}`);
    }
  }

  lastPushTime = now;

  appendAudit('git_sync', 'data_pushed', 'github', {
    pushed,
    errors,
    skipped,
    timestamp: now,
  });

  return { pushed, errors, skipped };
}

// ─── Scheduled auto-push ─────────────────────

let autoSyncEnabled = false;

export function startAutoSync(): void {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('  Git Sync: Disabled (set GITHUB_TOKEN to enable)\n');
    return;
  }

  autoSyncEnabled = true;
  console.log('  Git Sync: Enabled — auto-push to GitHub every 6 hours\n');

  const runSync = async () => {
    try {
      const result = await pushDataToGitHub();
      if (result.pushed.length > 0) {
        console.log(`  Git Sync: Pushed ${result.pushed.length} files to GitHub`);
      }
    } catch (err) {
      console.error(`  Git Sync: Failed — ${err instanceof Error ? err.message : err}`);
    }
    // Next push in 6 hours
    setTimeout(runSync, 6 * 60 * 60 * 1000);
  };

  // First push 5 minutes after start (let simulation populate data)
  setTimeout(runSync, 5 * 60 * 1000);
}

export function isAutoSyncEnabled(): boolean {
  return autoSyncEnabled;
}

export function getLastPushTime(): string {
  return lastPushTime;
}
