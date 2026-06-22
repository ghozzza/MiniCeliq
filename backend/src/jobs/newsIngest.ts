// News ingest cron task — refreshes the RSS news cache (README §7). Gated in the
// scheduler on NEWS_RSS_FEEDS being non-empty and ENABLE_NEWS_INGEST. Never
// throws to the scheduler; logs and swallows so one bad run doesn't kill the
// process.

import { ingestNews } from "../services/rssNews";

export async function runNewsIngest(): Promise<void> {
  try {
    const summary = await ingestNews();
    console.log(
      `[NEWS_INGEST] done — fetched=${summary.fetched} stored=${summary.stored} backend=${summary.cacheBackend}`
    );
  } catch (err) {
    console.error("[NEWS_INGEST] failed:", err instanceof Error ? err.message : err);
  }
}
