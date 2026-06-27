// Free-tier AI-summary quota (README §7 gating/trust model).
//
// Gate logic:
//   - If `isActive(address)` on-chain → UNLIMITED (the on-chain subscription is
//     the premium pass; the server read-gate honors it).
//   - Otherwise free addresses get SUMMARY_FREE_DAILY_LIMIT summaries/day (UTC).
//   - Re-viewing an article the address already summarized is FREE (we count
//     distinct article views per address per day, not repeat reads) — same
//     pattern Celiq uses for news_summary_views.
//   - Over quota → caller raises HTTP 402 `{ code: "summary_quota_exceeded" }`.
//
// Storage: Supabase table `summary_views`; in-memory map fallback when Supabase
// is absent (single-instance, resets on restart).

import { env } from "../config/env";
import { supabase } from "../lib/supabase";
import { isActive } from "./chain";
import { isChainConfigured } from "./chain";

const VIEWS_TABLE = "summary_views";

// In-memory fallback: key = `${addressLower}:${utcDay}`, value = set of articleIds.
const memoryViews = new Map<string, Set<string>>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function memKey(addressLower: string, day: string): string {
  return `${addressLower}:${day}`;
}

export interface QuotaCheck {
  allowed: boolean;
  unlimited: boolean; // true when the on-chain subscription grants unlimited
  used: number; // distinct articles summarized today (free tier only)
  limit: number;
  alreadyViewed: boolean; // re-viewing an already-counted article (free, no charge)
}

// Check whether `address` may summarize `articleId` right now, WITHOUT recording
// a new view. Call `recordView` after a successful summary to consume quota.
export async function checkQuota(
  address: string,
  articleId: string
): Promise<QuotaCheck> {
  const limit = env.SUMMARY_FREE_DAILY_LIMIT;

  // Premium short-circuit: on-chain active → unlimited. If the chain isn't
  // configured we can't grant premium, so we fall through to the free quota.
  if (isChainConfigured()) {
    try {
      if (await isActive(address)) {
        return { allowed: true, unlimited: true, used: 0, limit, alreadyViewed: false };
      }
    } catch (err) {
      // Chain read failed (RPC hiccup). Don't hand out premium on error — fall
      // through to the free quota so the gate fails closed, not open.
      console.warn(
        `[QUOTA] isActive check failed, treating as free: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  const addressLower = address.toLowerCase();
  const day = utcDay();
  const viewed = await viewedArticleIds(addressLower, day);

  const alreadyViewed = viewed.has(articleId);
  const used = viewed.size;
  // Re-viewing a counted article is always allowed (free). A new article is
  // allowed only while under the daily cap.
  const allowed = alreadyViewed || used < limit;

  return { allowed, unlimited: false, used, limit, alreadyViewed };
}

// Record that `address` summarized `articleId` today (idempotent per day/article).
// No-op for already-counted articles. Premium callers should skip this (their
// usage is unlimited and untracked).
export async function recordView(address: string, articleId: string): Promise<void> {
  const addressLower = address.toLowerCase();
  const day = utcDay();
  const db = supabase();

  if (db) {
    const { error } = await db.from(VIEWS_TABLE).upsert(
      { address: addressLower, article_id: articleId, view_day: day },
      { onConflict: "address,article_id,view_day" }
    );
    if (error) {
      console.warn(`[QUOTA] view record failed, using memory: ${error.message}`);
      recordMemory(addressLower, day, articleId);
    }
    return;
  }
  recordMemory(addressLower, day, articleId);
}

async function viewedArticleIds(addressLower: string, day: string): Promise<Set<string>> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from(VIEWS_TABLE)
      .select("article_id")
      .eq("address", addressLower)
      .eq("view_day", day);
    if (!error && data) {
      return new Set(data.map((r) => r.article_id as string));
    }
    if (error) {
      console.warn(`[QUOTA] view read failed, using memory: ${error.message}`);
    }
  }
  return new Set(memoryViews.get(memKey(addressLower, day)) ?? []);
}

function recordMemory(addressLower: string, day: string, articleId: string): void {
  const key = memKey(addressLower, day);
  const set = memoryViews.get(key) ?? new Set<string>();
  set.add(articleId);
  memoryViews.set(key, set);
  // Drop stale days so the in-memory fallback map can't grow without bound — only
  // today's keys matter for the daily quota (audit L6).
  const todaySuffix = `:${day}`;
  for (const k of memoryViews.keys()) {
    if (!k.endsWith(todaySuffix)) memoryViews.delete(k);
  }
}
