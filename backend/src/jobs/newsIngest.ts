// News ingest cron task — refreshes the RSS news cache (README §7). Gated in the
// scheduler on NEWS_RSS_FEEDS being non-empty and ENABLE_NEWS_INGEST. Never
// throws to the scheduler; logs and swallows so one bad run doesn't kill the
// process.

import { ingestNews, pruneOldNews } from "../services/rssNews";

// In-flight guard so an overlapping cron tick doesn't double-fetch the feeds
// (audit L2).
let running = false;

export async function runNewsIngest(): Promise<void> {
  if (running) {
    console.log("[NEWS_INGEST] skipped — previous run still in progress.");
    return;
  }
  running = true;
  try {
    const summary = await ingestNews();
    console.log(
      `[NEWS_INGEST] done — fetched=${summary.fetched} stored=${summary.stored} backend=${summary.cacheBackend}`
    );
    // Piggyback retention on the ingest tick (audit L6): trim old cached rows so
    // news_cache / summary_views don't grow without bound.
    await pruneOldNews();
  } catch (err) {
    console.error("[NEWS_INGEST] failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}
