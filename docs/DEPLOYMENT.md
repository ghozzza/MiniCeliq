# MiniCeliq — Deployment & Infrastructure

Complete record of the `NewsSubscription` deployment to **Celo Mainnet** (how it was done, how to
interact with it, the admin runbook), plus the **Ceny** reward token, the **Supabase** data layer, the
**local dev / MiniPay tunnel** setup, and the work completed so far.

> Quick links: design → [`../README.md`](../README.md) · project status → [`STATUS.md`](STATUS.md) ·
> machine-readable record → [`../contracts/deployments/celo-mainnet.json`](../contracts/deployments/celo-mainnet.json) ·
> Supabase schema → [`../backend/supabase/schema.sql`](../backend/supabase/schema.sql) ·
> security review → [`../contracts/audit/`](../contracts/audit/).

---

## 1. Live deployment (Celo Mainnet · chainId 42220)

| | |
|---|---|
| **Contract** | `NewsSubscription` — UUPS upgradeable, non-custodial subscription registry |
| **Proxy (use this everywhere)** | [`0x3988b17eb4134eB929118244Be69798b5dF69ce7`](https://celoscan.io/address/0x3988b17eb4134eb929118244be69798b5df69ce7) ✅ verified |
| **Implementation** | [`0xa0e3B8672f628B0146E23382845b0625A4D2F722`](https://celoscan.io/address/0xa0e3b8672f628b0146e23382845b0625a4d2f722) ✅ verified |
| **Admin + Treasury** | `0x02EF49eDB08779c302770FC25dfDfa79dFB17E45` |
| **Deployer (gas payer)** | `0xA3235414Ba1444Aaceb667e3161B183B67B8Ce49` |
| **Deploy block** | `70222870` (use for `EVENT_INDEXER_FROM_BLOCK`) |
| **Deployed** | 2026-06-22 |
| **Implementation tx** | `0xaabccdeb35c3408af7777e46b47b1843d927656874a8e73fe960fb15c014dd90` |
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

## 8. Upgrade path (UUPS)

The contract is upgradeable, gated by `UPGRADER_ROLE`. There is **no V2 in production** — the only V2
is `contracts/test/mocks/NewsSubscriptionV2.sol`, a **test-only fixture** that proves the upgrade path
(storage-layout safety + state preservation) in the test suite. When a real upgrade is needed:
1. Write the new implementation in `contracts/src/` (append-only storage; the OZ plugin validates layout).
2. Add a `script/Upgrade.s.sol` using `Upgrades.upgradeProxy(PROXY, "NewV2.sol", initCalldata)`.
3. Broadcast as an account holding `UPGRADER_ROLE`.

---

## 9. Ceny reward token — `Ceny` (CENY)

A second contract, **built but not yet deployed**, intended as the subscription reward token.

| | |
|---|---|
| **Contract** | `Ceny` (symbol **CENY**) — ERC-20 |
| **Supply** | **Capped at 1,000,000,000 CENY** (18 decimals) |
| **Upgradeable** | UUPS (same pattern as `NewsSubscription`) |
| **Access control** | `DEFAULT_ADMIN_ROLE` · `MINTER_ROLE` (mint) · `UPGRADER_ROLE` (upgrade) |
| **Claim path** | EIP-712 signature-based claim |
| **Tests** | **11 forge tests pass** |
| **Status** | 🟡 **NOT deployed.** |

**Planned subscribe-integration (decision pending):** auto-mint Ceny to the subscriber inside
`NewsSubscription.subscribe()` as an on-chain reward. This requires **upgrading the live
`NewsSubscription`** (UUPS) so it can call `Ceny.mint(...)` (the subscription contract would hold
`MINTER_ROLE`). This is **planned, not done** — the exact integration shape is still being decided.

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

## 11. Local development & MiniPay device testing

The app runs **fully locally** today (no Vercel/VPS yet). To test inside MiniPay on a real phone, both
the frontend and backend must be reachable from the device — the phone can't hit the laptop's
`localhost`, so **each gets its own [cloudflared](https://github.com/cloudflare/cloudflared) tunnel**.

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
    **11 forge tests pass.** Not deployed (§9).

---

## 13. Next steps / open items

- [ ] **Host the app** — FE → **Vercel** (project `ghozzzas-projects/miniceliq` already linked; domain
  `mini.celiq.io` planned), BE → **IDCloudHost VPS** (later) → a live, functional URL (Proof of Ship hard-gate).
- [ ] **Ceny: deploy + integrate** — deploy `Ceny` to mainnet, then upgrade the live `NewsSubscription`
  (UUPS) to auto-mint Ceny on `subscribe` (decision on integration shape still pending).
- [ ] **Register on Talent App** for the active Proof of Ship campaign; add the contract address + repo + live URL.
- [ ] **Collect sample tx hashes** (a real `subscribe`) for the MiniPay intake.
- [ ] **Migrate `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE` to a Safe multisig** before scaling.
- [ ] Tidy remaining doc refs to the removed `Configure`/`Upgrade` scripts in `contracts/README.md`.
