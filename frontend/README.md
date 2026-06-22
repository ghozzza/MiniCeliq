# MiniCeliq — Frontend

MiniPay (Celo) mini app for stablecoin & macro news subscriptions. Next.js (App
Router) + TypeScript + Tailwind + **viem** (no wagmi/RainbowKit, to keep the JS
bundle well under MiniPay's 2 MB limit).

Independent of the main Celiq app — shares branding only, no code/auth/data.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- Tailwind CSS v4
- viem (chain reads + writes, CIP-64 `feeCurrency` fee abstraction)
- pnpm

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
```

### Environment variables (`.env.local`)

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (feed / summaries / stats). Blank → built-in mocks. |
| `NEXT_PUBLIC_CHAIN` | `celo` (mainnet 42220) or `celoSepolia` (testnet 11142220). |
| `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT` | Deployed `NewsSubscription` proxy. `0x0…0` keeps subscriptions disabled in-UI. |
| `NEXT_PUBLIC_SUPPORT_URL` | In-app support channel (MiniPay requirement). |

## Commands

```bash
pnpm dev      # local dev server (http://localhost:3000)
pnpm build    # production build (type-check + lint clean required)
pnpm start    # serve the production build
pnpm lint     # eslint
```

## Testing inside MiniPay

The app only fully activates when `window.ethereum.isMiniPay === true` (zero-click
connect). Outside MiniPay it shows an "Open in MiniPay" fallback (never a Connect
Wallet button). To test on a real device, expose `pnpm dev` via a tunnel (e.g.
ngrok) and open the URL inside MiniPay's Mini Apps browser. Verify at **360×640**.

## MiniPay compliance built in

- Zero-click connect; no Connect Wallet button inside MiniPay.
- No message signing (no `personal_sign` / `eth_signTypedData`); subscribe is two
  legacy txs (approve → subscribe), no `permit()`.
- Legacy txs only — `feeCurrency` (CIP-64), never `maxFeePerGas`.
- Tokens: USDm (18) / USDC (6) / USDT (6) only; USDC/USDT use fee-currency
  **adapter** addresses. CELO never shown or required.
- Copy uses Network fee / Deposit / Withdraw / Stablecoin.
- Low balance in all three tokens → Deposit deeplink, not an error.
- In-app Support link, Terms, Privacy; name + logo distinct from MiniPay.
- Read-only `/stats` page (no wallet required) for the listing requirement.

## Structure

```
app/        page (feed+paywall), stats, terms, privacy, layout
components/  Feed, SummaryCard, SubscribeSheet, Paywall, SupportLink
hooks/       useMiniPay (zero-click connect), useSubscription (isActive)
lib/         viem, stablecoins, contract, api (BE + mock fallback), copy
types/       ethereum.d.ts (window.ethereum.isMiniPay)
```
