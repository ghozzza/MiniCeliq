# MiniCeliq — A MiniPay Mini App for Stablecoin News Subscriptions

> **Name:** MiniCeliq (the MiniPay edition). Shares branding with Celiq only — **no shared code,
> data, auth, or runtime**.
> **Status:** Contract live on Celo mainnet (**V2 — auto-mints a CENY reward on subscribe**) + verified; **Ceny (CENY) reward token live + verified**; **frontend live on Vercel** (`https://miniceliq.vercel.app`, custom domain `mini.celiq.io` pending DNS); backend still runs locally (cloudflared tunnel) with VPS hosting pending. Live status & resume steps: [`docs/STATUS.md`](docs/STATUS.md).
> **Target:** Celo **Proof of Ship** (MiniPay track) + MiniPay Discovery listing.
> **Language policy:** All docs and code comments in **English** (Proof of Ship requirement).

A self-contained mini app that lets MiniPay users subscribe to a curated **crypto + macro**
news feed with AI-generated summaries, paying a recurring fee in **stablecoins**
(USDm / USDC / USDT). The subscription is recorded **on-chain** by an **upgradeable (UUPS)**
smart contract that **never custodies funds** — payment is pulled straight from the user to a
treasury address in the same transaction.

This mini app is **fully independent of the existing Celiq app** (separate frontend, backend,
contract, deploys, and data store). It lives inside `CeliqAI/miniapps/` only as a sibling
directory; despite the name it shares no code, auth, database, or runtime with Celiq.

**Pricing (decided):** Monthly **$5**, Yearly **$50** — with a **Proof of Ship launch promo of
$0.10/month** until **2026-06-30 (UTC)**. The promo is enforced **on-chain and time-boxed**: it
auto-reverts to the regular price after the cutoff, no manual action required at the deadline.

---

## 1. Concept

| | |
|---|---|
| **Who** | MiniPay's 16M+ users in emerging markets (Nigeria, Kenya, Colombia, Vietnam, …) |
| **What** | Micro-subscription to curated crypto + macro news + AI summaries |
| **Why stablecoins** | A digital-dollar subscription (launch promo **$0.10/mo**, then **$5/mo**) is accessible where a $10+/mo Western news plan is not |
| **Why on-chain** | The subscription is a verifiable on-chain pass; renewals are real stablecoin transactions (Proof of Ship counts on-chain activity) |
| **Category** | Content / News (a valid MiniPay Mini App category) |

**Free tier:** full headline list + a small daily quota of AI summaries.
**Premium tier (on-chain subscriber):** unlimited AI summaries + a daily curated brief.

> This freemium split mirrors a pattern already validated in Celiq (full list to everyone,
> AI summary gated), but here the gate is an **on-chain subscription** instead of an app account.

---

## 2. Hard constraints (verified against celopedia-skill + MiniPay/Celo docs)

These are non-negotiable and shape every layer. Sources: `miniapps/.agents/skills/celopedia-skill/references/*`.

### MiniPay environment
- **Zero-click connect** — never show a "Connect Wallet" button when `window.ethereum.isMiniPay === true`. Auto-read the address from the injected provider.
- **No message signing** — `personal_sign` / `eth_signTypedData` are **not supported**. This rules out SIWE and ERC-2612 `permit()` (typed-data) flows. Authentication and approvals must work without signatures.
- **Legacy transactions only** — do **not** set `maxFeePerGas` / `maxPriorityFeePerGas`. Use `feeCurrency` (CIP-64) instead.
- **Fee abstraction** — users pay the network fee in a stablecoin; **never display or require CELO**. Only **viem** supports the `feeCurrency` field (ethers/web3 do not) → viem is mandatory.
- **Token scope** — only **USDm, USDC, USDT**. Adapt to the user's highest-balance stablecoin.
- **2 MB JS bundle limit** — keep dependencies minimal (this is why we use raw viem, not wagmi/RainbowKit).
- **360 × 640 mobile** — design and verify at this resolution.
- **UI copy rules (enforced at review):** `Gas`→**Network fee**, `Onramp/Buy`→**Deposit**, `Offramp/Sell`→**Withdraw**, `Crypto`→**Stablecoin** / **Digital dollar**, never raw `0x…` as the primary identifier.

### Proof of Ship qualification (hard gates)
- ✅ At least one contract deployed on **Celo Mainnet** (not just testnet).
- ✅ **Public GitHub** repo with real commits.
- ✅ **Live, functional** app URL.
- ✅ Registered on **Talent App** for the active campaign (`talent.app/~/earn/celo-proof-of-ship`).
- 🟡 MiniPay `isMiniPay()` hook = scoring booster (include the hook path in Talent App Data Sources for tracking).

---

## 3. Architecture

```
                MiniPay (Opera) in-app browser  ── window.ethereum (isMiniPay)
                              │
                  ┌───────────▼────────────┐
                  │  Frontend (Next.js)     │   Vercel
                  │  viem + Tailwind        │
                  │  - isMiniPay detect     │
                  │  - auto-connect         │
                  │  - read feed / summaries│◄──── REST ────┐
                  │  - subscribe() tx       │               │
                  └─────┬──────────────┬────┘               │
                        │              │                     │
         approve+subscribe tx     read on-chain      ┌───────▼─────────┐
                        │       isActive(address)    │ Backend (Express)│  Railway
                        │              │             │  - RSS ingest    │
              ┌─────────▼──────────────▼───┐         │  - AI summaries  │
              │  NewsSubscription (UUPS)    │         │  - on-chain read │
              │  Celo Mainnet / Sepolia     │◄────────┤  - analytics idx │
              │  - subscribe(plan, token)   │  viem   │  - cron jobs     │
              │  - isActive(user)           │ public  └───────┬─────────┘
              │  - NO custody → treasury    │  client         │
              └──────────────┬──────────────┘          ┌──────▼──────┐
                             │                          │  Supabase   │  (own project)
                      stablecoin → treasury EOA         │  news cache │
                                                        │  summaries  │
                                                        │  analytics  │
                                                        └─────────────┘
```

### Folder layout (`CeliqAI/miniapps/`)

```
miniapps/
├── README.md                ← this document (master plan)
├── contracts/               ← Foundry + OpenZeppelin Upgradeable (UUPS)
│   ├── src/
│   │   ├── NewsSubscription.sol
│   │   └── mocks/MockERC20.sol
│   ├── script/Deploy.s.sol               (seeds prices in the initializer)
│   ├── test/NewsSubscription.t.sol
│   ├── test/mocks/NewsSubscriptionV2.sol (test-only UUPS upgrade fixture)
│   ├── audit/                            (pashov security review)
│   ├── lib/ (forge-std, openzeppelin-contracts[-upgradeable], openzeppelin-foundry-upgrades)
│   ├── foundry.toml  remappings.txt
│   └── .env.example
├── backend/                 ← Express + TS (standalone, Railway)
│   ├── src/
│   │   ├── app.ts  server.ts
│   │   ├── config/env.ts            (Zod, fail-fast)
│   │   ├── routes/{health,news,summary,subscription,stats}.ts
│   │   ├── services/{rssNews,aiSummary,chain,analytics}.ts
│   │   ├── jobs/{newsIngest,eventIndexer}.ts
│   │   ├── lib/{supabase,viem}.ts
│   │   ├── middleware/{errorHandler,rateLimiter}.ts
│   │   └── types/
│   ├── .env.example
│   └── package.json
├── frontend/                ← Next.js (App Router) + viem (Vercel)
│   ├── app/{page.tsx,layout.tsx,terms/page.tsx,privacy/page.tsx}   (Stats page removed)
│   ├── components/{Feed,SummaryCard,SubscribeSheet,Paywall,SupportLink}.tsx
│   ├── hooks/{useMiniPay,useSubscription}.ts
│   ├── lib/{viem,stablecoins,contract,api,copy}.ts
│   ├── .env.example
│   └── package.json
└── .agents/skills/celopedia-skill   ← already installed (reference knowledge)
```

Each of `contracts/`, `backend/`, `frontend/` is a **standalone project** with its own
`package.json` + lockfile + deploy target — matching the repo's existing pattern
(`frontend/` and `backend/` are already independent, not a workspace).

---

## 4. Tech stack & rationale

| Layer | Choice | Why |
|------|--------|-----|
| **Contract lang** | Solidity `^0.8.24`, OpenZeppelin **Contracts Upgradeable v5** | v5 is custom-error native; UUPS modules are battle-tested |
| **Contract tooling** | **Foundry** + OpenZeppelin Contracts Upgradeable v5 + **OpenZeppelin Foundry Upgrades** | Fast Solidity-native tests + scripts; `Upgrades.deployUUPSProxy` / `Upgrades.upgradeProxy` still validate UUPS storage-layout safety (requires `ffi`, `ast`, `build_info` in `foundry.toml`). |
| **Frontend** | **Next.js (App Router)** + **viem** (raw, no wagmi) + Tailwind | viem is the only SDK with native `feeCurrency`; dropping wagmi/RainbowKit keeps the bundle under 2 MB |
| **Backend** | **Express 4 + TypeScript** | Mirrors the conventions the team already runs in Celiq's BE (Zod env, errorHandler, service/route split) without sharing code |
| **On-chain reads** | viem `publicClient` | `isActive()`, event indexing for `/stats` |
| **Data store** | **Supabase (own, new project)** | News cache, AI-summary cache, analytics. Separate project from Celiq |
| **News source** | Free **RSS** (CoinDesk, Cointelegraph, Decrypt) via `rss-parser` | Free, proven (same approach Celiq uses), no API quota |
| **AI summaries** | Vercel **AI SDK** via OpenRouter | Same provider family the team already uses |
| **Reward token** | **Ceny (CENY)** — ERC-20, capped (1B), UUPS, AccessControl | **Live + verified on Celo mainnet** (proxy `0xFacb…d6aB`); auto-minted on `subscribe` via NewsSubscription **V2** (10 CENY monthly / 120 CENY yearly, best-effort) |
| **Deploy** | FE → **Vercel** (live at `https://miniceliq.vercel.app`; domain `mini.celiq.io` pending DNS), BE → **IDCloudHost VPS** (pending), contract → **Celo** | Manual-CLI deploy flow; contract live on mainnet (V2), FE live on Vercel |

---

## 5. Smart contract design — `NewsSubscription` (UUPS, no custody, custom errors)

**Design principles**
- **No custody.** `subscribe()` pulls the price via `safeTransferFrom(user → treasury)` in the same tx (effects-before-interaction / CEI). Contract balance stays ~0; it can never lock user funds.
- **No `require`.** Every guard is `if (cond) revert CustomError(...)` (cheaper, and self-documenting). OZ v5's own internals already use custom errors.
- **Upgradeable (UUPS).** Logic can evolve without migrating subscriber state. `_authorizeUpgrade` is `onlyRole(UPGRADER_ROLE)`.
- **Role-based access control** (not Ownable): `DEFAULT_ADMIN_ROLE` (manage roles) · `MANAGER_ROLE` (treasury/tokens/prices/promo/pause) · `UPGRADER_ROLE` (upgrades + the V2 reinitializer). `initialize` grants all three to `admin` — delegate/revoke later (e.g. to a multisig).
- **Multi-token, multi-plan.** Role-curated allowlist (USDm/USDC/USDT) and per-token, per-plan prices (decimals differ: USDm 18, USDC/USDT 6).
- **Prices seeded at deploy.** `initialize(admin, treasury, promoEndsAt, InitToken[])` sets the allowlist + regular/promo prices + cutoff up front; all stay adjustable via the setters.
- **Renewal stacks.** Renewing before expiry extends from the current expiry, not from now.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MiniCeliq subscription registry (non-custodial, UUPS-upgradeable).
/// @dev Abridged — full source (incl. _seedToken + setters): contracts/src/NewsSubscription.sol.
contract NewsSubscription is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ---- Custom errors (no `require`) ----
    error ZeroAddress();
    error TokenNotAllowed(address token);
    error InvalidPlan(uint8 plan);
    error PriceNotSet(address token, uint8 plan);
    error InvalidTreasury();

    struct InitToken { address token; uint256 monthlyPrice; uint256 yearlyPrice; uint256 monthlyPromo; }

    // ---- Storage (append-only on upgrade; do NOT reorder/remove) ----
    address public treasury;                                   // receives all payments
    mapping(uint8 => uint64)  public planDuration;             // plan => seconds
    mapping(address => bool)  public allowedToken;             // stablecoin allowlist
    mapping(address => mapping(uint8 => uint256)) public price;// token => plan => amount (token-native decimals)
    mapping(address => uint64) public subscriptionExpiry;      // user => unix expiry
    uint64  public promoEndsAt;                                // promo active while block.timestamp < this (0 = no promo)
    mapping(address => mapping(uint8 => uint256)) public promoPrice; // token => plan => promo amount (0 = use regular)
    uint256[43] private __gap;                                 // reserve room for future vars

    // ---- Events (the analytics / indexing surface) ----
    event Subscribed(address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry);
    event TreasuryUpdated(address treasury);
    event TokenAllowed(address indexed token, bool allowed);
    event PriceUpdated(address indexed token, uint8 indexed plan, uint256 amount);
    event PromoPriceUpdated(address indexed token, uint8 indexed plan, uint256 amount);
    event PromoEndsAtUpdated(uint64 endsAt);
    event PlanDurationUpdated(uint8 indexed plan, uint64 duration);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // implementation contract can never be initialized directly
    }

    function initialize(address admin, address treasury_, uint64 promoEndsAt_, InitToken[] calldata initialTokens)
        external
        initializer
    {
        if (admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert InvalidTreasury();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        treasury = treasury_;
        planDuration[0] = 30 days;   // plan 0 = monthly
        planDuration[1] = 365 days;  // plan 1 = yearly
        promoEndsAt = promoEndsAt_;
        for (uint256 i; i < initialTokens.length; i++) _seedToken(initialTokens[i]); // seed allowlist + prices
    }

    /// @notice Subscribe / renew. Pulls `price[token][plan]` from the caller straight to the treasury.
    /// @dev Caller must `approve(address(this), price)` on `token` first (no permit — MiniPay can't sign typed data).
    function subscribe(uint8 plan, address token) external nonReentrant whenNotPaused {
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        uint64 duration = planDuration[plan];
        if (duration == 0) revert InvalidPlan(plan);
        uint256 amount = currentPrice(token, plan); // promo-aware, time-boxed
        if (amount == 0) revert PriceNotSet(token, plan);

        // Effects before interaction (CEI): write expiry first; a transfer revert rolls it back.
        uint64 nowTs = uint64(block.timestamp);
        uint64 current = subscriptionExpiry[msg.sender];
        uint64 base = current > nowTs ? current : nowTs; // stack on top of an active sub
        uint64 newExpiry = base + duration;
        subscriptionExpiry[msg.sender] = newExpiry;

        // Interaction last. Non-custodial: funds never rest in this contract.
        IERC20(token).safeTransferFrom(msg.sender, treasury, amount);

        emit Subscribed(msg.sender, plan, token, amount, newExpiry);
    }

    /// @notice The read every gate uses (FE + BE).
    function isActive(address user) external view returns (bool) {
        return subscriptionExpiry[user] > block.timestamp;
    }

    /// @notice Effective price right now — returns the promo price while the promo window is open,
    ///         otherwise the regular price. The FE reads this to show the live amount.
    function currentPrice(address token, uint8 plan) public view returns (uint256) {
        uint256 promo = promoPrice[token][plan];
        if (promo != 0 && block.timestamp < promoEndsAt) return promo;
        return price[token][plan];
    }

    // ---- Admin (MANAGER_ROLE) ----
    function setTreasury(address t) external onlyRole(MANAGER_ROLE) {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }
    function setAllowedToken(address token, bool allowed_) external onlyRole(MANAGER_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed_;
        emit TokenAllowed(token, allowed_);
    }
    function setPrice(address token, uint8 plan, uint256 amount) external onlyRole(MANAGER_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (planDuration[plan] == 0) revert InvalidPlan(plan);
        price[token][plan] = amount;
        emit PriceUpdated(token, plan, amount);
    }
    function setPromoPrice(address token, uint8 plan, uint256 amount) external onlyRole(MANAGER_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (planDuration[plan] == 0) revert InvalidPlan(plan);
        promoPrice[token][plan] = amount; // 0 disables promo for this token/plan
        emit PromoPriceUpdated(token, plan, amount);
    }
    function setPromoEndsAt(uint64 endsAt) external onlyRole(MANAGER_ROLE) {
        promoEndsAt = endsAt; // promo auto-expires once block.timestamp >= endsAt
        emit PromoEndsAtUpdated(endsAt);
    }
    function setPlanDuration(uint8 plan, uint64 duration) external onlyRole(MANAGER_ROLE) {
        planDuration[plan] = duration;
        emit PlanDurationUpdated(plan, duration);
    }
    function pause() external onlyRole(MANAGER_ROLE) { _pause(); }
    function unpause() external onlyRole(MANAGER_ROLE) { _unpause(); }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
```

**Notes**
- `nonReentrant` + `SafeERC20` are defense-in-depth even though tokens are a role-curated allowlist.
- **CIP-64 caveat** (`security-patterns.md` §2): the gas fee is debited in the same stablecoin out-of-band, so never write balance-delta invariants. We don't — we pull a fixed `amount`, so accounting is unaffected.
- **Storage discipline:** UUPS requires append-only storage. The `__gap` reserves slots; the **OZ Foundry Upgrades** plugin *fails the upgrade* if a change is layout-unsafe. (A future hardening step is migrating to ERC-7201 namespaced storage.)
- **Access migration:** deploy with an EOA admin; before mainnet, grant `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE` to a **multisig (Safe)** and revoke them from the EOA.

### Deploy / verify (Foundry)

`script/Deploy.s.sol` deploys the UUPS proxy and **seeds prices in the initializer**
(`initialize(admin, treasury, promoEndsAt, InitToken[])`). Token addresses default to Celo Mainnet
and are env-overridable for Sepolia.

```bash
forge script script/Deploy.s.sol --rpc-url $CELO_SEPOLIA_RPC --broadcast --ffi   # Sepolia first
forge verify-contract <IMPL_ADDRESS> NewsSubscription --chain celo --watch        # then verify the proxy too
```

- `foundry.toml` sets `ffi`/`ast`/`build_info` so the OZ Foundry Upgrades plugin can enforce layout safety.
- Sepolia (`11142220`) first, then Mainnet (`42220`). Collect a sample tx hash per user-facing method (MiniPay requires this).
- viem **EIP-55** trap: store the deployed address lowercase or via `cast to-check-sum-address`.
- A real upgrade adds an actual V2 in `src/` + a `script/Upgrade.s.sol`; the upgrade *path* is already proven by the fixture `test/mocks/NewsSubscriptionV2.sol`.

---

## 6. Frontend (Next.js + viem)

**Core flow**
1. `useMiniPay()` — detect `window.ethereum.isMiniPay`, auto-connect, read address + balances. Hide any connect button inside MiniPay; show a "open in MiniPay" fallback otherwise.
2. Feed (free): fetch headlines from BE → render. Tapping an item opens a summary.
3. Summary: free users get N/day; over quota → **Paywall** sheet.
4. `SubscribeSheet`: pick plan (Monthly/Yearly), pick the user's preferred stablecoin (`getPreferredStablecoin`), read `currentPrice(token, plan)` (shows the live promo price during the launch window), then **two legacy txs** with `feeCurrency`:
   - `approve(NewsSubscription, currentPrice)` on the chosen stablecoin
   - `subscribe(plan, tokenAddress)`
   - (No `permit()` — MiniPay can't sign typed data → approve is its own tx.)
5. On success → `useSubscription()` re-reads `isActive(address)` → unlock.
6. Low balance in all three tokens → redirect to **Deposit** deeplink `https://link.minipay.xyz/add_cash` (not an error).

**Design:** reskinned to **Celiq's editorial identity** — Newsreader serif + IBM Plex Sans/Mono, warm
`#F8F9F5` / navy `#0A2540` / green `#00B27A` palette, plus decor + micro-motion (newspaper masthead with
date + edition, live pulse dot, fade-up reveals, featured lead story with drop cap, stat ribbon, faint 'C'
watermark, gold promo strip) over a subtle animated 'aurora' background. The **brand logo** (navy tile,
serif C, green dot) is wired as the header logo + favicon + apple-icon.

**Article view:** shows the **published time** and a **"Copy original link"** button — *not* an
open-in-browser link. MiniPay's webview opens external links in place with no back button, so external
navigation was removed entirely; users copy the link instead.

**Compliance built in:** zero-click connect, no signing, no CELO, USD-correct decimals (USDm 18 / USDC·USDT 6), `feeCurrency` adapters for USDC/USDT, MiniPay copy terms, in-app **Support** link (`mailto:ghoza60@gmail.com`), **Terms** + **Privacy** pages, name + logo distinct from MiniPay. ~284 KB gzip JS (<2 MB).

The starter page, `useMiniPay` hook, payment flow, multi-token balances, and preferred-stablecoin
helper already exist as copy-paste templates in
`miniapps/.agents/skills/celopedia-skill/references/minipay-templates.md`.

---

## 7. Backend (Express + TS)

| Route | Auth | Purpose |
|------|------|---------|
| `GET /api/health` | public | liveness |
| `GET /api/news` | public | headline list (RSS cache) |
| `POST /api/news/summarize` | gated | AI summary; free quota by address, unlimited if `isActive(address)` |
| `GET /api/subscription/:address` | public | `{ active, expiry }` read from chain (cached) |
| `GET /api/stats` | public | analytics (Proof of Ship + MiniPay listing requirement) |

- **`services/rssNews`** — `rss-parser` over `NEWS_RSS_FEEDS`, cached in Supabase (cron every ~5 min).
- **`services/aiSummary`** — Vercel AI SDK (OpenRouter), summary cache keyed by article.
- **`services/chain`** — viem `publicClient` (Celo): `isActive()` + chunked `eth_getLogs` (≤45k blocks) over `Subscribed` events.
- **`jobs/eventIndexer`** — index `Subscribed` events into Supabase for `/stats` (tx/day, unique subscribers, volume per stablecoin, fees, failed-tx rate).
- **Conventions reused from Celiq BE (not the code):** Zod fail-fast env, `{error,status,code}` error shape, rate limiter, service/route split.

### Subscription gating & trust model (important design point)

Because MiniPay **forbids message signing**, the backend cannot prove address ownership via a
signature (no SIWE). The gate therefore reads on-chain `isActive(addressClaimedByClient)`.

- **Risk:** a non-MiniPay client could claim another user's subscribed address to read premium content.
- **Why acceptable for this app:** the gated asset is *news summaries* — not funds, not PII. Distribution is through MiniPay (a trusted provider supplies the real address). Low value to spoof.
- **Mitigations layered in:** quota by address for free tier; summaries are cached server-side; no write actions are ever address-gated (only the contract gates writes, and it uses `msg.sender`).
- **Recommended default:** server-side read-gate as above. Alternative (fully public feed + the subscription as a client-side "supporter pass") is listed in Open Decisions.

---

## 8. Network & token reference (verified)

### Networks
| | Mainnet | Sepolia testnet |
|---|---|---|
| Chain ID | `42220` | `11142220` |
| RPC | `https://forno.celo.org` | `https://forno.celo-sepolia.celo-testnet.org` |
| Explorer | https://celoscan.io · https://celo.blockscout.com | https://celo-sepolia.blockscout.com |
| Faucet | — | https://faucet.celo.org/celo-sepolia |

### Stablecoins (Celo Mainnet)
| Token | Decimals | Token address (balances/approve/transfer) | `feeCurrency` address (network fee only) |
|------|---------|--------------------------------------------|------------------------------------------|
| USDm (cUSD) | 18 | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | same (`0x765D…282a`) |
| USDC | 6 | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | **adapter** `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USDT | 6 | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | **adapter** `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` |

> Using the **token** address in `feeCurrency` for USDC/USDT will make the tx fail — always use the adapter there.
> Testnet token addresses differ — fetch from the live `FeeCurrencyDirectory` (`0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276`) `getCurrencies()` on Sepolia.

---

## 9. MiniPay submission checklist (Stage-1 visible items first)

From `minipay-requirements.md` — get these right before applying:
- [ ] Zero-click connect (no Connect button when `isMiniPay`)
- [ ] No `personal_sign` / `eth_signTypedData` anywhere
- [ ] No raw `0x…` as primary identifier
- [ ] Only USDT/USDC/USDm; no CELO in copy/selectors
- [ ] Copy: Network fee / Deposit / Withdraw / Stablecoin
- [ ] Works at 360×640; images SVG/WebP; PageSpeed 90+ mobile; JS bundle < 2 MB
- [ ] Contract verified on Celoscan + sample tx hashes per method
- [ ] Deposit deeplink on low balance; in-app support link; Terms + Privacy
- [ ] `/stats` page (DAU/MAU/retention + on-chain tx/volume/fees/failed-tx)

> Listing is a **two-stage** process (intake form → post-call readiness form). Do **not** submit a
> half-built app — MiniPay deprioritizes rough submissions. Build first, then apply.

---

## 10. Build plan (milestones)

1. **M0 — Scaffold.** Create `contracts/`, `backend/`, `frontend/` with their own `package.json` + `.env.example`. Wire celopedia-skill references.
2. **M1 — Contract.** Implement `NewsSubscription` (Foundry), full test suite (subscribe, renew-stacking, allowlist, price-not-set reverts, **promo active vs expired via `currentPrice`**, pause, upgrade-safety, non-custody invariant `balanceOf(contract)==0`). Deploy + verify on **Sepolia** — `Deploy.s.sol` seeds tokens, regular + promo prices, and `promoEndsAt` in the initializer.
3. **M2 — Frontend MVP.** MiniPay detect/auto-connect, feed, paywall, subscribe (approve + subscribe) on Sepolia. Validate at 360×640 on a real device via ngrok.
4. **M3 — Backend.** RSS ingest + AI summaries + chain reads + quota gate + `/stats` indexer.
5. **M4 — Mainnet + ship.** Deploy contract to **Celo Mainnet** (✅ done + verified), migrate owner to multisig, FE→Vercel, BE→IDCloudHost VPS. Collect sample tx hashes.
6. **M5 — Proof of Ship.** Public GitHub, live URL, register on Talent App, add MiniPay hook path to Data Sources. Drive first real subscribers.
7. **M6 — MiniPay listing.** Once polished, submit Stage-1 intake at `minipay.to/mini-apps`.

---

## 11. Environment variables (per project)

**contracts/.env** — `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`, `ETHERSCAN_API_KEY`, `CELO_SEPOLIA_RPC`, `CELO_RPC`.
**backend/.env** — `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_POOLER_URL` (session pooler, DDL only — direct host is IPv6-only), `OPENROUTER_API_KEY`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `NEWS_RSS_FEEDS`, `CELO_CHAIN`, `CELO_RPC`, `SUBSCRIPTION_CONTRACT_ADDRESS`, `EVENT_INDEXER_FROM_BLOCK`, `FRONTEND_URL`, `SUMMARY_FREE_DAILY_LIMIT`.
**frontend/.env** — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN` (`celo`|`celoSepolia`), `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT`, `NEXT_PUBLIC_SUPPORT_URL`.

---

## 12. Celo-specific security notes
Run a 3-layer review before mainnet (`security-patterns.md`): pashov `solidity-auditor` + `x-ray` (general) **plus** the Celo layer — CELO token duality (we never touch CELO ✓), CIP-64 fee accounting (no balance-delta invariants ✓), and the `eth_getLogs` 50k-block pagination rule for the indexer ✓.

---

## 16. Decisions (locked) & pricing config

**Decided with Ghoza (2026-06-22):**

1. **Product name → MiniCeliq** (MiniPay edition; branding only, independent codebase).
2. **News vertical → Crypto + macro** via free RSS (CoinDesk / Cointelegraph / Decrypt).
3. **Pricing → Monthly $5, Yearly $50**, charged in the user's stablecoin, **with a Proof of Ship
   launch promo of $0.10/month until 2026-06-30 (UTC)** — enforced on-chain via `promoPrice` +
   `promoEndsAt` (auto-reverts).
4. **Gating → server-side read-gate** of AI summaries by on-chain `isActive(address)` (low-risk
   address-spoofing accepted for news content).

**Defaults I'm taking (raise a flag to change):**

5. **Backend data store → a new, separate Supabase project** (not Celiq's).
6. **Access control → role-based (DEFAULT_ADMIN / MANAGER / UPGRADER)**; deploy with an EOA admin, migrate DEFAULT_ADMIN + UPGRADER to a Safe multisig before mainnet.

### Pricing in token-native units (seeded in `initialize` via `Deploy.s.sol`)

Promo cutoff `promoEndsAt = 1782864000` (2026-07-01T00:00:00Z = end of Jun 30 UTC).

| Token (dec) | Monthly `price` (plan 0) | Yearly `price` (plan 1) | Monthly `promoPrice` (plan 0) |
|---|---|---|---|
| USDm (18) | `5_000000000000000000` ($5) | `50_000000000000000000` ($50) | `100000000000000000` ($0.10) |
| USDC (6) | `5_000000` ($5) | `50_000000` ($50) | `100000` ($0.10) |
| USDT (6) | `5_000000` ($5) | `50_000000` ($50) | `100000` ($0.10) |

> Only the **monthly** plan gets a promo (`promoPrice[token][1]` for yearly stays `0` → regular $50).
> After the cutoff, `currentPrice()` falls back to regular price automatically — no deadline action needed.

---

### Reference index (in-repo)
`.agents/skills/celopedia-skill/references/` — `minipay-requirements.md`, `minipay-templates.md`,
`minipay-scaffold-from-scratch.md`, `builder-guide.md`, `network-info.md`, `security-patterns.md`,
`proof-of-ship.md`, `contracts.md`.
