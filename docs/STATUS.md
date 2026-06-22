# MiniCeliq — Project Status & Resume Guide

_Last updated: 2026-06-22._ Detailed handover so work can resume cold (e.g. after a machine
restart). For design rationale see [`../README.md`](../README.md); for repo rules see
[`../CLAUDE.md`](../CLAUDE.md).

---

## 1. Snapshot — where we are

**Phase: FULLY HOSTED — contract LIVE on Celo mainnet (now V2 — auto-mints a CENY reward on subscribe),
Ceny reward token LIVE + verified, FE LIVE on Vercel at `https://mini.celiq.io`, BE LIVE on Railway.
Registered on Talent App. All Proof-of-Ship hard-gates met. cloudflared tunnels retired.**

**Live `NewsSubscription` (Celo mainnet, chainId 42220):** proxy `0x3988b17eb4134eB929118244Be69798b5dF69ce7`
(unchanged) · **V2 impl `0xadf826d6d221bc45840abd0e09f71021181476c2`** (V1 impl was
`0xa0e3B8672f628B0146E23382845b0625A4D2F722`) · deploy block `70222870` · admin/treasury
`0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` · verified on Celoscan. Details: `contracts/deployments/celo-mainnet.json`.

**Live `Ceny` (CENY) reward token:** proxy `0xFacb8Ba3daC93785689CBF0418b9Ad664a25d6aB` · impl
`0x20952EACBd5325342c8a57E68dcEE0251aeb5e8f` · cap 1,000,000,000 CENY (18 dec) · verified. The
`NewsSubscription` proxy holds Ceny's `MINTER_ROLE`.

| Area | State |
|------|-------|
| Smart contract (`NewsSubscription`) | ✅ Built (Foundry, UUPS, AccessControl, non-custodial), security-reviewed + hardened. **Upgraded to V2 (auto-mint CENY reward).** |
| On-chain deploy | ✅ **Celo mainnet + verified** — proxy `0x3988…69ce7` (block 70222870), **V2 impl `0xadf8…76c2`**. PoS hard-gate ✅ |
| NewsSubscription V2 (reward) | ✅ **Live.** Every `subscribe` auto-mints CENY to the subscriber — **10 CENY (plan 0 / monthly), 120 CENY (plan 1 / yearly)** — best-effort (try/catch; a mint failure never blocks the paid sub). Adjustable via `setCenyReward` / `setCenyToken` (MANAGER). V1 subscriber state + pricing/promo preserved through the upgrade. |
| Frontend | ✅ **Live on Vercel at `https://mini.celiq.io`** (custom domain live, SSL active; `miniceliq.vercel.app` still serves). Next.js + viem, MiniPay-compliant, reskinned to **Celiq editorial design** + decor/micro-motion + brand logo + animated aurora. **CENY reward surfaced in the FE** (subscribe sheet "+ Earn N CENY" + "You hold X CENY"; home masthead "◆ X CENY" balance pill). ~284 KB gzip JS (<2 MB). API → **Railway backend**. |
| Backend | ✅ **Live on Railway** (`https://miniceliq-backend-production.up.railway.app`). Express + TS. Live integrations: **Celo chain reads + OpenRouter AI summaries + Supabase (live, persistent)** — `/api/health` shows `supabase`, `openrouter`, `chain` all `true`. Smoke-tested 12/12. **cloudflared tunnels retired** (tunnels only for local dev now). |
| Supabase (data layer) | ✅ **Live + persistent** — 4 tables, RLS enabled (service-role only), schema at `backend/supabase/schema.sql`. |
| Ceny token (CENY) | ✅ **Live + verified on Celo mainnet** — proxy `0xFacb…d6aB`, ERC-20 capped (1B, 18 dec), UUPS, AccessControl. Auto-mint reward integrated (V2); reward now surfaced in the FE. |
| Forge tests | ✅ **42 pass** — V2 11 + V1 20 + Ceny 11. Storage layout append-only safe (OZ-validated). |
| Security audit | ✅ pashov 12-lens + Celo layer — **0 confirmed findings**, 3 hardening items applied (`contracts/audit/`). |
| Live URLs | ✅ FE on Vercel (`mini.celiq.io`) · BE on Railway (`miniceliq-backend-production.up.railway.app`). **PoS hard-gate met.** |
| Talent App registration | ✅ **Registered** (domain ownership verified via a `talentapp:project_verification` meta tag on `mini.celiq.io`). **PoS hard-gate met.** |
| MiniPay Discovery intake | ⬜ Later (after live + polished). |

## 2. Repo facts

- **Remote:** `https://github.com/ghozzza/MiniCeliq` (public). Branch `main`.
- Standalone public repo. `contracts/lib/`, `node_modules/`, `.next/`, `.env*`, `.agents/` are git-ignored.
- Reference knowledge: `.agents/skills/celopedia-skill` (Celo/MiniPay) + `.agents/skills/{solidity-auditor,x-ray}` (pashov) — local only, git-ignored.

## 3. Run / build locally

> The whole stack is now **hosted** — FE on Vercel (`https://mini.celiq.io`), BE on Railway
> (`https://miniceliq-backend-production.up.railway.app`). The steps below are for **local dev only**;
> cloudflared tunnels are retired and are no longer part of the live path (they were only ever for
> pre-hosting MiniPay device testing on the laptop).

```bash
# Contracts (Foundry)
cd contracts
forge install foundry-rs/forge-std@v1.9.7
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0
forge install OpenZeppelin/openzeppelin-foundry-upgrades@v0.4.1
forge clean && forge build && forge test    # 19 pass (clean build needed for OZ upgrade validation)

# Frontend
cd ../frontend && pnpm install && pnpm start  # http://localhost:3000

# Backend
cd ../backend && pnpm install && pnpm dev     # http://localhost:4000 (boots without secrets, degraded)

# MiniPay device testing — expose both via cloudflared (the phone can't reach localhost).
# BOTH FE and BE need their own tunnel:
cloudflared tunnel --url http://localhost:3000   # FE → public URL
cloudflared tunnel --url http://localhost:4000   # BE → public URL
# Then set frontend NEXT_PUBLIC_API_URL = BE tunnel URL, and backend FRONTEND_URL (CORS) = FE tunnel URL.
# Tunnel URLs are ephemeral — for device testing only.
```

## 4. Security audit summary

`solidity-auditor` (12 parallel attacker lenses) + Celo-specific layer. **0 confirmed unprivileged
findings.** Three latent leads were fixed (zero-cost):
1. CEI ordering — `subscribe` writes `subscriptionExpiry` **before** `safeTransferFrom`.
2. `treasury == address(this)` rejected in `initialize` + `setTreasury` (`InvalidTreasury`).
3. `onlyOwner` added to `NewsSubscriptionV2.initializeV2`.

Accepted/by-design leads (no code change): fee-on-transfer token shortfall (only allowlist standard
stablecoins), promo/price approval race (centralization; optional future `maxPrice` param), admin
hygiene foot-guns (ops runbook), treasury blacklist DoS (rotate treasury), no token-rescue (non-custodial
by design). Full report: `contracts/audit/NewsSubscription-pashov-audit-2026-06-22.md`.

## 5. Pricing config (decided)

Monthly **$5**, Yearly **$50**; **launch promo $0.10/month until 2026-06-30 UTC** (`promoEndsAt = 1782864000`).
Only the monthly plan gets a promo. Token-native units to set via `script/Configure.s.sol`:

| Token (dec) | Monthly (plan 0) | Yearly (plan 1) | Monthly promo |
|---|---|---|---|
| USDm (18) | `5000000000000000000` | `50000000000000000000` | `100000000000000000` |
| USDC (6) | `5000000` | `50000000` | `100000` |
| USDT (6) | `5000000` | `50000000` | `100000` |

## 6. Remaining roadmap (what's left)

> ✅ **Done:** `NewsSubscription` deployed + verified on Celo mainnet, **upgraded to V2 (auto-mint CENY
> reward)** · **Ceny (CENY) deployed + verified** + `MINTER_ROLE` granted to the subscription proxy ·
> **frontend live on Vercel at `https://mini.celiq.io`** (custom domain + SSL live, API → Railway) ·
> **backend live on Railway** (`https://miniceliq-backend-production.up.railway.app` — chain reads +
> OpenRouter AI summaries + Supabase persistent) · **CENY reward surfaced in the FE** · **registered on
> Talent App** · frontend reskinned to Celiq editorial design + decor + logo + aurora · 42 forge tests
> pass. **All Proof-of-Ship hard-gates met; cloudflared tunnels retired** (local dev only now).

> **V2 / reward note:** every `subscribe` now mints a CENY reward to the subscriber — **10 CENY**
> (plan 0 / monthly), **120 CENY** (plan 1 / yearly). The mint is **best-effort** (try/catch — a mint
> failure never blocks the paid subscription) and **adjustable** via `setCenyReward` / `setCenyToken`
> (MANAGER_ROLE). All V2 upgrades + role grants are signed by the **admin key** `0x02EF…7E45` (the
> deployer/gas key `0xA323…Ce49` in `contracts/.env` does **not** hold the roles).

### M5 — Host the app, go live ✅ DONE
- **Frontend (Vercel):** ✅ **LIVE at `https://mini.celiq.io`** (project `ghozzzas-projects/miniceliq`).
  Custom domain is live — DNS A record (`mini` → `76.76.21.21`) is set and SSL is active. Deployed via CLI
  with `--build-env` for ALL `NEXT_PUBLIC_*` vars (incl. `NEXT_PUBLIC_CENY_CONTRACT`); the API now points at
  the **Railway backend** (no longer the cloudflared tunnel).
- **Backend (Railway):** ✅ **LIVE at `https://miniceliq-backend-production.up.railway.app`** (Railway
  account `cghoza@gmail.com`, project + service `miniceliq-backend`). Points at the live Supabase project,
  env set via the Railway CLI, `FRONTEND_URL=https://mini.celiq.io` for CORS, `EVENT_INDEXER_FROM_BLOCK` =
  deploy block `70222870`; `PORT` injected by Railway. `/api/health` shows `supabase`, `openrouter`,
  `chain` all `true`. Deploy/redeploy details: [`DEPLOYMENT.md`](DEPLOYMENT.md) §11.1.

### Ceny token — deploy + integrate ✅ DONE
- ✅ Deployed `Ceny` (CENY) to Celo mainnet (proxy `0xFacb…d6aB`, verified) and **integrated the reward
  into the subscribe flow** — `NewsSubscription` was **upgraded to V2** (UUPS) so each `subscribe`
  auto-mints CENY; the subscription proxy was granted Ceny's `MINTER_ROLE`.

### M6 — Proof of Ship submission ✅ HARD-GATES MET
- Public GitHub ✅ · live app URL ✅ (`https://mini.celiq.io`) · contract on **mainnet** ✅
  (NewsSubscription V2 + Ceny) · **registered on Talent App** ✅ (domain ownership verified via a
  `<meta name="talentapp:project_verification" …>` tag injected through Next `metadata.other` in
  `app/layout.tsx`, live on `mini.celiq.io`). All four hard-gates met.
  Remaining (optional): add the MiniPay-hook path to the project's Data Sources for activity tracking,
  drive first real subscribers (on-chain fees are scored).

### Later — optional / MiniPay Discovery intake
- Once live + polished, submit Stage-1 intake at `https://minipay.to/mini-apps`. Pre-listing checklist: `.agents/skills/celopedia-skill/references/minipay-requirements.md`.

## 7. Environment variables (NAMES only — never commit values)

- **contracts/.env:** `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`, `ETHERSCAN_API_KEY`, `CELO_RPC`, `CELO_SEPOLIA_RPC`, `PROXY_ADDRESS`, (Sepolia) `USDM_ADDRESS`/`USDC_ADDRESS`/`USDT_ADDRESS`.
- **backend/.env:** `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_POOLER_URL` (session pooler — used only to run DDL/migrations; the direct DB host is IPv6-only), `OPENROUTER_API_KEY`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `NEWS_RSS_FEEDS`, `CELO_CHAIN`, `CELO_RPC`, `SUBSCRIPTION_CONTRACT_ADDRESS`, `EVENT_INDEXER_FROM_BLOCK`, `FRONTEND_URL`, `SUMMARY_FREE_DAILY_LIMIT`.
- **frontend/.env:** `NEXT_PUBLIC_API_URL` (now the Railway BE URL), `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT`, `NEXT_PUBLIC_CENY_CONTRACT` (`0xFacb…25d6aB` — surfaces the CENY reward/balance in the FE), `NEXT_PUBLIC_SUPPORT_URL`.

## 8. Gating model (reminder)

MiniPay forbids message signing, so the backend gates AI summaries by reading on-chain
`isActive(address)` for the MiniPay-provided address (server read-gate). Free tier = N summaries/day
(`SUMMARY_FREE_DAILY_LIMIT`, default 3); active subscriber = unlimited. Over-quota → HTTP 402
`{ code: "summary_quota_exceeded" }`. Accepted low-risk address-spoofing tradeoff for news content.
