# MiniCeliq Backend

Express 4 + TypeScript API for the **MiniCeliq** MiniPay (Celo) mini app — a
stablecoin news-subscription service. Standalone and **fully independent of
Celiq** (no shared code, data, auth, or runtime). See the master plan in
`../README.md` (§7 routes/trust model, §8 networks/tokens, §11 env, §16 pricing).

## What it does

- Serves a curated crypto + macro **RSS news** headline list.
- Generates **AI summaries** (OpenRouter via Vercel AI SDK), cached per article.
- **Read-gates** unlimited summaries by on-chain `isActive(address)`; free
  addresses get a daily quota.
- Reads `NewsSubscription` on-chain state (viem) for `{ active, expiry }`.
- Indexes `Subscribed` events into Supabase for public `/stats`.

## Stack

Express 4 · TypeScript · pnpm · **viem** (Celo reads) · **rss-parser** ·
Vercel **AI SDK** + OpenRouter · **@supabase/supabase-js** · zod · cors ·
express-rate-limit · node-cron. Build = `tsc` → `dist`, dev = `tsx watch`.

## Commands

```bash
pnpm install
pnpm dev      # tsx watch src/server.ts
pnpm build    # tsc -> dist
pnpm start    # node dist/server.js
pnpm test     # vitest
```

## Routes (all public — README §7)

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness + which integrations are wired |
| `GET /api/news?limit=50` | RSS headline list (cached) |
| `POST /api/news/summarize` | AI summary; free quota by address, unlimited if `isActive(address)`. Over quota → **402** `{ code: "summary_quota_exceeded" }` |
| `GET /api/subscription/:address` | `{ active, expiry }` from chain |
| `GET /api/stats` | aggregated analytics from indexed `Subscribed` events |

`POST /api/news/summarize` body:
```json
{ "articleId": "<id from /api/news>", "address": "0x...", "title": "optional" }
```

## Trust model (README §7)

MiniPay **forbids message signing**, so there is no SIWE/JWT. The summary gate
reads on-chain `isActive(addressClaimedByClient)`. Address-spoofing is accepted
because the gated asset is *news summaries* (not funds/PII) and distribution is
through MiniPay (trusted address source). Writes are never address-gated — only
the contract gates writes, via `msg.sender`.

## Graceful degradation

Every integration is **optional**; the app boots and serves `/api/health` with
zero secrets. Behavior when a key is absent:

| Integration | Missing → behavior |
|---|---|
| Supabase (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) | in-memory cache/quota (single-instance, resets on restart); event indexer & `/stats` stay empty |
| OpenRouter (`OPENROUTER_API_KEY`) | `POST /summarize` → **503** |
| Chain (`CELO_RPC` + `SUBSCRIPTION_CONTRACT_ADDRESS`) | `GET /subscription/:address` → **503**; summary gate falls back to free-quota-only (no premium override); event indexer disabled |
| `NEWS_RSS_FEEDS=""` | serves a small built-in mock feed |

## Supabase schema (when wired)

The backend expects these tables (service-role access). Suggested columns:

- `news_cache(id text pk, title text, source text, url text, published_at timestamptz)`
- `news_summaries(article_id text pk, summary text, model text, created_at timestamptz)`
- `summary_views(address text, article_id text, view_day date, primary key (address, article_id, view_day))`
- `subscribed_events(tx_hash text, log_index int, block_number bigint, user_address text, plan int, token_address text, amount numeric, new_expiry bigint, block_time timestamptz, primary key (tx_hash, log_index))`

## Env

See `.env.example`. Keys: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`OPENROUTER_API_KEY`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `NEWS_RSS_FEEDS`,
`CELO_CHAIN`, `CELO_RPC`, `SUBSCRIPTION_CONTRACT_ADDRESS`, `SUMMARY_FREE_DAILY_LIMIT`,
`FRONTEND_URL`, plus cron flags.

## Deploy

Railway (`railway up` from `/backend`). `PORT` injected by Railway; defaults to
4000 locally.
