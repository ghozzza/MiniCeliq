// RSS news service (README §7). Fetches + parses NEWS_RSS_FEEDS (CoinDesk,
// Cointelegraph, Decrypt by default), normalizes to the `NewsItem` shape, and
// caches in Supabase. Graceful degradation:
//   - Supabase absent  → in-memory cache (single-instance, lost on restart).
//   - NEWS_RSS_FEEDS "" → a small built-in mock feed (no network).
//   - a single feed failing does not kill the batch (per-feed try/catch).

import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { supabase } from "../lib/supabase";
import type { NewsItem } from "../types";

const FEED_TIMEOUT_MS = 10_000;
const CACHE_TABLE = "news_cache";
const MAX_ITEMS = 100;

interface RssCustomItem {
  mediaContent?: Array<{ $?: { url?: string } }>;
  contentEncoded?: string;
}
type RssFeedItem = RssCustomItem & Parser.Item;

const parser = new Parser<Record<string, never>, RssCustomItem>({
  timeout: FEED_TIMEOUT_MS,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const MAX_CONTENT_CHARS = 1200;

// Strip HTML tags and collapse whitespace into a single trimmed line of plain
// text, then cap at MAX_CONTENT_CHARS so the AI prompt stays bounded.
function plainText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

// Best-effort article body/snippet from an RSS item. Prefer the parser's clean
// contentSnippet; else strip HTML from content / content:encoded; else summary.
function extractContent(item: RssFeedItem): string | null {
  const snippet = (item.contentSnippet ?? "").trim();
  if (snippet) return plainText(snippet);

  const html = item.contentEncoded ?? item.content;
  if (html && html.trim()) {
    const text = plainText(html);
    if (text) return text;
  }

  const summary = ((item as { summary?: string }).summary ?? "").trim();
  if (summary) return plainText(summary);

  return null;
}

// In-memory fallback cache, used when Supabase is not configured.
let memoryCache: NewsItem[] = [];

function feedUrls(): string[] {
  return env.NEWS_RSS_FEEDS.split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

// Stable id from the article URL (or guid/title fallback) so the same article
// keeps the same id across feed restarts — summaries key off this.
function articleId(item: RssFeedItem): string {
  const seed = (item.link || item.guid || item.title || "").trim();
  return createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

function hostnameLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown";
  }
}

function cleanSourceName(rawTitle: string | undefined, feedUrl: string): string {
  const title = (rawTitle ?? "").trim();
  if (!title) return hostnameLabel(feedUrl);
  // Publishers append taglines (e.g. "CoinDesk: ... News and Price Data");
  // keep the brand before the first ": " / " | " / " - " separator.
  const brand = title.split(/(?::\s+|\s+\|\s+|\s+[-–]\s+)/)[0]?.trim();
  return brand && brand.length >= 2 ? brand : title;
}

function toIsoDate(item: RssFeedItem): string {
  if (item.isoDate) return item.isoDate;
  if (item.pubDate) {
    const parsed = Date.parse(item.pubDate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function mapItem(item: RssFeedItem, source: string): NewsItem | null {
  const title = (item.title ?? "").trim();
  const url = (item.link ?? "").trim();
  if (!title || !url) return null;
  return {
    id: articleId(item),
    title,
    source,
    url,
    publishedAt: toIsoDate(item),
    content: extractContent(item) ?? undefined,
  };
}

// Tiny built-in feed used only when NEWS_RSS_FEEDS is empty, so the API still
// returns something coherent in a no-network / no-config environment.
function mockNews(): NewsItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: "mock0001",
      title: "MiniCeliq backend running in mock mode (NEWS_RSS_FEEDS unset)",
      source: "MiniCeliq",
      url: "https://example.com/miniceliq-mock-1",
      publishedAt: now,
    },
    {
      id: "mock0002",
      title: "Set NEWS_RSS_FEEDS to serve live CoinDesk / Cointelegraph / Decrypt headlines",
      source: "MiniCeliq",
      url: "https://example.com/miniceliq-mock-2",
      publishedAt: now,
    },
  ];
}

// Fetch + parse every configured feed in parallel; dedup by id; sort newest
// first; cap at MAX_ITEMS. Per-feed try/catch isolates failures.
export async function fetchAllFeeds(): Promise<NewsItem[]> {
  const urls = feedUrls();
  if (urls.length === 0) return mockNews();

  const perFeed = await Promise.all(
    urls.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);
        const source = cleanSourceName(feed.title, url);
        return (feed.items ?? [])
          .map((it) => mapItem(it as RssFeedItem, source))
          .filter((it): it is NewsItem => it !== null);
      } catch (err) {
        console.warn(
          `[NEWS:RSS] feed failed ${url}:`,
          err instanceof Error ? err.message : err
        );
        return [];
      }
    })
  );

  const byId = new Map<string, NewsItem>();
  for (const item of perFeed.flat()) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  return Array.from(byId.values())
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    .slice(0, MAX_ITEMS);
}

// Persist the latest batch into the cache (Supabase upsert, or in-memory).
// Idempotent on `id`. Returns the number of items written.
export async function ingestNews(): Promise<{
  fetched: number;
  stored: number;
  cacheBackend: "supabase" | "memory";
}> {
  const items = await fetchAllFeeds();
  const db = supabase();

  if (!db) {
    memoryCache = items;
    return { fetched: items.length, stored: items.length, cacheBackend: "memory" };
  }

  const rows = items.map((it) => ({
    id: it.id,
    title: it.title,
    source: it.source,
    url: it.url,
    published_at: it.publishedAt,
    content: it.content ?? null,
  }));

  const { error } = await db.from(CACHE_TABLE).upsert(rows, { onConflict: "id" });
  if (error) {
    // Supabase configured but the table/insert failed → fall back to memory so
    // the endpoint still serves this batch instead of erroring.
    console.warn(`[NEWS:RSS] supabase upsert failed, using memory: ${error.message}`);
    memoryCache = items;
    return { fetched: items.length, stored: items.length, cacheBackend: "memory" };
  }

  return { fetched: items.length, stored: rows.length, cacheBackend: "supabase" };
}

// Read the cached headline list for `GET /api/news`. Prefers Supabase; falls
// back to the in-memory cache, and finally to a live fetch if nothing is cached
// yet (e.g. first request before the cron has run).
export async function getNews(limit = 50): Promise<NewsItem[]> {
  const db = supabase();

  if (db) {
    const { data, error } = await db
      .from(CACHE_TABLE)
      .select("id, title, source, url, published_at")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        source: r.source as string,
        url: r.url as string,
        publishedAt: r.published_at as string,
      }));
    }
    if (error) {
      console.warn(`[NEWS:RSS] supabase read failed, using memory: ${error.message}`);
    }
  }

  if (memoryCache.length > 0) return memoryCache.slice(0, limit);

  // Cold start: nothing cached yet — fetch live so the first request isn't empty.
  const fresh = await fetchAllFeeds();
  memoryCache = fresh;
  return fresh.slice(0, limit);
}

// Retention windows (audit L6) — keep the cache tables from growing unbounded.
const NEWS_RETENTION_DAYS = 14; // news_cache (only the newest ~50 are ever served)
const SUMMARY_RETENTION_DAYS = 30; // news_summaries
const VIEWS_RETENTION_DAYS = 7; // summary_views (only "today" matters for quota)

// Delete stale rows from the cache tables. Best-effort: a failure is logged, never
// thrown (called from the ingest cron). No-op without Supabase. (audit L6)
export async function pruneOldNews(): Promise<void> {
  const db = supabase();
  if (!db) return;
  const now = Date.now();
  const iso = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const day = (days: number) => iso(days).slice(0, 10);

  const results = await Promise.all([
    db.from(CACHE_TABLE).delete().lt("published_at", iso(NEWS_RETENTION_DAYS)),
    db.from("news_summaries").delete().lt("created_at", iso(SUMMARY_RETENTION_DAYS)),
    db.from("summary_views").delete().lt("view_day", day(VIEWS_RETENTION_DAYS)),
  ]);
  const labels = ["news_cache", "news_summaries", "summary_views"];
  results.forEach((r, i) => {
    if (r.error) console.warn(`[NEWS:RSS] ${labels[i]} prune failed: ${r.error.message}`);
  });
}

// Lookup a single cached article by id (used by aiSummary to title the prompt).
export async function getArticleById(id: string): Promise<NewsItem | null> {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from(CACHE_TABLE)
      .select("id, title, source, url, published_at, content")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      return {
        id: data.id as string,
        title: data.title as string,
        source: data.source as string,
        url: data.url as string,
        publishedAt: data.published_at as string,
        content: (data.content as string | null) ?? undefined,
      };
    }
  }
  return memoryCache.find((i) => i.id === id) ?? null;
}
