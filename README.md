# MiniCeliq — Stablecoin News Subscriptions on MiniPay

A self-contained **MiniPay (Celo) mini app**: subscribe to a curated **crypto + macro** news feed
with AI-generated summaries, paying a recurring fee in **stablecoins** (USDm / USDC / USDT). The
subscription is recorded **on-chain** by an **upgradeable (UUPS)** contract that **never custodies
funds** — payment is pulled straight from the user to the treasury in the same transaction.

Built for the Celo **Proof of Ship** program. Shares branding with [Celiq](https://celiq.io) only —
**no shared code, data, auth, or runtime.**

## ▸ Live

| | |
|---|---|
| **App** | **https://mini.celiq.io** (open inside MiniPay) |
| **Backend** | `https://miniceliq-backend-production.up.railway.app` |
| **Repo** | https://github.com/ghozzza/MiniCeliq |

**On Celo Mainnet (chainId 42220) — all verified on Celoscan:**

| Contract | Address |
|---|---|
| `NewsSubscription` (UUPS proxy) | [`0x3988b17eb4134eB929118244Be69798b5dF69ce7`](https://celoscan.io/address/0x3988b17eb4134eb929118244be69798b5df69ce7) |
| `Ceny` reward token (CENY, UUPS proxy) | [`0xFacb8Ba3daC93785689CBF0418b9Ad664a25d6aB`](https://celoscan.io/address/0xfacb8ba3dac93785689cbf0418b9ad664a25d6ab) |

---

## What it is

| | |
|---|---|
| **Who** | MiniPay's 16M+ users in emerging markets (Nigeria, Kenya, Colombia, Vietnam, …) |
| **What** | A micro-subscription to curated crypto + macro news with AI summaries |
| **Why stablecoins** | A digital-dollar subscription (launch promo **$0.10/mo**, then **$5/mo**) is accessible where a $10+/mo Western news plan is not |
| **Why on-chain** | The subscription is a verifiable on-chain pass; every renewal is a real stablecoin transaction |

- **Free tier** — full headline list + a few AI summaries per day.
- **Premium tier** (on-chain subscriber) — unlimited AI summaries.
- **Pricing** — Monthly **$5**, Yearly **$50**, charged in the user's stablecoin. A **launch promo of
  $0.10/month** runs until **2026-06-30 (UTC)**, enforced **on-chain and time-boxed** (auto-reverts to
  the regular price after the cutoff — no manual action needed).

---

## How it works

```
            MiniPay (Opera) in-app browser ── window.ethereum (isMiniPay)
                          │
              ┌───────────▼────────────┐
              │  Frontend (Next.js)     │   Vercel → mini.celiq.io
              │  viem + Tailwind        │
              │  - zero-click connect   │
              │  - feed / AI summaries  │◄──── REST ────┐
              │  - subscribe() tx       │               │
              └─────┬──────────────┬────┘               │
                    │              │                     │
     approve+subscribe tx     read on-chain      ┌───────▼──────────┐
                    │       isActive(address)    │ Backend (Express) │  Railway
          ┌─────────▼──────────────▼───┐         │  - RSS ingest     │
          │  NewsSubscription (UUPS)    │         │  - AI summaries   │
          │  Celo Mainnet               │◄────────┤  - on-chain reads │
          │  - subscribe(plan, token)   │  viem   │  - event indexer  │
          │  - isActive(user)           │ public  └────────┬──────────┘
          │  - NO custody → treasury    │  client          │
          │  - mints CENY reward (V2)   │            ┌──────▼──────┐
          └──────────────┬──────────────┘            │  Supabase   │  (own project)
                  stablecoin → treasury               │  cache + idx │
                                                       └─────────────┘
```

**Subscribe flow** (two legacy txs — MiniPay can't sign typed data, so no `permit`):
1. `approve(NewsSubscription, currentPrice)` on the chosen stablecoin
2. `subscribe(plan, token)` → contract pulls the price straight to the treasury, sets/stacks the
   expiry, and **auto-mints a CENY reward** to the subscriber.

Gating: MiniPay forbids message signing, so premium content is gated by a server-side read of on-chain
`isActive(address)` (an accepted low-risk tradeoff for news content — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

---

## Smart contracts

**`NewsSubscription`** — non-custodial, UUPS-upgradeable subscription registry.
- **No custody:** `subscribe()` uses `safeTransferFrom(user → treasury)` in the same tx (CEI ordering); contract balance stays ~0.
- **No `require`:** every guard is `if (cond) revert CustomError(...)`.
- **Role-based access control** (not Ownable): `DEFAULT_ADMIN_ROLE` / `MANAGER_ROLE` / `UPGRADER_ROLE`.
- **Multi-token / multi-plan** with prices **seeded in the initializer**, all adjustable via setters; renewals stack; on-chain time-boxed promo.
- Now on **V2**, which **auto-mints a CENY reward on every subscribe** (10 CENY monthly / 120 CENY yearly, adjustable) — best-effort (`try/catch`), so a reward-mint failure can never block a paid subscription.

**`Ceny` (CENY)** — ERC-20, capped (1,000,000,000), UUPS, AccessControl reward token. The
`NewsSubscription` proxy holds its `MINTER_ROLE`. The reward is surfaced in the app: a **"+ Earn N CENY"**
chip in the subscribe sheet and a **CENY balance pill** in the masthead.

Source: [`contracts/src/`](contracts/src/) · Security review (pashov 12-lens + Celo layer, 0 confirmed
findings): [`contracts/audit/`](contracts/audit/) · **42 Foundry tests pass.**

---

## MiniPay compliance (built in)

- **Zero-click connect** — no "Connect Wallet" button inside MiniPay; the address is read from the injected provider.
- **No message signing** (`personal_sign` / `eth_signTypedData`) → no SIWE / `permit`.
- **Legacy transactions only** + **fee abstraction** (CIP-64 `feeCurrency`); **never CELO**, only USDm / USDC / USDT (correct decimals + fee-currency adapters).
- Mobile-first (360×640), **JS bundle < 2 MB** (~284 KB gzip — raw viem, no wagmi).
- MiniPay copy terms (Network fee / Deposit / Withdraw / Stablecoin), Deposit deeplink on low balance, in-app Support, Terms + Privacy, name + logo distinct from MiniPay.
- External article links open in place inside MiniPay's webview with no back button, so the article view offers **Copy original link** instead of navigating out.

---

## Tech stack

| Layer | Choice |
|---|---|
| **Contracts** | Solidity `^0.8.24`, OpenZeppelin Upgradeable v5 (UUPS), **Foundry** + OZ Foundry Upgrades |
| **Frontend** | Next.js (App Router) + **viem** (raw) + Tailwind → **Vercel** |
| **Backend** | Express 4 + TypeScript → **Railway** |
| **Data** | Supabase (own project) — news + summary cache, event index |
| **News / AI** | Free RSS (CoinDesk, Cointelegraph, Decrypt) + Vercel AI SDK via OpenRouter |

---

## Run locally

Each of `contracts/`, `backend/`, `frontend/` is a standalone project with its own `package.json` and `.env.example`.

```bash
# Contracts (Foundry) — see contracts/README.md for the pinned `forge install` deps
cd contracts && forge clean && forge build && forge test

# Backend (http://localhost:4000) — copy .env.example → .env first
cd backend && pnpm install && pnpm dev

# Frontend (http://localhost:3000) — copy .env.example → .env.local first
cd frontend && pnpm install && pnpm dev
```

To test inside MiniPay on a phone during local dev, expose both servers with a tunnel (e.g.
`cloudflared tunnel --url http://localhost:3000`) and point `NEXT_PUBLIC_API_URL` at the backend tunnel.
The hosted stack (Vercel + Railway) needs no tunnel.

---

## Repo layout

```
miniapps/
├── contracts/   ← Foundry + OpenZeppelin Upgradeable (NewsSubscription, Ceny)
├── backend/     ← Express + TypeScript (RSS ingest, AI summaries, chain reads, indexer)
├── frontend/    ← Next.js + viem (MiniPay mini app)
└── docs/        ← STATUS (status & resume) · DEPLOYMENT (addresses & runbook)
```

## Docs

- [`docs/STATUS.md`](docs/STATUS.md) — current status, roadmap, and a cold-resume guide.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — live addresses, on-chain interface, admin runbook, deploy steps.
- [`CLAUDE.md`](CLAUDE.md) — repo guidance for contributors/agents.

All docs and code comments are in **English** (Proof of Ship requirement).
