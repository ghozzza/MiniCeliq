// Env schema parsing — defaults, overrides, and rejection of bad shapes.
// Pure schema test (no process.env mutation, no I/O): we exercise `envSchema`
// directly so it's fully deterministic and offline.

import { describe, it, expect } from "vitest";
import { envSchema } from "../config/env";

describe("envSchema", () => {
  it("applies sensible defaults when nothing is set", () => {
    const env = envSchema.parse({});

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.SUMMARY_FREE_DAILY_LIMIT).toBe(3);
    expect(env.CELO_CHAIN).toBe("celo");
    expect(env.CELO_RPC).toBe("https://forno.celo.org");
    expect(env.EVENT_INDEXER_FROM_BLOCK).toBe(0);
    // The bugfix default: forno caps getLogs at 5000 blocks.
    expect(env.EVENT_INDEXER_CHUNK_BLOCKS).toBe(5000);
    // Boolean-transformed cron flags.
    expect(env.ENABLE_EVENT_INDEXER).toBe(true);
    expect(env.ENABLE_NEWS_INGEST).toBe(true);
    // Defaulted lists / urls.
    expect(env.NEWS_RSS_FEEDS).toContain("coindesk");
    expect(env.CELO_RPC_FALLBACKS).toContain("ankr");
    expect(env.BLOCK_EXPLORER_API_URL).toBe("https://api.etherscan.io/v2/api");
    // Unset optionals stay undefined (graceful-degradation contract).
    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.BLOCK_EXPLORER_API_KEY).toBeUndefined();
  });

  it("coerces + transforms overrides", () => {
    const env = envSchema.parse({
      PORT: "8080",
      NODE_ENV: "production",
      SUMMARY_FREE_DAILY_LIMIT: "10",
      ENABLE_EVENT_INDEXER: "false",
      EVENT_INDEXER_CHUNK_BLOCKS: "1000",
      CELO_CHAIN: "celoSepolia",
      NEWS_RSS_FEEDS: "",
    });

    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe("production");
    expect(env.SUMMARY_FREE_DAILY_LIMIT).toBe(10);
    expect(env.ENABLE_EVENT_INDEXER).toBe(false); // "false" -> boolean false
    expect(env.EVENT_INDEXER_CHUNK_BLOCKS).toBe(1000);
    expect(env.CELO_CHAIN).toBe("celoSepolia");
    // Explicit "" is preserved (only an UNSET feed list takes the default).
    expect(env.NEWS_RSS_FEEDS).toBe("");
  });

  it("rejects malformed values", () => {
    // Bad contract address (not 40 hex).
    expect(envSchema.safeParse({ SUBSCRIPTION_CONTRACT_ADDRESS: "0x123" }).success).toBe(false);
    // Non-positive port.
    expect(envSchema.safeParse({ PORT: "-1" }).success).toBe(false);
    // Unknown NODE_ENV.
    expect(envSchema.safeParse({ NODE_ENV: "staging" }).success).toBe(false);
    // Chunk size above the 45k upper bound.
    expect(envSchema.safeParse({ EVENT_INDEXER_CHUNK_BLOCKS: "99999" }).success).toBe(false);
  });
});
