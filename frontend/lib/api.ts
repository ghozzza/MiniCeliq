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

export interface VolumeByToken {
  token: string; // token contract address
  volume: string; // summed amount, token-native units (stringified bigint)
  count: number;
}

// Matches the backend `GET /api/stats` payload (analytics from indexed Subscribed
// events). On-chain only for now; DAU/MAU/retention come from web analytics later.
export interface StatsResult {
  subscriberCount: number;
  totalSubscriptions: number;
  txPerDay: { date: string; count: number }[];
  volumeByToken: VolumeByToken[];
  // False until the indexer has data (no Supabase / contract not deployed yet).
  available: boolean;
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
  subscriberCount: 0,
  totalSubscriptions: 0,
  txPerDay: [],
  volumeByToken: [],
  available: false,
};

const MOCK_SUMMARY =
  "Sample summary: this is a placeholder until the backend is connected. The real feature condenses the article into a few neutral bullet points.";

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
  // No backend configured → demo with a mock summary.
  if (!API_URL) return { summary: MOCK_SUMMARY };
  try {
    const res = await fetch(`${API_URL}/api/news/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, address }),
      cache: "no-store",
    });

    // Free quota exhausted → signal the paywall (BE returns HTTP 402). This MUST
    // be distinguished from other failures, otherwise the gate never triggers.
    if (res.status === 402) return { summary: "", gated: true };

    // AI key unset (503) / bad input (400) / network → graceful mock so the UI demos.
    if (!res.ok) return { summary: MOCK_SUMMARY };

    const data = (await res.json()) as {
      summary: string;
      quota?: { unlimited: boolean; used: number | null; limit: number | null };
    };
    const q = data.quota;
    const remaining =
      q && !q.unlimited && q.limit != null && q.used != null
        ? Math.max(0, q.limit - q.used)
        : undefined;
    return { summary: data.summary, remaining };
  } catch {
    return { summary: MOCK_SUMMARY };
  }
}

export async function fetchStats(): Promise<StatsResult> {
  const data = await tryFetch<StatsResult>("/api/stats");
  return data ?? MOCK_STATS;
}
