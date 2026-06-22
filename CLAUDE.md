# MiniCeliq — Repo Guidance

MiniCeliq is a **MiniPay (Celo) mini app** for stablecoin news subscriptions, built for the
**Celo Proof of Ship** program. Standalone repo — **independent of any other codebase**.

> **Full status, roadmap, and resume/deploy steps:** [`docs/STATUS.md`](docs/STATUS.md).
> **Architecture & design rationale:** [`README.md`](README.md).
> **Language:** all docs & code comments in **English** (Proof of Ship requirement).

## Layout (three standalone sub-projects)

| Dir | Stack | Deploy | Build / test |
|-----|-------|--------|--------------|
| `contracts/` | Foundry + OpenZeppelin Upgradeable v5 (UUPS) | Celo (live on Mainnet, **V2**) | `forge build` · `forge test` (**42 pass** — `NewsSubscriptionV2` 11 + `NewsSubscription` V1 20 + `Ceny` 11) |
| `frontend/` | Next.js 16 (App Router) + TypeScript + Tailwind + **viem** | Vercel (**live: `https://miniceliq.vercel.app`**) | `pnpm install` · `pnpm build` |
| `backend/` | Express 4 + TypeScript + viem + Supabase | IDCloudHost VPS | `pnpm install` · `pnpm build` |

Each sub-project has its own `package.json` / lockfile / `.env.example`. `contracts/lib/` is
git-ignored — run the pinned `forge install` commands in `contracts/README.md` after clone.

## The contract — `NewsSubscription` (UUPS, non-custodial)

- `subscribe(uint8 plan, address token)` — plan 0 = monthly, 1 = yearly. Pulls `currentPrice` from the
  caller straight to `treasury` (**never custodies funds**). Caller must `approve` first (no permit —
  MiniPay can't sign typed data). Effects-before-interaction (CEI).
- `isActive(address) → bool`, `currentPrice(address token, uint8 plan) → uint256` (promo-aware, time-boxed).
- Custom errors only (no `require`). Pausable + ReentrancyGuard. **Role-based access control** (not Ownable):
  `DEFAULT_ADMIN_ROLE` manages roles, `MANAGER_ROLE` gates config, `UPGRADER_ROLE` gates upgrades + the V2 reinitializer.
- `initialize(admin, treasury, promoEndsAt, InitToken[])` **seeds** the allowlist + regular/promo prices at deploy;
  all stay adjustable via `setPrice` / `setPromoPrice` / `setPromoEndsAt` / `setAllowedToken`.
- On-chain time-boxed promo: `promoPrice` + `promoEndsAt` (auto-reverts to regular price).
- **Live proxy now runs V2** (`NewsSubscriptionV2`, impl `0xadf8…76c2`): each `subscribe` best-effort
  mints a CENY reward to the subscriber (see reward-token section). V1 subscriber state + pricing/promo
  were preserved through the upgrade (OZ storage-layout validated). `contracts/test/mocks/NewsSubscriptionV2.sol`
  remains the earlier test-only upgrade fixture that proved the path.
- Reviewed (pashov 12-lens + Celo layer): **0 confirmed findings**, 3 hardening items applied. See `contracts/audit/`.
- **Admin/role key vs deployer key:** all roles (`DEFAULT_ADMIN` / `MANAGER` / `UPGRADER`) are held by
  the admin key **`0x02EF…7E45`**, which is **different from** the deployer/gas key **`0xA323…Ce49`** in
  `contracts/.env`. Every upgrade + role grant must be **signed by `0x02EF`** (via a `cast wallet`
  keystore + `--account`, never a plaintext key) — the deployer key cannot authorize upgrades.

## The reward token — `Ceny` (CENY) — LIVE

- ERC-20, **capped** (1,000,000,000 CENY, 18 decimals), **UUPS upgradeable**, **AccessControl**
  (`DEFAULT_ADMIN_ROLE` / `MINTER_ROLE` / `UPGRADER_ROLE`). Has an EIP-712 signature-claim path.
- **Live + verified on Celo mainnet:** proxy `0xFacb8Ba3daC93785689CBF0418b9Ad664a25d6aB`, impl
  `0x20952EACBd5325342c8a57E68dcEE0251aeb5e8f`, admin `0x02EF…7E45`. 11 forge tests pass.
- **Reward integration is LIVE (V2):** the `NewsSubscription` proxy holds Ceny's `MINTER_ROLE`, and every
  `subscribe` auto-mints **10 CENY** (plan 0 / monthly) / **120 CENY** (plan 1 / yearly) to the subscriber.
  The mint is **best-effort** (try/catch — a mint failure never blocks the paid subscription) and
  **adjustable** via `setCenyReward` / `setCenyToken` (MANAGER_ROLE).

## Data layer — Supabase (live)

- Supabase is the backend's only data store (its own project — not Celiq's): tables `news_cache`
  (incl. a `content` column), `news_summaries`, `summary_views`, `subscribed_events`. **RLS enabled
  with no policies** → only the service-role key (the BE) can read/write.
- **DDL/migrations run via the session pooler** (`SUPABASE_DB_POOLER_URL`), because the direct DB host
  is IPv6-only. Schema committed at `backend/supabase/schema.sql`. AI summaries are content-based
  (RSS body) and refusal-proof for thin feeds.

## MiniPay hard rules (enforce in any FE change)

- **Zero-click connect** — no "Connect Wallet" button when `window.ethereum.isMiniPay === true`.
- **No message signing** (`personal_sign` / `eth_signTypedData`) anywhere → no SIWE / permit.
- **Legacy tx only** — never set `maxFeePerGas` / `maxPriorityFeePerGas`; use `feeCurrency` (CIP-64).
- **Tokens: USDm / USDC / USDT only, never CELO.** USDC/USDT `feeCurrency` uses the **adapter** address.
- **Copy:** "Network fee", "Deposit", "Withdraw", "Stablecoin" — never gas/onramp/offramp/crypto.
- Mobile-first, must work at **360×640**; JS bundle **< 2 MB**; images SVG/WebP.
- **External-link gotcha:** MiniPay's webview opens external links **in place with no back button** —
  navigating out traps the user. **Never link out of the app.** The article view shows a **"Copy original
  link"** button instead of an open-in-browser link. (Support uses a `mailto:` which MiniPay hands off
  cleanly.)

## Networks & tokens (mainnet)

- Celo Mainnet `42220` (`https://forno.celo.org`) · Celo Sepolia `11142220` (`https://forno.celo-sepolia.celo-testnet.org`).
- USDm `0x765DE816845861e75A25fCA122bb6898B8B1282a` (18) · USDC `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6) · USDT `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (6).
- feeCurrency adapters: USDm = itself · USDC `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` · USDT `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72`.
- Sepolia token addresses differ — fetch from FeeCurrencyDirectory `0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276` `getCurrencies()`.

## Conventions

- Keep the `NewsSubscription` ABI consistent across `contracts/`, `frontend/lib/contract.ts`, and
  `backend/src/services/chain.ts`. If you change a contract signature, update both clients.
- Backend & frontend degrade gracefully when secrets are unset (503 / mocks) — keep that.
- Reference knowledge (Celo/MiniPay): `.agents/skills/celopedia-skill` (git-ignored, local only).
- Git: explicit `git add <path>` only (never `git add .`); run `git status` before committing.
