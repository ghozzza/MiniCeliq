// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NewsSubscription} from "./NewsSubscription.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal interface for the Ceny reward token's role-gated mint.
///         The live NewsSubscription proxy is granted Ceny's MINTER_ROLE so it can mint rewards.
interface ICenyMintable {
    function mint(address to, uint256 amount) external;
}

/// @title NewsSubscription V2 — auto-mints a CENY reward on every subscribe.
/// @notice Real (deployable) upgrade of the live NewsSubscription proxy. On every `subscribe`,
///         the subscriber earns a CENY reward minted by this contract (granted Ceny's MINTER_ROLE).
/// @dev Design principles (inherited from V1):
///      - Best-effort reward: a reward-mint failure must NEVER revert/block a paid subscription.
///        The mint is wrapped in `try/catch` so a missing role, an unset token, or a Ceny revert
///        is swallowed — the subscription (the user already paid for) always goes through.
///      - No `require`: every guard is `if (cond) revert CustomError(...)` (inherited errors reused).
///      - Append-only storage: V1 keeps its own `__gap`; V2 appends new vars + its own `__gap2`.
///      - `subscribe` is overridden (V1 marked it `virtual`); since an external function can't be
///        `super`-called, V1's exact body is re-implemented here, then `_mintReward` runs last.
///      - `reinitializeV2` is a `reinitializer(2)`, NOT a fresh initializer: V1's `initialize`
///        already ran the parent initializers on the proxy, so V2 must not (and cannot) re-run them.
///        The two suppressions tell the OZ Upgrades validator exactly that; storage-layout safety
///        (NewsSubscription → NewsSubscriptionV2, append-only) is still fully validated.
/// @custom:oz-upgrades-from NewsSubscription
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract NewsSubscriptionV2 is NewsSubscription {
    using SafeERC20 for IERC20;

    // ---- Storage (APPENDED after V1's layout; V1 keeps its own __gap — do NOT reorder) ----
    address public cenyToken; // Ceny reward token (0 = reward minting disabled)
    mapping(uint8 => uint256) public cenyReward; // plan => CENY reward amount (18 dec)
    uint256[48] private __gap2; // reserve room for future V2 vars

    // ---- Events ----
    event CenyTokenUpdated(address token);
    event CenyRewardUpdated(uint8 indexed plan, uint256 amount);
    event CenyRewarded(address indexed user, uint8 indexed plan, uint256 amount);

    /// @notice One-time V2 migration hook: wire the Ceny reward token + per-plan reward amounts.
    /// @dev `reinitializer(2)` allows exactly one call after the V1 initializer (version 1).
    ///      `onlyRole(UPGRADER_ROLE)` keeps the migration role-gated (matches `_authorizeUpgrade`).
    ///      `cenyToken_ == address(0)` is allowed so wiring can be deferred (rewards simply stay off
    ///      until `setCenyToken` is called).
    /// @param cenyToken_ Ceny reward token address (0 to defer wiring; rewards off until set).
    /// @param monthlyReward CENY reward for plan 0 (18 decimals).
    /// @param yearlyReward CENY reward for plan 1 (18 decimals).
    function reinitializeV2(address cenyToken_, uint256 monthlyReward, uint256 yearlyReward)
        external
        reinitializer(2)
        onlyRole(UPGRADER_ROLE)
    {
        cenyToken = cenyToken_;
        cenyReward[0] = monthlyReward;
        cenyReward[1] = yearlyReward;
        emit CenyTokenUpdated(cenyToken_);
        emit CenyRewardUpdated(0, monthlyReward);
        emit CenyRewardUpdated(1, yearlyReward);
    }

    /// @notice Subscribe / renew, then mint the subscriber a CENY reward (best-effort).
    /// @dev Re-implements V1's exact body (external fn → no `super` call possible), then rewards.
    ///      The reward is the ONLY behavioural change vs V1; payment logic is byte-for-byte the same.
    /// @param plan 0 = monthly, 1 = yearly (or any plan with a non-zero `planDuration`).
    /// @param token Allowlisted stablecoin used for payment (USDm / USDC / USDT).
    function subscribe(uint8 plan, address token) external override nonReentrant whenNotPaused {
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        uint64 duration = planDuration[plan];
        if (duration == 0) revert InvalidPlan(plan);
        uint256 amount = currentPrice(token, plan); // promo-aware, time-boxed
        if (amount == 0) revert PriceNotSet(token, plan);

        // Effects before interaction (CEI): write the new expiry first. A revert in the
        // transfer below rolls this back, so subscriptions are never granted unpaid.
        uint64 nowTs = uint64(block.timestamp);
        uint64 current = subscriptionExpiry[msg.sender];
        uint64 base = current > nowTs ? current : nowTs; // stack on top of an active sub
        uint64 newExpiry = base + duration;
        subscriptionExpiry[msg.sender] = newExpiry;

        // Interaction last. Non-custodial: funds never rest in this contract.
        IERC20(token).safeTransferFrom(msg.sender, treasury, amount);

        emit Subscribed(msg.sender, plan, token, amount, newExpiry);

        // Reward AFTER the paid subscription is fully settled. Best-effort: never blocks payment.
        _mintReward(msg.sender, plan);
    }

    /// @dev Best-effort CENY reward mint. A failure (unset token, zero reward, revoked MINTER_ROLE,
    ///      cap hit, or any Ceny revert) is swallowed so the already-paid subscription still succeeds.
    function _mintReward(address user, uint8 plan) internal {
        if (cenyToken == address(0)) return; // reward minting disabled
        uint256 r = cenyReward[plan];
        if (r == 0) return; // no reward configured for this plan
        try ICenyMintable(cenyToken).mint(user, r) {
            emit CenyRewarded(user, plan, r);
        } catch {
            // Swallow: a reward-mint failure must never revert a paid subscription.
        }
    }

    // ---- Admin (MANAGER_ROLE) ----

    /// @notice Set (or change) the Ceny reward token. 0 disables reward minting.
    function setCenyToken(address t) external onlyRole(MANAGER_ROLE) {
        cenyToken = t;
        emit CenyTokenUpdated(t);
    }

    /// @notice Set the CENY reward amount (18 dec) for a plan id. 0 disables the reward for that plan.
    function setCenyReward(uint8 plan, uint256 amount) external onlyRole(MANAGER_ROLE) {
        cenyReward[plan] = amount;
        emit CenyRewardUpdated(plan, amount);
    }
}
