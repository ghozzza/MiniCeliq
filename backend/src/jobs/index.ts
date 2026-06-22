// Cron scheduler (node-cron, UTC). Every job is gated behind an env flag AND its
// integration being configured, so the process never crashes when the chain /
// Supabase / RSS feeds are absent — it just logs that the job is disabled.

import cron from "node-cron";
import { env, hasChain, hasSupabase } from "../config/env";
import { runNewsIngest } from "./newsIngest";
import { runEventIndexer } from "./eventIndexer";

function reportCronFailure(jobName: string, err: unknown): void {
  console.error(`[CRON] ${jobName} failed:`, err instanceof Error ? err.message : err);
}

function schedule(expression: string, jobName: string, fn: () => Promise<void>): void {
  cron.schedule(expression, () => {
    fn().catch((err) => reportCronFailure(jobName, err));
  });
}

export function startCronJobs(): void {
  // News ingest — every NEWS_INGEST_INTERVAL_MINUTES. Gated on the flag AND
  // NEWS_RSS_FEEDS being non-empty (mock feed needs no refresh).
  if (env.ENABLE_NEWS_INGEST && env.NEWS_RSS_FEEDS.trim().length > 0) {
    const interval = env.NEWS_INGEST_INTERVAL_MINUTES;
    schedule(`*/${interval} * * * *`, "newsIngest", runNewsIngest);
    console.log(`[CRON] newsIngest scheduled (every ${interval} min, RSS).`);
    // Warm the cache on boot so the first /api/news request isn't a cold fetch.
    runNewsIngest().catch((err) => reportCronFailure("newsIngest(boot)", err));
  } else {
    console.log("[CRON] newsIngest disabled (flag off or NEWS_RSS_FEEDS empty).");
  }

  // Event indexer — every EVENT_INDEXER_INTERVAL_MINUTES. Gated on the flag AND
  // the chain + Supabase both being configured (nothing to index into otherwise).
  if (env.ENABLE_EVENT_INDEXER && hasChain() && hasSupabase()) {
    const interval = env.EVENT_INDEXER_INTERVAL_MINUTES;
    schedule(`*/${interval} * * * *`, "eventIndexer", runEventIndexer);
    console.log(`[CRON] eventIndexer scheduled (every ${interval} min).`);
  } else {
    console.log(
      "[CRON] eventIndexer disabled (flag off, or chain/Supabase not configured)."
    );
  }

  console.log("[CRON] Jobs scheduled.");
}
