// Backend client for the feed, AI summaries, and stats.
//
// Resilience: the BE may be down during early development, so every call falls
// back to a small mock so the UI is always demoable. Mocks are clearly labelled.
//
// Backend routes (README §7):
//   GET  /api/news                      -> headline list
//   POST /api/news/summarize            -> AI summary (free quota by address)
//   GET  /api/subscription/:address     -> { active, expiry } (chain read, cached)
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
  // "What it means" implication block — why the story matters for the reader.
  // Absent on the mock / legacy-cached summaries (then the UI hides the block).
  artinya?: string;
  // LLM-classified market tone. More accurate than the headline-keyword guess,
  // so the card prefers it for the sentiment badge once the summary loads.
  sentiment?: "Bullish" | "Bearish" | "Neutral";
  // True when the server gated this request (free quota exhausted) → show paywall.
  gated?: boolean;
  // Remaining free summaries for today, if the server reports it.
  remaining?: number;
}

// Morning Brief: a once-daily AI digest, gated to on-chain subscribers.
//   - locked = true  → not a subscriber; `brief` is absent (show the locked card).
//   - locked = false → subscriber; `brief`/`day`/`generatedAt` present (or `brief`
//     absent if the server couldn't produce one today → card hides).
export interface BriefResult {
  locked: boolean;
  brief?: string;
  day?: string;
  generatedAt?: string;
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
      artinya?: string;
      sentiment?: "Bullish" | "Bearish" | "Neutral";
      quota?: { unlimited: boolean; used: number | null; limit: number | null };
    };
    const q = data.quota;
    const remaining =
      q && !q.unlimited && q.limit != null && q.used != null
        ? Math.max(0, q.limit - q.used)
        : undefined;
    return {
      summary: data.summary,
      // Drop empty strings so the UI treats "no implication" as absent.
      artinya: data.artinya?.trim() ? data.artinya : undefined,
      sentiment: data.sentiment,
      remaining,
    };
  } catch {
    return { summary: MOCK_SUMMARY };
  }
}

// Fetch today's Morning Brief. Returns null on any failure (no API configured,
// network error, bad response) so the card hides instead of erroring. The address
// param is omitted when null — the server then reports the brief as locked.
export async function fetchBrief(
  address: string | null,
): Promise<BriefResult | null> {
  if (!API_URL) return null;
  const qs = address ? `?address=${encodeURIComponent(address)}` : "";
  return tryFetch<BriefResult>(`/api/news/brief${qs}`);
}
