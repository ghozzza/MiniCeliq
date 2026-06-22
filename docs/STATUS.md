# MiniCeliq — Project Status & Resume Guide

_Last updated: 2026-06-22._ Detailed handover so work can resume cold (e.g. after a machine
restart). For design rationale see [`../README.md`](../README.md); for repo rules see
[`../CLAUDE.md`](../CLAUDE.md).

---

## 1. Snapshot — where we are

**Phase: contract LIVE + verified on Celo mainnet. FE + BE run locally (cloudflared tunnels for
device testing); not yet hosted on Vercel/VPS.**

**Live contract (Celo mainnet, chainId 42220):** proxy `0x3988b17eb4134eB929118244Be69798b5dF69ce7`
· impl `0xa0e3B8672f628B0146E23382845b0625A4D2F722` · deploy block `70222870` · admin/treasury
`0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` · both verified on Celoscan. Details: `contracts/deployments/celo-mainnet.json`.

| Area | State |
|------|-------|
| Smart contract (`NewsSubscription`) | ✅ Built (Foundry, UUPS, AccessControl, non-custodial), **20 tests pass**, security-reviewed + hardened. |
| On-chain deploy | ✅ **Celo mainnet + verified** — proxy `0x3988…69ce7` (block 70222870). PoS hard-gate ✅ |
| Frontend | ✅ Built (Next.js + viem, MiniPay-compliant), reskinned to **Celiq editorial design** + decor/micro-motion + brand logo + animated aurora. ~284 KB gzip JS (<2 MB). Runs locally; wired to the live contract. |
| Backend | ✅ Built (Express + TS). Live integrations: **Celo chain reads + OpenRouter AI summaries + Supabase (live, persistent)**. Smoke-tested 12/12. Runs locally; wired to the live contract. |
| Supabase (data layer) | ✅ **Live + persistent** — 4 tables, RLS enabled (service-role only), schema at `backend/supabase/schema.sql`. |
| Ceny token (CENY) | 🟡 **Built, not deployed** — ERC-20 capped (1B) UUPS, AccessControl, **11 tests pass**. Subscribe-integration (auto-mint) planned. |
| Security audit | ✅ pashov 12-lens + Celo layer — **0 confirmed findings**, 3 hardening items applied (`contracts/audit/`). |
| Live URLs (Vercel/VPS) | ⬜ Pending. **PoS hard-gate.** (FE → Vercel, BE → IDCloudHost VPS.) |
| Talent App registration | ⬜ Pending. **PoS hard-gate.** |
| MiniPay Discovery intake | ⬜ Later (after live + polished). |

## 2. Repo facts

- **Remote:** `https://github.com/ghozzza/MiniCeliq` (public). Branch `main`.
- Standalone public repo. `contracts/lib/`, `node_modules/`, `.next/`, `.env*`, `.agents/` are git-ignored.
- Reference knowledge: `.agents/skills/celopedia-skill` (Celo/MiniPay) + `.agents/skills/{solidity-auditor,x-ray}` (pashov) — local only, git-ignored.

## 3. Run / build locally

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

> ✅ **Done:** contract deployed + verified on Celo mainnet · backend live (chain reads + OpenRouter
> AI summaries + Supabase persistent) · frontend reskinned to Celiq editorial design + decor + logo +
> aurora · Ceny token built (11 tests). Both FE + BE run locally and are exposed via cloudflared for
> MiniPay device testing.

### M5 — Host the app, go live
- **Frontend (Vercel):** project `ghozzzas-projects/miniceliq` is already linked; domain `mini.celiq.io`
  planned. Set `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT` (lowercase — viem EIP-55 trap), `NEXT_PUBLIC_API_URL`
  (BE URL), `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SUPPORT_URL`. `vercel --prod` from `frontend/`.
- **Backend (IDCloudHost VPS, later):** deploy the Express server, point it at the live Supabase project
  (already provisioned), set env (§7), `EVENT_INDEXER_FROM_BLOCK` = deploy block `70222870`.

### Ceny token — deploy + integrate
- Deploy `Ceny` (CENY) to Celo mainnet, then **integrate the reward into the subscribe flow**
  (auto-mint Ceny on `subscribe`). This requires **upgrading the live `NewsSubscription`** (UUPS) —
  planned, not yet done. Decision still pending on the exact integration shape.

### M6 — Proof of Ship submission
- Public GitHub ✅ (done). Live app URL (Vercel) + contract on **mainnet** ✅ + register the project on
  **Talent App** (`https://talent.app/~/earn/celo-proof-of-ship`). Add the MiniPay-hook path to the
  project's Data Sources for activity tracking. Drive first real subscribers (on-chain fees are scored).

### Later — MiniPay Discovery intake
- Once live + polished, submit Stage-1 intake at `https://minipay.to/mini-apps`. Pre-listing checklist: `.agents/skills/celopedia-skill/references/minipay-requirements.md`.

## 7. Environment variables (NAMES only — never commit values)

- **contracts/.env:** `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`, `ETHERSCAN_API_KEY`, `CELO_RPC`, `CELO_SEPOLIA_RPC`, `PROXY_ADDRESS`, (Sepolia) `USDM_ADDRESS`/`USDC_ADDRESS`/`USDT_ADDRESS`.
- **backend/.env:** `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_POOLER_URL` (session pooler — used only to run DDL/migrations; the direct DB host is IPv6-only), `OPENROUTER_API_KEY`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `NEWS_RSS_FEEDS`, `CELO_CHAIN`, `CELO_RPC`, `SUBSCRIPTION_CONTRACT_ADDRESS`, `EVENT_INDEXER_FROM_BLOCK`, `FRONTEND_URL`, `SUMMARY_FREE_DAILY_LIMIT`.
- **frontend/.env:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT`, `NEXT_PUBLIC_SUPPORT_URL`.

## 8. Gating model (reminder)

MiniPay forbids message signing, so the backend gates AI summaries by reading on-chain
`isActive(address)` for the MiniPay-provided address (server read-gate). Free tier = N summaries/day
(`SUMMARY_FREE_DAILY_LIMIT`, default 3); active subscriber = unlimited. Over-quota → HTTP 402
`{ code: "summary_quota_exceeded" }`. Accepted low-risk address-spoofing tradeoff for news content.
