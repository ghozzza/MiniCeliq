// RSS mapping (services/rssNews). The network parser is mocked, so no live feed
// is fetched. Verifies the normalized NewsItem shape: stable id, cleaned source,
// content snippet — and that the mapping is category-less (no `category` field).

import { describe, it, expect, vi, afterAll } from "vitest";

vi.mock("rss-parser", () => {
  class FakeParser {
    constructor(_opts?: unknown) {}
    async parseURL(_url: string) {
      return {
        title: "CoinDesk: Bitcoin and Cryptocurrency News",
        items: [
          {
            title: "Bitcoin tops $100k",
            link: "https://www.coindesk.com/markets/btc-100k",
            isoDate: "2026-06-20T10:00:00.000Z",
            contentSnippet: "Bitcoin rose sharply today amid heavy ETF inflows.",
          },
        ],
      };
    }
  }
  return { default: FakeParser };
});

describe("rssNews.fetchAllFeeds", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("maps RSS items to the normalized, category-less NewsItem shape", async () => {
    // Single feed → one item (all feeds dedupe to the same article id here).
    vi.stubEnv("NEWS_RSS_FEEDS", "https://feed.example/rss");
    const { fetchAllFeeds } = await import("../services/rssNews");

    const items = await fetchAllFeeds();

    expect(items).toHaveLength(1);
    const item = items[0];

    expect(item.title).toBe("Bitcoin tops $100k");
    expect(item.url).toBe("https://www.coindesk.com/markets/btc-100k");
    expect(item.publishedAt).toBe("2026-06-20T10:00:00.000Z");
    // Source brand is cleaned of the publisher tagline.
    expect(item.source).toBe("CoinDesk");
    // Stable 16-hex id derived from the article link.
    expect(item.id).toMatch(/^[0-9a-f]{16}$/);
    // Content snippet is captured for the AI prompt.
    expect(item.content).toContain("Bitcoin rose sharply");
    // Category-less: NewsItem carries no `category` field.
    expect(item).not.toHaveProperty("category");
    expect(Object.keys(item).sort()).toEqual([
      "content",
      "id",
      "publishedAt",
      "source",
      "title",
      "url",
    ]);
  });
});
