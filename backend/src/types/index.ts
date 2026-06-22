// Shared domain types for the MiniCeliq backend.

// Normalized news item served by `GET /api/news` (README §7). `id` is a stable
// hash of the article URL so summaries and dedup key off the same identifier
// across feed restarts.
export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO 8601
  // Article body/snippet captured from the RSS item, trimmed (~1200 chars). Used
  // to ground the AI summary so the model summarizes real text instead of trying
  // to fetch the URL. Optional: not every feed provides it, and the list endpoint
  // (`getNews`) intentionally omits it to keep payloads slim.
  content?: string;
}

// AI summary cached per article id.
export interface SummaryRecord {
  articleId: string;
  summary: string;
  model: string;
  createdAt: string; // ISO 8601
}

// On-chain subscription read (README §7: GET /api/subscription/:address).
export interface SubscriptionStatus {
  active: boolean;
  expiry: number; // unix seconds (0 = never subscribed)
}

// A single decoded `Subscribed` event row used for analytics indexing.
export interface SubscribedEvent {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  user: string;
  plan: number;
  token: string;
  amount: string; // stringified uint256 (token-native decimals)
  newExpiry: number; // unix seconds
  timestamp: string; // ISO 8601 of the block
}

// Aggregated analytics payload for `GET /api/stats`.
export interface StatsPayload {
  subscriberCount: number;
  totalSubscriptions: number;
  txPerDay: Array<{ date: string; count: number }>;
  volumeByToken: Array<{ token: string; volume: string; count: number }>;
  available: boolean; // false when no on-chain data has been indexed yet
}
