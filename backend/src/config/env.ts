// Central env validation. Validates process.env at boot via side-effect import
// — invalid (wrong-shaped) vars cause process.exit(1) with a readable error
// listing which vars failed. Replaces scattered `process.env.X!` usage so a
// misconfigured deploy fails fast instead of crashing mid-request.
//
// Trust model for MiniCeliq: every external integration (Supabase, OpenRouter,
// Celo RPC, contract address) is OPTIONAL at the schema level. The app must
// boot and serve `/api/health` even with zero secrets so it can be deployed and
// inspected before the contract/Supabase/OpenRouter are wired up. Each feature
// degrades gracefully (503 / in-memory fallback / disabled cron) when its key is
// absent — mirroring how Celiq treats Xendit as a dev-optional 503.

import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = () =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  );

const optionalUrlString = () =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  );

// Default RSS news feeds (CoinDesk, Cointelegraph, Decrypt) — free, no API key.
// Same curated trio Celiq uses. Override via NEWS_RSS_FEEDS (comma-separated);
// set to "" to force the in-memory mock feed.
const DEFAULT_NEWS_RSS_FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
].join(",");

// Celo default RPCs (README §8). CELO_RPC defaults to mainnet forno; the
// `CELO_CHAIN` switch decides which viem chain (and default RPC) to use.
const DEFAULT_CELO_MAINNET_RPC = "https://forno.celo.org";

const envSchema = z.object({
  // ---- Always optional with a sensible default ----
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ---- Supabase (storage). Optional → in-memory cache fallback when absent. ----
  // News cache, AI-summary cache, indexed events, and free-tier quota all live
  // here. If unset, services fall back to in-memory equivalents so the app still
  // boots and works for a single instance (state is lost on restart).
  SUPABASE_URL: optionalUrlString(),
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString(),

  // ---- AI summaries (OpenRouter via Vercel AI SDK). Optional → 503 when absent. ----
  OPENROUTER_API_KEY: optionalNonEmptyString(),
  LLM_PRIMARY_MODEL: z.string().min(1).default("anthropic/claude-haiku-4.5"),
  LLM_FALLBACK_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),

  // ---- News source ----
  // Comma-separated RSS feed URLs. Defaults to the curated 3 when unset. Set to
  // "" to force the in-memory mock feed (no network).
  NEWS_RSS_FEEDS: z.string().default(DEFAULT_NEWS_RSS_FEEDS),

  // ---- On-chain (Celo). Optional → chain reads 503 when RPC/address absent. ----
  // CELO_CHAIN selects which network the publicClient targets. Defaults to
  // mainnet (Proof of Ship requires a mainnet deployment).
  CELO_CHAIN: z.enum(["celo", "celoSepolia"]).default("celo"),
  CELO_RPC: z.string().url().default(DEFAULT_CELO_MAINNET_RPC),
  // Deployed proxy address. EIP-55 trap (README §5): viem rejects a hand-recased
  // address — store it lowercase or via `cast to-check-sum-address`. Validated
  // as a 0x-prefixed 40-hex string here; viem applies the checksum at use.
  SUBSCRIPTION_CONTRACT_ADDRESS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 40-hex address")
      .optional()
  ),

  // ---- Free-tier AI-summary quota (server-side gate, README §7) ----
  // Free addresses get N summaries/day; on-chain `isActive(address)` overrides
  // the cap (unlimited). Tunable so it can match the contract's pricing copy.
  SUMMARY_FREE_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(3),

  // ---- CORS ----
  FRONTEND_URL: optionalUrlString(),

  // ---- Cron kill-switches ----
  // News ingest cron (every ~5 min). Also gated on NEWS_RSS_FEEDS being non-empty.
  ENABLE_NEWS_INGEST: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  NEWS_INGEST_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(59)
    .default(5),
  // Event indexer cron (chunked eth_getLogs over `Subscribed`). Also gated on
  // RPC + contract address being present.
  ENABLE_EVENT_INDEXER: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  EVENT_INDEXER_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(59)
    .default(5),
  // First block to scan for `Subscribed` events. Set to the contract deploy
  // block so the indexer doesn't sweep the entire chain from genesis. 0 = from
  // genesis (slow — set this in deployed envs).
  EVENT_INDEXER_FROM_BLOCK: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("\n❌ Environment validation failed:\n");
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "(root)";
      console.error(`  • ${path}: ${issue.message}`);
    }
    console.error("\nCheck .env file or Railway environment variables.\n");
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = loadEnv();

// ---- Capability flags — single source of truth for "is integration X wired?" ----
// Routes/services consult these to decide between live behavior and graceful
// degradation (503 / in-memory / disabled). Keeps the null-checks consistent.

export function hasSupabase(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasOpenRouter(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

export function hasChain(): boolean {
  return Boolean(env.CELO_RPC && env.SUBSCRIPTION_CONTRACT_ADDRESS);
}
