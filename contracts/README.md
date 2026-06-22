# MiniCeliq Contracts — `NewsSubscription` (UUPS, non-custodial)

Foundry sub-project for the MiniCeliq MiniPay mini app. Implements `NewsSubscription`,
an upgradeable (UUPS) on-chain subscription registry that **never custodies funds** —
each `subscribe()` pulls the price straight from the user to the treasury in the same
transaction. See the master plan at `../README.md` §5 / §8 / §16.

## Stack

- **Foundry** (forge 1.5.1) — not Hardhat.
- **OpenZeppelin Contracts Upgradeable v5.4.0** + **OpenZeppelin Contracts v5.4.0**.
- **OpenZeppelin Foundry Upgrades v0.4.1** (UUPS deploy + storage-layout validation via ffi).
- Solidity `^0.8.24`.

## Layout

```
src/
  NewsSubscription.sol      # V1 — UUPS, custom errors, non-custodial, time-boxed promo
  NewsSubscriptionV2.sol    # trivial upgrade (adds version() == "v2") to test the upgrade path
  mocks/MockERC20.sol       # mintable ERC20 with configurable decimals (18 / 6) for tests
script/
  Deploy.s.sol              # deploy the UUPS proxy (owner + treasury from env)
  Configure.s.sol           # allowlist USDm/USDC/USDT + set prices + promo (README §16)
  Upgrade.s.sol             # upgrade proxy to V2 (storage-layout validated)
test/
  NewsSubscription.t.sol    # 17 tests (subscribe, non-custody, renewal, reverts, promo, pause, owner, upgrade)
foundry.toml  remappings.txt  .env.example
```

## Contract summary

- **Plans:** `0` = monthly (30 days), `1` = yearly (365 days). Durations are owner-settable.
- **Multi-token:** owner-curated allowlist (USDm 18-dec, USDC/USDT 6-dec). Per-token, per-plan prices.
- **Custom errors only** (no `require`): `ZeroAddress`, `TokenNotAllowed`, `InvalidPlan`, `PriceNotSet`.
- **Renewal stacks:** renewing before expiry extends from the current expiry, not from now.
- **Time-boxed promo:** `currentPrice()` returns `promoPrice` while `block.timestamp < promoEndsAt`,
  then auto-reverts to the regular `price` — no deadline action needed.
- **Reads:** `isActive(address)` (strict `>` against expiry), `currentPrice(token, plan)`.
- **Admin (`onlyOwner`):** `setTreasury`, `setAllowedToken`, `setPrice`, `setPromoPrice`,
  `setPromoEndsAt`, `setPlanDuration`, `pause` / `unpause`. Upgrades gated by `_authorizeUpgrade onlyOwner`.

## Install dependencies (after clone)

`lib/` is **git-ignored** (we don't vendor ~25 MB of OpenZeppelin / forge-std). Restore the
exact pinned versions:

```bash
forge install foundry-rs/forge-std@v1.9.7
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0
forge install OpenZeppelin/openzeppelin-foundry-upgrades@v0.4.1
```

`remappings.txt` already maps these import paths.

## Build & test

```bash
forge build          # must compile clean
forge test -vv       # all 17 tests must pass (uses ffi for UUPS validation; needs node/npx)
```

> The upgrade tests use the real OpenZeppelin Foundry Upgrades plugin, which shells out
> via `npx @openzeppelin/upgrades-core` to validate storage-layout safety. This requires
> `ffi = true` (set in `foundry.toml`) and a working `node`/`npx`. The first run downloads
> `@openzeppelin/upgrades-core`.

## Deploy (Celo Sepolia first, then Mainnet)

1. Copy `.env.example` → `.env` and fill `PRIVATE_KEY`, `OWNER_ADDRESS`, `TREASURY_ADDRESS`,
   `ETHERSCAN_API_KEY`, `CELO_RPC`, `CELO_SEPOLIA_RPC`. Fund the deployer with testnet CELO
   (https://faucet.celo.org/celo-sepolia).

2. Deploy the proxy:

   ```bash
   source .env
   forge script script/Deploy.s.sol \
     --rpc-url "$CELO_SEPOLIA_RPC" --broadcast --ffi -vvvv
   ```

   Note the printed proxy address → set `PROXY_ADDRESS` in `.env`.

3. Configure tokens + prices + promo (README §16). On **Sepolia**, set `USDM_ADDRESS` /
   `USDC_ADDRESS` / `USDT_ADDRESS` in `.env` to the testnet token addresses first (fetch
   them from the FeeCurrencyDirectory `0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276`
   `getCurrencies()`). On **Mainnet** they default to the canonical addresses.

   ```bash
   source .env
   forge script script/Configure.s.sol \
     --rpc-url "$CELO_SEPOLIA_RPC" --broadcast --ffi -vvvv
   ```

4. Mainnet: same commands with `--rpc-url "$CELO_RPC"`. Migrate ownership to a Safe multisig
   afterwards.

## Verify (Celoscan — Etherscan V2 unified key)

`forge script ... --verify` verifies automatically; otherwise verify manually:

```bash
forge verify-contract <IMPL_ADDRESS> NewsSubscription --chain celo --watch
# also verify the ERC1967Proxy
```

Collect a sample tx hash per user-facing method (MiniPay submission requirement).

## Upgrade to V2

```bash
source .env   # PROXY_ADDRESS set, broadcast by the owner
forge script script/Upgrade.s.sol \
  --rpc-url "$CELO_SEPOLIA_RPC" --broadcast --ffi -vvvv
```

The plugin validates the V2 storage layout against `NewsSubscription`
(`@custom:oz-upgrades-from`) before upgrading.

## Notes / gotchas (Celo)

- **viem strict EIP-55 checksum:** store the deployed proxy address all-lowercase or via
  `cast to-check-sum-address` — a hand-recased address breaks viem everywhere.
- **CIP-64 fee abstraction:** gas is debited in a stablecoin out-of-band; we pull a fixed
  `amount`, so no balance-delta invariants are written (none would hold on Celo).
- **Fork tests:** if you add `--fork-url` integration tests touching CELO, remember Foundry's
  EVM does not simulate Celo's `0xfd` precompile — use `vm.deal` / `deal` (see
  `../.agents/skills/celopedia-skill/references/builder-guide.md`).
