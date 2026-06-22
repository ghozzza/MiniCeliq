// Backend client for the feed, AI summaries, and stats.
//
// Resilience: the BE may be down during early development, so every call falls
// back to a small mock so the UI is always demoable. Mocks are clearly labelled.
//
// Backend routes (README §7):
//   GET  /api/news                      -> headline list
//   POST /api/news/summarize            -> AI summary (free quota by address)
//   GET  /api/subscription/:address     -> { active, expiry } (chain read, cached)
//   GET  /api/stats                     -> analytics
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO
  category?: string;
}

export interface SummaryResult {
  summary: string;
  // True when the server gated this request (free quota exhausted) → show paywall.
  gated?: boolean;
  // Remaining free summaries for today, if the server reports it.
  remaining?: number;
}

export interface StatsResult {
  usage: {
    dau: number;
    mau: number;
    retentionD7: number; // 0..1
  };
  onchain: {
    txLifetime: number;
    uniqueSubscribers: number;
    volumeUsd: number;
    networkFeesUsd: number;
    failedTxRate: number; // 0..1
  };
  // True when these are placeholder/mock numbers (BE not wired yet).
  mock?: boolean;
  updatedAt?: string;
}

// ---- Mock fallbacks ----

const MOCK_NEWS: NewsItem[] = [
  {
    id: "mock-1",
    title: "Stablecoin payments keep climbing across emerging markets",
    source: "Sample feed",
    url: "#",
    publishedAt: new Date().toISOString(),
    category: "Stablecoins",
  },
  {
    id: "mock-2",
    title: "Central banks weigh digital-dollar rails for cross-border flows",
    source: "Sample feed",
    url: "#",
    publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    category: "Macro",
  },
  {
    id: "mock-3",
    title: "On-chain subscriptions emerge as a fee-light revenue model",
    source: "Sample feed",
    url: "#",
    publishedAt: new Date(Date.now() - 7_200_000).toISOString(),
    category: "DeFi",
  },
];

const MOCK_STATS: StatsResult = {
  usage: { dau: 0, mau: 0, retentionD7: 0 },
  onchain: {
    txLifetime: 0,
    uniqueSubscribers: 0,
    volumeUsd: 0,
    networkFeesUsd: 0,
    failedTxRate: 0,
  },
  mock: true,
};

// Small typed fetch wrapper: returns null on any failure so callers can fall back.
async function tryFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---- Public API ----

export async function fetchNews(): Promise<{ items: NewsItem[]; mock: boolean }> {
  const data = await tryFetch<{ items: NewsItem[] }>("/api/news");
  if (data?.items?.length) return { items: data.items, mock: false };
  return { items: MOCK_NEWS, mock: true };
}

export async function fetchSummary(
  articleId: string,
  address: string | null,
): Promise<SummaryResult> {
  const data = await tryFetch<SummaryResult>("/api/news/summarize", {
    method: "POST",
    body: JSON.stringify({ articleId, address }),
  });
  if (data) return data;
  // Mock summary so the UI demos even with no backend.
  return {
    summary:
      "Sample summary: this is a placeholder until the backend is connected. The real feature condenses the article into a few neutral bullet points.",
  };
}

export async function fetchStats(): Promise<StatsResult> {
  const data = await tryFetch<StatsResult>("/api/stats");
  return data ?? MOCK_STATS;
}
