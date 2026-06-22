# MiniCeliq — Repo Guidance

MiniCeliq is a **MiniPay (Celo) mini app** for stablecoin news subscriptions, built for the
**Celo Proof of Ship** program. Standalone repo — **independent of any other codebase**.

> **Full status, roadmap, and resume/deploy steps:** [`docs/STATUS.md`](docs/STATUS.md).
> **Architecture & design rationale:** [`README.md`](README.md).
> **Language:** all docs & code comments in **English** (Proof of Ship requirement).

## Layout (three standalone sub-projects)

| Dir | Stack | Deploy | Build / test |
|-----|-------|--------|--------------|
| `contracts/` | Foundry + OpenZeppelin Upgradeable v5 (UUPS) | Celo (Sepolia → Mainnet) | `forge build` · `forge test` (19 pass) |
| `frontend/` | Next.js 16 (App Router) + TypeScript + Tailwind + **viem** | Vercel | `pnpm install` · `pnpm build` |
| `backend/` | Express 4 + TypeScript + viem + Supabase | Railway | `pnpm install` · `pnpm build` |

Each sub-project has its own `package.json` / lockfile / `.env.example`. `contracts/lib/` is
git-ignored — run the pinned `forge install` commands in `contracts/README.md` after clone.

## The contract — `NewsSubscription` (UUPS, non-custodial)

- `subscribe(uint8 plan, address token)` — plan 0 = monthly, 1 = yearly. Pulls `currentPrice` from the
  caller straight to `treasury` (**never custodies funds**). Caller must `approve` first (no permit —
  MiniPay can't sign typed data). Effects-before-interaction (CEI).
- `isActive(address) → bool`, `currentPrice(address token, uint8 plan) → uint256` (promo-aware, time-boxed).
- Custom errors only (no `require`). Pausable, ReentrancyGuard, `onlyOwner` admin + `_authorizeUpgrade`.
- On-chain time-boxed promo: `promoPrice` + `promoEndsAt` (auto-reverts to regular price).
- Reviewed (pashov 12-lens + Celo layer): **0 confirmed findings**, 3 hardening items applied. See `contracts/audit/`.

## MiniPay hard rules (enforce in any FE change)

- **Zero-click connect** — no "Connect Wallet" button when `window.ethereum.isMiniPay === true`.
- **No message signing** (`personal_sign` / `eth_signTypedData`) anywhere → no SIWE / permit.
- **Legacy tx only** — never set `maxFeePerGas` / `maxPriorityFeePerGas`; use `feeCurrency` (CIP-64).
- **Tokens: USDm / USDC / USDT only, never CELO.** USDC/USDT `feeCurrency` uses the **adapter** address.
- **Copy:** "Network fee", "Deposit", "Withdraw", "Stablecoin" — never gas/onramp/offramp/crypto.
- Mobile-first, must work at **360×640**; JS bundle **< 2 MB**; images SVG/WebP.

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
