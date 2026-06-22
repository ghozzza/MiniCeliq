# 🔐 Security Review — NewsSubscription

**Date:** 2026-06-22 · **Tooling:** [pashov/skills](https://github.com/pashov/skills) `solidity-auditor` (12 parallel attacker lenses) + Celo-specific layer (celopedia `security-patterns.md`) · **Reviewer:** AI-assisted (Claude, Sonnet agents).

> ⚠️ AI-assisted review. AI analysis cannot guarantee the absence of vulnerabilities. A human review / bug-bounty / on-chain monitoring is still recommended before scaling.

## Scope

| | |
|---|---|
| **Files** | `src/NewsSubscription.sol` · `src/NewsSubscriptionV2.sol` |
| **Out of scope** | `src/mocks/`, `test/`, `lib/` (OZ / forge-std) |
| **Lenses** | math-precision · access-control · economic-security · execution-trace · invariant · periphery · first-principles · asymmetry · boundary · numerical-gap · trust-gap · flow-gap |
| **Confidence threshold** | 80 |

## Result

**0 confirmed findings.** No unprivileged exploit path survived the 4 validation gates (attack execution → reachability → trigger → impact). All candidates were rejected/demoted because they are guarded (`nonReentrant` / `onlyOwner`), require a privileged precondition, or are by-design. This is consistent with the design: **non-custodial**, **owner-curated token allowlist**, **OpenZeppelin v5 primitives**, **19 passing tests** including UUPS upgrade + storage-layout validation.

## Leads & hardening (acted on)

Three zero-cost hardening items were applied after the review (commit history shows them):

| # | Lead (agents) | Action taken |
|---|---|---|
| 1 | **CEI ordering** in `subscribe` — external transfer ran before the expiry write; mitigated by `nonReentrant` but latent | ✅ Fixed — expiry is now written **before** `safeTransferFrom` (effects-before-interaction) |
| 2 | **`treasury == address(this)`** not rejected → would lock funds | ✅ Fixed — `initialize` + `setTreasury` now revert `InvalidTreasury()` |
| 3 | **`initializeV2` unguarded reinitializer** — front-runnable in a non-atomic upgrade | ✅ Fixed — added `onlyOwner` (defense-in-depth) |

## Leads (accepted / documented, not fixed)

These require admin action or external preconditions, or are by-design — no unprivileged exploit:

- **Fee-on-transfer token shortfall** — only bites if the owner allowlists a non-standard (FoT) token. Mitigation: only allowlist USDm / USDC / USDT (standard, non-FoT). 
- **Promo/price admin-timing & approval race** — owner can change `promoEndsAt`/price between a user's `approve` and `subscribe`; users with unlimited allowance could overpay. Centralization/UX, not unprivileged. Optional future hardening: a `maxPrice` parameter on `subscribe`.
- **Admin hygiene** — no `promoPrice <= price` check; stale promo prices reactivate when a new window opens; `setPrice(.,.,0)` silently bricks a path; prices settable for not-yet-allowlisted tokens. Operational foot-guns → covered by an ops runbook, not code.
- **Treasury blacklist DoS** — if USDC/USDT issuer blacklists the treasury, subs in that token revert until the owner rotates treasury. External precondition.
- **No token-rescue function** — intentional (the contract is non-custodial; balance stays ~0).
- **Unbounded renewal stacking** — by design; each renewal is paid.

## Celo-specific layer

Clean. The contract never touches CELO (no token-duality risk), uses no Mento swaps, and pulls a **fixed** `amount` via `safeTransferFrom`, so CIP-64 fee abstraction (gas debited in a stablecoin out-of-band) does not affect its accounting. The `eth_getLogs` 50k-block limit applies only to the off-chain event indexer (handled with chunking in the backend), not the contract.

## Post-hardening test status

`forge test` → **19 passed, 0 failed** (includes `test_Revert_SetTreasuryToSelf` and `test_InitializeV2_OnlyOwnerGuard` added for the new guards, plus the real OZ Foundry Upgrades storage-layout validation).
