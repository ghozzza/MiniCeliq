# MiniCeliq — Deployment & Infrastructure

Complete record of the `NewsSubscription` deployment to **Celo Mainnet** (how it was done, how to
interact with it, the admin runbook), plus the **Ceny** reward token, the **Supabase** data layer, the
**Vercel frontend** + **Railway backend** hosting, the **local dev** setup, and the work completed so
far. The whole stack is now hosted (FE `https://mini.celiq.io`, BE Railway); cloudflared tunnels are
retired (local dev only).

> Quick links: design → [`../README.md`](../README.md) · project status → [`STATUS.md`](STATUS.md) ·
> machine-readable record → [`../contracts/deployments/celo-mainnet.json`](../contracts/deployments/celo-mainnet.json) ·
> Supabase schema → [`../backend/supabase/schema.sql`](../backend/supabase/schema.sql) ·
> security review → [`../contracts/audit/`](../contracts/audit/).

---

## 1. Live deployment (Celo Mainnet · chainId 42220)

| | |
|---|---|
| **Contract** | `NewsSubscription` — UUPS upgradeable, non-custodial subscription registry · **now V2 (auto-mints a CENY reward on subscribe)** |
| **Proxy (use this everywhere)** | [`0x3988b17eb4134eB929118244Be69798b5dF69ce7`](https://celoscan.io/address/0x3988b17eb4134eb929118244be69798b5df69ce7) ✅ verified (unchanged across the upgrade) |
| **Implementation (V2, live)** | [`0xadf826d6d221bc45840abd0e09f71021181476c2`](https://celoscan.io/address/0xadf826d6d221bc45840abd0e09f71021181476c2) ✅ verified |
| **Implementation (V1, superseded)** | `0xa0e3B8672f628B0146E23382845b0625A4D2F722` |
| **Admin + Treasury** | `0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` |
| **Deployer (gas payer)** | `0xA3235414Ba1444Aaceb667e3161B183B67B8Ce49` |
| **Deploy block** | `70222870` (use for `EVENT_INDEXER_FROM_BLOCK`) |
| **Deployed** | 2026-06-22 (V1) · upgraded to V2 2026-06-22 |
| **V1 implementation tx** | `0xaabccdeb35c3408af7777e46b47b1843d927656874a8e73fe960fb15c014dd90` |
| **Proxy tx** | `0x9a0ad72d901ce071cf11a0ba8c73fdd4dc3a0e254a8a14acdf20ac33484797ee` |

> **Always reference the PROXY address.** The implementation holds the logic but no state — never
> point the FE/BE/users at it. Store the address lowercase or as a valid EIP-55 checksum (the value
> above is a valid checksum); a hand-recased address breaks viem.

---

## 2. Seeded configuration (set in the initializer at deploy)

**Pricing** — token-native units, all adjustable later via the setters:

| Token (decimals) | Monthly (plan 0) | Yearly (plan 1) | Monthly promo |
|---|---|---|---|
| USDm `0x765DE8…282a` (18) | `5e18` ($5) | `50e18` ($50) | `1e17` ($0.10) |
| USDC `0xcebA93…118C` (6) | `5e6` ($5) | `50e6` ($50) | `1e5` ($0.10) |
| USDT `0x48065f…3D5e` (6) | `5e6` ($5) | `50e6` ($50) | `1e5` ($0.10) |

- **Plans:** `0` = monthly (`2592000`s = 30 days) · `1` = yearly (`31536000`s = 365 days).
- **Promo:** `promoEndsAt = 1782864000` (2026-07-01T00:00:00Z = end of Jun 30 UTC). While active,
  `currentPrice()` returns the promo price; after the cutoff it auto-reverts to the regular price —
  **no deadline action needed**. Promo is monthly-only (yearly stays $50).
- **Paused:** `false`.

Verified live (cast): `currentPrice(USDm,0)=1e17`, `currentPrice(USDm,1)=50e18`, `treasury=admin`,
`isActive(admin)=false`, `promoEndsAt=1782864000`.

---

## 3. Access control (role-based — not Ownable)

| Role | Hash | Holder | Gates |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x0000…0000` | admin | grant/revoke all roles |
| `MANAGER_ROLE` | `0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08` | admin | `setTreasury`, `setAllowedToken`, `setPrice`, `setPromoPrice`, `setPromoEndsAt`, `setPlanDuration`, `pause`/`unpause` |
| `UPGRADER_ROLE` | `0x189ab7a9244df0848122154315af71fe140f3db0fe014031783b0946b8c9d2e3` | admin | `_authorizeUpgrade` (UUPS) + the V2 reinitializer |

All three are currently held by the single admin EOA `0x02EF…7E45`.

> **Production hardening (recommended before scaling):** migrate `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE`
> to a **Safe multisig**, then revoke them from the EOA. `MANAGER_ROLE` can stay on a hot key for
> day-to-day price/promo ops. Example:
> ```bash
> # grant to multisig, then revoke from the EOA (run as current DEFAULT_ADMIN)
> cast send $PROXY "grantRole(bytes32,address)"  0x0000000000000000000000000000000000000000000000000000000000000000 $SAFE  --rpc-url $CELO_RPC --private-key $PRIVATE_KEY
> cast send $PROXY "grantRole(bytes32,address)"  0x189ab7a9244df0848122154315af71fe140f3db0fe014031783b0946b8c9d2e3 $SAFE  --rpc-url $CELO_RPC --private-key $PRIVATE_KEY
> cast send $PROXY "revokeRole(bytes32,address)" 0x0000000000000000000000000000000000000000000000000000000000000000 $EOA   --rpc-url $CELO_RPC --private-key $PRIVATE_KEY
> ```

---

## 4. On-chain interface

### Reads (used by FE, BE, anyone)
```solidity
function isActive(address user) view returns (bool);                 // the gate FE/BE use
function currentPrice(address token, uint8 plan) view returns (uint256); // promo-aware, live price
function subscriptionExpiry(address user) view returns (uint64);     // unix expiry
function allowedToken(address token) view returns (bool);
function price(address token, uint8 plan) view returns (uint256);    // regular price
function promoPrice(address token, uint8 plan) view returns (uint256);
function promoEndsAt() view returns (uint64);
function treasury() view returns (address);
```
```bash
# examples
cast call $PROXY "currentPrice(address,uint8)(uint256)" 0x765DE816845861e75A25fCA122bb6898B8B1282a 0 --rpc-url https://forno.celo.org
cast call $PROXY "isActive(address)(bool)" <USER> --rpc-url https://forno.celo.org
```

### Write (the only user action)
```solidity
function subscribe(uint8 plan, address token);  // plan 0=monthly, 1=yearly
```
Two legacy transactions (MiniPay can't sign typed data, so no `permit`):
1. `IERC20(token).approve(PROXY, currentPrice(token, plan))`
2. `subscribe(plan, token)` → pulls the price straight to the treasury (contract never holds funds),
   sets/stacks expiry, emits `Subscribed`.

### Event (analytics / indexer surface)
```solidity
event Subscribed(address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry);
```

---

## 5. Admin runbook (MANAGER_ROLE)

Key stays in `contracts/.env` (`PRIVATE_KEY`); pass it as `$PRIVATE_KEY`, never hardcode.

```bash
source contracts/.env   # PROXY + CELO_RPC + PRIVATE_KEY

# Change a price (token-native units): setPrice(token, plan, amount)
cast send $PROXY "setPrice(address,uint8,uint256)" 0x765DE816845861e75A25fCA122bb6898B8B1282a 0 6000000000000000000 --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Change / disable a promo: setPromoPrice(token, plan, amount)  (0 = disable for that token/plan)
cast send $PROXY "setPromoPrice(address,uint8,uint256)" 0x765DE816845861e75A25fCA122bb6898B8B1282a 0 0 --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Move / end the promo window: setPromoEndsAt(uint64)  (0 or a past ts = off)
cast send $PROXY "setPromoEndsAt(uint64)" 0 --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Allow / remove a stablecoin: setAllowedToken(token, bool)
cast send $PROXY "setAllowedToken(address,bool)" <TOKEN> true --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Add / change a plan duration (seconds): setPlanDuration(plan, seconds)
cast send $PROXY "setPlanDuration(uint8,uint64)" 2 604800 --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Emergency stop / resume
cast send $PROXY "pause()"   --rpc-url $CELO_RPC --private-key $PRIVATE_KEY
cast send $PROXY "unpause()" --rpc-url $CELO_RPC --private-key $PRIVATE_KEY

# Change treasury (cannot be address(0) or the contract itself — see Security §7)
cast send $PROXY "setTreasury(address)" <NEW_TREASURY> --rpc-url $CELO_RPC --private-key $PRIVATE_KEY
```

---

## 6. How it was deployed (reproducible process)

1. **Pre-flight** (key never printed): confirmed `PRIVATE_KEY` set, deployer funded (~3.36 CELO),
   chain id `42220`, admin/treasury set, `forge clean && forge build` clean.
2. **Deploy** — `Deploy.s.sol` signs in-script via `vm.envUint("PRIVATE_KEY")` (key never on the CLI)
   and seeds prices in the initializer:
   ```bash
   cd contracts && set -a && source .env && set +a
   forge script script/Deploy.s.sol:Deploy --rpc-url "$CELO_RPC" --broadcast --ffi -vvvv
   ```
   The OZ Foundry Upgrades plugin validates UUPS storage-layout safety, deploys the implementation +
   `ERC1967Proxy`, and calls `initialize(admin, treasury, promoEndsAt, InitToken[])` atomically.
3. **Verify (Celoscan, Etherscan V2 unified key):**
   ```bash
   forge verify-contract <IMPL> src/NewsSubscription.sol:NewsSubscription --chain celo --watch
   # proxy: constructor args from broadcast json → cast abi-encode "constructor(address,bytes)" <impl> <initData>
   forge verify-contract <PROXY> lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
     --chain celo --constructor-args <ENCODED> --watch
   ```
   Both returned **Pass - Verified**.
4. **Record + wire** — wrote `contracts/deployments/celo-mainnet.json`; wired local `backend/.env`
   (`SUBSCRIPTION_CONTRACT_ADDRESS`, `CELO_CHAIN=celo`, `CELO_RPC`, `EVENT_INDEXER_FROM_BLOCK=70222870`)
   and `frontend/.env.local` (`NEXT_PUBLIC_SUBSCRIPTION_CONTRACT`, `NEXT_PUBLIC_CHAIN=celo`).

> Redeploy/new network: copy `contracts/.env.example` → `.env`, fund the deployer, set token addresses
> for the target network (Sepolia differs — fetch from the FeeCurrencyDirectory `getCurrencies()`),
> then repeat steps 2–4. On Sepolia set `USDM_ADDRESS`/`USDC_ADDRESS`/`USDT_ADDRESS` in `.env`
> (uncomment them — leaving them blank breaks `vm.envOr`).

---

## 7. Security

- **Reviewed:** pashov `solidity-auditor` (12 parallel attacker lenses) + Celo-specific layer →
  **0 confirmed findings**. Full report: `contracts/audit/NewsSubscription-pashov-audit-2026-06-22.md`.
- **Hardening applied** (zero-cost, from the review):
  1. **CEI ordering** — `subscribe()` writes the expiry *before* `safeTransferFrom` (a transfer revert rolls it back).
  2. **`treasury != address(this)`** — `initialize` + `setTreasury` revert `InvalidTreasury()`. **Why it matters:** the contract is non-custodial and has **no withdraw function**; if the treasury were ever set to the contract itself, every payment would land in the contract and be **permanently locked**. This guard prevents that admin foot-gun. (Not an attacker vector — only an admin sets the treasury — but the consequence is irreversible, so the one-line guard is worth it, especially now that it's live.)
  3. **`onlyRole(UPGRADER_ROLE)` on `initializeV2`** — a front-runner can't consume the reinitializer slot in a non-atomic upgrade.
- **Non-custodial:** the contract balance is always ~0 — payments go straight `user → treasury`.
- **20 Foundry tests pass** (incl. non-custody invariant, renewal stacking, promo time-boxing, reverts, pause, role-gating, and a real UUPS upgrade with storage-layout validation).

---

## 8. Upgrade path (UUPS) — V2 is LIVE

The contract is upgradeable, gated by `UPGRADER_ROLE`. **The live proxy now runs V2** (impl
`0xadf826d6d221bc45840abd0e09f71021181476c2`), which auto-mints a CENY reward on `subscribe` — see
§9.1 for the V2 upgrade record (new impl, reward config, MINTER grant, the keystore signing flow).
The previous test-only fixture `contracts/test/mocks/NewsSubscriptionV2.sol` proved the upgrade path
(storage-layout safety + state preservation) before the real V2 shipped.

When a further upgrade is needed:
1. Write the new implementation in `contracts/src/` (append-only storage; the OZ plugin validates layout).
2. Add an upgrade script using `Upgrades.upgradeProxy(PROXY, "NewVN.sol", initCalldata)` (see
   `script/UpgradeToV2.s.sol` as the template).
3. Broadcast **signed by the admin key** `0x02EF…7E45` (it holds `UPGRADER_ROLE` — the deployer/gas key
   `0xA323…Ce49` does not). Use a `cast wallet` keystore + `--account` (§9.1), never a plaintext key.

---

## 9. Ceny reward token — `Ceny` (CENY) — LIVE

A second contract, **deployed + verified on Celo mainnet**, the subscription reward token.

| | |
|---|---|
| **Contract** | `Ceny` (symbol **CENY**) — ERC-20 |
| **Proxy (use this everywhere)** | [`0xFacb8Ba3daC93785689CBF0418b9Ad664a25d6aB`](https://celoscan.io/address/0xfacb8ba3dac93785689cbf0418b9ad664a25d6ab) ✅ verified |
| **Implementation** | `0x20952EACBd5325342c8a57E68dcEE0251aeb5e8f` |
| **Admin** | `0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` |
| **Supply** | **Capped at 1,000,000,000 CENY** (18 decimals) |
| **Upgradeable** | UUPS (same pattern as `NewsSubscription`) |
| **Access control** | `DEFAULT_ADMIN_ROLE` · `MINTER_ROLE` (mint) · `UPGRADER_ROLE` (upgrade) |
| **Claim path** | EIP-712 signature-based claim |
| **`MINTER_ROLE` granted to** | the `NewsSubscription` proxy `0x3988…69ce7` (so V2 can mint the subscribe reward) |
| **Tests** | **11 forge tests pass** |
| **Status** | ✅ **Live + verified on Celo mainnet.** |

### 9.1 NewsSubscription V2 upgrade — auto-mint CENY on subscribe

The live `NewsSubscription` proxy was upgraded V1 → **V2** so each `subscribe` mints a CENY reward to
the subscriber, on top of the existing non-custodial payment.

| | |
|---|---|
| **Proxy (unchanged)** | `0x3988b17eb4134eB929118244Be69798b5dF69ce7` |
| **New impl (V2)** | `0xadf826d6d221bc45840abd0e09f71021181476c2` ✅ verified |
| **Reward** | **10 CENY** plan 0 (monthly) · **120 CENY** plan 1 (yearly), 18 dec |
| **Reward config** | adjustable via `setCenyReward(plan, amount)` / `setCenyToken(addr)` (MANAGER_ROLE) |
| **Mint semantics** | **best-effort** — wrapped in try/catch; a mint failure **never blocks** the paid subscription |
| **Storage** | append-only safe (OZ-validated); V1 subscriber state + pricing/promo preserved through the upgrade |
| **Tests** | **42 forge total** — V2 11 + V1 20 + Ceny 11 |

**Wiring done at upgrade time:**
1. Deployed Ceny (proxy `0xFacb…d6aB`) and granted its `MINTER_ROLE` to the `NewsSubscription` proxy.
2. Upgraded the `NewsSubscription` proxy to V2 via `script/UpgradeToV2.s.sol`
   (`Upgrades.upgradeProxy(PROXY, "NewsSubscriptionV2.sol", initCalldata)` — the OZ plugin validates
   storage-layout safety) and set the Ceny token + per-plan reward amounts.

**Signing — admin key, via a keystore (NOT a plaintext `PRIVATE_KEY`):** the V2 upgrade and every role
grant must be signed by the **admin/role key `0x02EF…7E45`**, which is **different from** the
deployer/gas key `0xA323…Ce49` in `contracts/.env`. The admin key was imported into a `cast wallet`
keystore and passed with `--account`:

```bash
# one-time: import the admin key into an encrypted keystore (prompts for the private key + a password)
cast wallet import miniceliq-admin --interactive

# upgrade + role grants: sign with the keystore account, never with a CLI/plaintext key
forge script script/UpgradeToV2.s.sol:UpgradeToV2 --rpc-url "$CELO_RPC" --account miniceliq-admin --broadcast --ffi -vvvv
cast send $CENY "grantRole(bytes32,address)" $MINTER_ROLE $PROXY --rpc-url "$CELO_RPC" --account miniceliq-admin
```

> Day-to-day `MANAGER_ROLE` ops (price/promo, and `setCenyReward` / `setCenyToken`) are also held by
> `0x02EF…7E45` and signed the same way.

---

## 10. Data layer — Supabase (live + persistent)

The backend's only data store is a **standalone Supabase project** (separate from Celiq). It is **live
and persistent**, wired into the local backend.

**Tables (4):**

| Table | Purpose |
|---|---|
| `news_cache` | RSS headline cache — includes a **`content`** column (the article body, used for content-based AI summaries) |
| `news_summaries` | AI-summary cache keyed by article |
| `summary_views` | per-address free-quota tracking for AI summaries |
| `subscribed_events` | indexed `Subscribed` events (analytics surface) |

**RLS model:** **Row-Level Security is enabled with no policies** on every table → only the
**service-role key** (used by the backend) can read or write. The anon key sees nothing.

**Running DDL / migrations:** the Supabase **direct DB host is IPv6-only**, so DDL is run through the
**session pooler** — `SUPABASE_DB_POOLER_URL` in `backend/.env` (gitignored). The schema is committed
at **`backend/supabase/schema.sql`** (the source of truth; re-run it against a fresh project to
recreate the tables).

**Smoke-tested 12/12.** AI summaries are content-based (RSS body) and refusal-proof for thin feeds.

---

## 11. Frontend deploy — Vercel (LIVE)

The frontend is **live on Vercel** at its custom domain.

| | |
|---|---|
| **URL** | **`https://mini.celiq.io`** (custom domain live; `miniceliq.vercel.app` also still serves) |
| **Vercel project** | `ghozzzas-projects/miniceliq` |
| **Deploy** | `vercel --prod --yes --scope ghozzzas-projects --build-env …` from `frontend/`, passing **ALL** `NEXT_PUBLIC_*` vars via **`--build-env`** |
| **Build-env vars** | `NEXT_PUBLIC_SUBSCRIPTION_CONTRACT` (lowercase — viem EIP-55 trap), `NEXT_PUBLIC_CENY_CONTRACT=0xFacb…25d6aB` (surfaces the CENY reward/balance), `NEXT_PUBLIC_API_URL` (the **Railway** BE URL), `NEXT_PUBLIC_CHAIN=celo`, `NEXT_PUBLIC_SUPPORT_URL` |
| **API target** | the **Railway backend** `https://miniceliq-backend-production.up.railway.app` (no longer the cloudflared tunnel) |
| **Custom domain** | **`mini.celiq.io` — LIVE.** DNS A record (`mini` → `76.76.21.21`) is set; SSL is active. |
| **Talent App** | domain ownership verified via a `<meta name="talentapp:project_verification" …>` tag injected through Next `metadata.other` in `app/layout.tsx` (live on `mini.celiq.io`). |

> The live FE no longer depends on the laptop — the API resolves to the hosted Railway backend, and
> cloudflared tunnels are retired (local dev only, §11.2).

---

## 11.1 Backend deploy — Railway (LIVE)

The backend is **live on Railway** (previously planned for an IDCloudHost VPS — that plan changed).

| | |
|---|---|
| **URL** | **`https://miniceliq-backend-production.up.railway.app`** |
| **Railway account** | `cghoza@gmail.com` |
| **Project + service** | `miniceliq-backend` |
| **Build (Nixpacks)** | `pnpm install` → `pnpm build` (tsc) → `pnpm start` = `node dist/server.js` |
| **`PORT`** | **injected by Railway** (do not hardcode) |
| **CORS** | `FRONTEND_URL=https://mini.celiq.io` |
| **Env** | set via the **Railway CLI** (points at the live Supabase project, `EVENT_INDEXER_FROM_BLOCK=70222870`, etc.) |
| **Health** | `/api/health` shows `supabase`, `openrouter`, `chain` all `true` |

```bash
# deploy / redeploy (run from backend/)
railway up                                  # first deploy from backend/
railway up --service miniceliq-backend      # redeploy

# set / update an env var
railway variables --set "KEY=VALUE" --service miniceliq-backend
```

> Env vars carry no defaults for secrets — set `SUPABASE_*`, `OPENROUTER_API_KEY`, the chain vars, and
> `FRONTEND_URL` via `railway variables --set …` (never commit values). `PORT` is provided by Railway.

---

## 11.2 Local development & MiniPay device testing

> **Hosted now:** the live stack is FE `https://mini.celiq.io` (Vercel) + BE Railway — the tunnels
> below are **local dev only** and no longer part of the live path. cloudflared tunnels were retired
> once the BE moved to Railway; they were only ever for pre-hosting MiniPay device testing.

To test inside MiniPay on a real phone **during local dev**, both the frontend and backend must be
reachable from the device — the phone can't hit the laptop's `localhost`, so **each gets its own
[cloudflared](https://github.com/cloudflare/cloudflared) tunnel**.

```bash
# 1. Run both services locally
cd frontend && pnpm start   # http://localhost:3000
cd backend  && pnpm dev     # http://localhost:4000

# 2. Expose BOTH (two separate terminals — FE and BE each need a tunnel)
cloudflared tunnel --url http://localhost:3000   # → https://<random>.trycloudflare.com  (FE)
cloudflared tunnel --url http://localhost:4000   # → https://<random>.trycloudflare.com  (BE)

# 3. Wire the tunnel URLs together
#    frontend  NEXT_PUBLIC_API_URL = <BE tunnel URL>
#    backend   FRONTEND_URL (CORS) = <FE tunnel URL>
```

> Tunnel URLs are **ephemeral** — they change on every `cloudflared` restart, so this is for device
> testing only, never a production URL. Open the FE tunnel URL inside MiniPay's in-app browser to test
> the real zero-click connect + subscribe flow on-device.

---

## 12. Work completed so far (timeline)

1. **Repo** — standalone public repo `github.com/ghozzza/MiniCeliq`, nested at `CeliqAI/miniapps` but git-independent (zero Celiq-history leakage). MIT licensed.
2. **Scaffold (parallel agents)** — `contracts/` (Foundry), `frontend/` (Next.js + viem), `backend/` (Express + TS); all builds clean.
3. **Contract** — `NewsSubscription`: UUPS, custom errors (no `require`), non-custodial, multi-token/plan, on-chain time-boxed promo; later refactored to **AccessControl roles** and to **seed prices in the initializer**.
4. **Security** — pashov 12-lens audit + Celo layer (0 findings) + 3 hardening items; report committed.
5. **Local integration** — ran BE live (real RSS), found + fixed 2 FE↔BE contract mismatches (stats shape, summarize 402 gating).
6. **Deploy** — **deployed + verified on Celo mainnet** (§1); env wired; on-chain sanity-checked.
7. **Supabase live** — stood up the standalone Supabase project: 4 tables (incl. `news_cache.content`),
   RLS-enabled-no-policies (service-role only), DDL run via the session pooler (direct host is IPv6-only),
   schema committed at `backend/supabase/schema.sql`. Backend now persists news cache + AI summaries +
   quota + indexed events. **Smoke-tested 12/12.** AI summaries made content-based + refusal-proof.
8. **Frontend reskin** — re-themed to **Celiq's editorial design** (Newsreader serif + IBM Plex Sans/Mono,
   warm `#F8F9F5` / navy `#0A2540` / green `#00B27A`), added decor + micro-motion (newspaper masthead with
   date + edition, live pulse dot, fade-up reveals, featured lead with drop cap, stat ribbon, 'C' watermark,
   gold promo strip) + a subtle animated **aurora** background. Wired the **brand logo** as header logo +
   favicon + apple-icon. ~284 KB gzip JS (<2 MB).
9. **News UX fixes** — removed the **Stats page**; article view now shows the **published time** and a
   **"Copy original link"** button instead of an open-in-browser link (MiniPay's webview opens external
   links in place with no back, so external navigation was removed). Support → `mailto:ghoza60@gmail.com`.
10. **Ceny token built** — `Ceny` (CENY): ERC-20, capped 1B, UUPS, AccessControl, EIP-712 claim path;
    **11 forge tests pass.**
11. **Ceny deployed + verified** — `Ceny` (CENY) live on Celo mainnet (proxy `0xFacb…d6aB`, impl
    `0x2095…b5e8f`, cap 1B / 18 dec); admin `0x02EF…7E45` (§9).
12. **NewsSubscription V2 (auto-mint reward) live** — upgraded the live proxy V1 → V2 (new impl
    `0xadf8…76c2`) via `script/UpgradeToV2.s.sol`; each `subscribe` now best-effort mints **10 CENY**
    (monthly) / **120 CENY** (yearly) to the subscriber. Granted the subscription proxy Ceny's
    `MINTER_ROLE`; set the Ceny token + per-plan reward amounts. V1 subscriber state + pricing/promo
    preserved (OZ storage-layout validated). All upgrades/role grants **signed by the admin key
    `0x02EF…7E45` via a `cast wallet` keystore + `--account`** (not the deployer/gas key `0xA323…Ce49`).
    **42 forge tests pass** (V2 11 + V1 20 + Ceny 11). (§8, §9.1)
13. **Frontend live on Vercel** — deployed `frontend/` to Vercel (project `ghozzzas-projects/miniceliq`)
    via `vercel --prod` with `--build-env` for the `NEXT_PUBLIC_*` vars. (§11)
14. **CENY reward surfaced in the FE** — the subscribe sheet shows "+ Earn N CENY" (read from on-chain
    `cenyReward`) + "You hold X CENY", and the home masthead shows a "◆ X CENY" balance pill when the
    connected user holds CENY. New `NEXT_PUBLIC_CENY_CONTRACT` env + `hooks/useCenyBalance.ts` +
    `readCenyReward`/`readCenyBalance` in `lib/contract.ts`. (§11)
15. **Backend live on Railway** — deployed `backend/` to **`https://miniceliq-backend-production.up.railway.app`**
    (Railway account `cghoza@gmail.com`, project + service `miniceliq-backend`). Nixpacks build
    (`pnpm install` → `pnpm build` → `pnpm start` = `node dist/server.js`), `PORT` injected by Railway,
    env set via the Railway CLI, `FRONTEND_URL=https://mini.celiq.io` for CORS. `/api/health` reports
    `supabase`/`openrouter`/`chain` all `true`. (§11.1)
16. **Custom domain `mini.celiq.io` live** — DNS A record (`mini` → `76.76.21.21`) set, SSL active; the
    Vercel FE now points `NEXT_PUBLIC_API_URL` at the Railway backend. **cloudflared tunnels retired**
    (local dev only). (§11)
17. **Registered on Talent App** — domain ownership verified via a `<meta name="talentapp:project_verification" …>`
    tag injected through Next `metadata.other` in `app/layout.tsx` (live on `mini.celiq.io`). All four
    Proof-of-Ship hard-gates now met.

---

## 13. Next steps / open items

> **All Proof-of-Ship hard-gates are met:** contract on Celo mainnet (NewsSubscription V2 + Ceny) ✅,
> public GitHub repo ✅, live functional URL `https://mini.celiq.io` ✅, registered on Talent App ✅.
> The remaining items below are **optional / hardening**.

- [x] **Host the backend** — ✅ BE live on **Railway** (`miniceliq-backend-production.up.railway.app`);
  the FE `NEXT_PUBLIC_API_URL` now points at it (cloudflared tunnel retired). (§11.1)
- [x] **Finalize `mini.celiq.io` DNS** — ✅ A record (`mini` → `76.76.21.21`) set, SSL active; the custom
  domain resolves to the Vercel deployment. (§11)
- [x] **Ceny: deploy + integrate** — ✅ deployed to mainnet + upgraded the live `NewsSubscription` to V2
  (auto-mint CENY on `subscribe`); `MINTER_ROLE` granted to the subscription proxy; reward surfaced in
  the FE. (§9, §9.1, §11)
- [x] **Register on Talent App** — ✅ registered; domain ownership verified via the
  `talentapp:project_verification` meta tag on `mini.celiq.io`.
- [ ] (optional) **Collect sample tx hashes** (a real `subscribe`) for the MiniPay intake.
- [ ] (optional) **Migrate `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE` to a Safe multisig** before scaling.
- [ ] (optional) **Add monitoring** for the hosted BE/FE.
- [ ] (optional) **MiniPay Discovery intake** once polished.
- [ ] Tidy remaining doc refs to the removed `Configure`/`Upgrade` scripts in `contracts/README.md`.
