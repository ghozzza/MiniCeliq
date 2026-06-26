// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NewsSubscriptionV2} from "./NewsSubscriptionV2.sol";

/// @title NewsSubscription V3 — admin override to set/revoke a user's subscription expiry.
/// @notice Real (deployable) upgrade of the live NewsSubscription proxy. Adds a MANAGER_ROLE-gated
///         support/QA control that writes a user's `subscriptionExpiry` directly — letting an admin
///         expire (revoke) an active subscriber back to "free", grant a future expiry, or otherwise
///         correct a user's state without an on-chain payment. Intended for support + testing only.
/// @dev Design principles (inherited from V1/V2):
///      - No new storage: V3 operates purely on the inherited `subscriptionExpiry` mapping, so it adds
///        NO state vars and therefore NO `__gap` / reinitializer of its own. Storage layout is
///        byte-for-byte identical to V2 (a no-op, fully append-only-safe upgrade).
///      - No new initializer: V3 inherits V2's `reinitializer(2)` migration hook and adds none; the
///        upgrade runs with empty init data (nothing to reinitialize).
///      - No `require`: any guard would be `if (cond) revert CustomError(...)`. These two setters are
///        simple writes with no extra invariants, so no new custom error is needed.
///      - Admin override is intentionally flexible: `setSubscriptionExpiry` can move a user's expiry to
///        any timestamp (past = inactive, future = active); `revokeSubscription` is the 0 convenience.
///      - The two OZ suppressions mirror V2: V3 (like V2) defines no fresh `initialize`, so the
///        validator is told that's intentional. Storage-layout safety (V2 → V3, no change) is still
///        fully validated by the OZ Upgrades plugin.
/// @custom:oz-upgrades-from NewsSubscriptionV2
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract NewsSubscriptionV3 is NewsSubscriptionV2 {
    // ---- Events ----
    /// @notice Emitted whenever an admin overrides a user's subscription expiry (set or revoke).
    event SubscriptionExpiryUpdated(address indexed user, uint64 newExpiry);

    // ---- Admin (MANAGER_ROLE) ----

    /// @notice Admin override: set a user's subscription expiry to any timestamp.
    /// @dev Support/testing tool, gated to MANAGER_ROLE. Writes the inherited `subscriptionExpiry`
    ///      mapping directly (no payment, no reward). A `newExpiry` in the future makes the user active
    ///      (`isActive == true`); a past timestamp (or 0) makes them inactive (back to "free").
    /// @param user The subscriber whose expiry to override.
    /// @param newExpiry The new unix expiry to write (future = active, past/0 = inactive).
    function setSubscriptionExpiry(address user, uint64 newExpiry) external onlyRole(MANAGER_ROLE) {
        subscriptionExpiry[user] = newExpiry;
        emit SubscriptionExpiryUpdated(user, newExpiry);
    }

    /// @notice Admin convenience: revoke a user's subscription, sending them back to "free".
    /// @dev Support/testing tool, gated to MANAGER_ROLE. Sets the user's expiry to 0, so
    ///      `isActive(user)` becomes false. Equivalent to `setSubscriptionExpiry(user, 0)`.
    /// @param user The subscriber to revoke.
    function revokeSubscription(address user) external onlyRole(MANAGER_ROLE) {
        subscriptionExpiry[user] = 0;
        emit SubscriptionExpiryUpdated(user, 0);
    }
}
