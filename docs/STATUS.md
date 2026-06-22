# MiniCeliq — Project Status & Resume Guide

_Last updated: 2026-06-22._ Detailed handover so work can resume cold (e.g. after a machine
restart). For design rationale see [`../README.md`](../README.md); for repo rules see
[`../CLAUDE.md`](../CLAUDE.md).

---

## 1. Snapshot — where we are

**Phase: contract LIVE + verified on Celo mainnet. FE/BE not yet hosted.**

**Live contract (Celo mainnet, chainId 42220):** proxy `0x3988b17eb4134eB929118244Be69798b5dF69ce7`
· impl `0xa0e3B8672f628B0146E23382845b0625A4D2F722` · deploy block `70222870` · admin/treasury
`0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` · both verified on Celoscan. Details: `contracts/deployments/celo-mainnet.json`.

| Area | State |
|------|-------|
| Smart contract | ✅ Built (Foundry, UUPS, AccessControl, non-custodial), **20 tests pass**, security-reviewed + hardened. |
| On-chain deploy | ✅ **Celo mainnet + verified** — proxy `0x3988…69ce7` (block 70222870). PoS hard-gate ✅ |
| Frontend | ✅ Built (Next.js + viem, MiniPay-compliant), `pnpm build` clean, ~289 KB gzip. Local `.env.local` wired to the live contract. |
| Backend | ✅ Built (Express + TS), `pnpm build` clean. Local `.env` wired to the live contract (chain reads active). |
| Security audit | ✅ pashov 12-lens + Celo layer — **0 confirmed findings**, 3 hardening items applied (`contracts/audit/`). |
| Live URLs (Vercel/Railway) | ⬜ Pending. **PoS hard-gate.** |
| Supabase / OpenRouter | ⬜ Pending (BE runs without them, degraded). |
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
cd ../frontend && pnpm install && pnpm dev   # http://localhost:3000 (open via ngrok in MiniPay to test)

# Backend
cd ../backend && pnpm install && pnpm dev    # http://localhost:4000 (boots without secrets, degraded)
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

### M4 — Deploy contract (needs Ghoza: funded key + RPC + Etherscan key)
1. `cd contracts`, copy `.env.example` → `.env`, fill `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`, `ETHERSCAN_API_KEY`, `CELO_RPC`, `CELO_SEPOLIA_RPC`. Fund deployer with testnet CELO (https://faucet.celo.org/celo-sepolia).
2. **Sepolia first:** `forge script script/Deploy.s.sol --rpc-url "$CELO_SEPOLIA_RPC" --broadcast --ffi -vvvv` → note the proxy address → set `PROXY_ADDRESS` in `.env`.
3. On Sepolia, set `USDM_ADDRESS`/`USDC_ADDRESS`/`USDT_ADDRESS` in `.env` to testnet token addrs (FeeCurrencyDirectory `getCurrencies()`), then `forge script script/Configure.s.sol --rpc-url "$CELO_SEPOLIA_RPC" --broadcast --ffi`.
4. Test end-to-end in MiniPay (ngrok the frontend, set the proxy address).
5. **Mainnet:** same with `--rpc-url "$CELO_RPC"` (mainnet token addrs are baked in). Verify on Celoscan: `forge verify-contract <impl> NewsSubscription --chain celo --watch` (also the proxy). Collect a sample tx hash per user-facing method (MiniPay needs this).
6. **Migrate ownership to a Safe multisig** after mainnet deploy.

### M5 — Wire backend + frontend, go live
- **Backend (Railway):** create a new standalone Supabase project + tables (`news_cache`, `news_summaries`, `summary_views`, `subscribed_events` — schema in `backend/README.md`). Set env (§7), `EVENT_INDEXER_FROM_BLOCK` = deploy block. `railway up` from `backend/`.
- **Frontend (Vercel):** set `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT` (lowercase — viem EIP-55 trap), `NEXT_PUBLIC_API_URL` (Railway URL), `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SUPPORT_URL`. Replace `public/logo.svg` placeholder. `vercel --prod` from `frontend/`.

### M6 — Proof of Ship submission
- Public GitHub ✅ (done). Live app URL (Vercel) + contract on **mainnet** + register the project on **Talent App** (`https://talent.app/~/earn/celo-proof-of-ship`). Add the MiniPay-hook path to the project's Data Sources for activity tracking. Drive first real subscribers (on-chain fees are scored).

### Later — MiniPay Discovery intake
- Once live + polished, submit Stage-1 intake at `https://minipay.to/mini-apps`. Pre-listing checklist: `.agents/skills/celopedia-skill/references/minipay-requirements.md`.

## 7. Environment variables (NAMES only — never commit values)

- **contracts/.env:** `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`, `ETHERSCAN_API_KEY`, `CELO_RPC`, `CELO_SEPOLIA_RPC`, `PROXY_ADDRESS`, (Sepolia) `USDM_ADDRESS`/`USDC_ADDRESS`/`USDT_ADDRESS`.
- **backend/.env:** `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `NEWS_RSS_FEEDS`, `CELO_CHAIN`, `CELO_RPC`, `SUBSCRIPTION_CONTRACT_ADDRESS`, `EVENT_INDEXER_FROM_BLOCK`, `FRONTEND_URL`, `SUMMARY_FREE_DAILY_LIMIT`.
- **frontend/.env:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT`, `NEXT_PUBLIC_SUPPORT_URL`.

## 8. Gating model (reminder)

MiniPay forbids message signing, so the backend gates AI summaries by reading on-chain
`isActive(address)` for the MiniPay-provided address (server read-gate). Free tier = N summaries/day
(`SUMMARY_FREE_DAILY_LIMIT`, default 3); active subscriber = unlimited. Over-quota → HTTP 402
`{ code: "summary_quota_exceeded" }`. Accepted low-risk address-spoofing tradeoff for news content.
