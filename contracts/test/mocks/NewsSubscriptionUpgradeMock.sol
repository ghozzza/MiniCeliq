// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NewsSubscription} from "../../src/NewsSubscription.sol";

/// @title NewsSubscriptionUpgradeMock — TEST-ONLY upgrade fixture (not a product version).
/// @notice Exists solely to exercise the UUPS upgrade path in the test suite: it proves the
///         proxy can be upgraded, that storage layout stays compatible, that existing state is
///         preserved, and that `_authorizeUpgrade` is role-gated. It is NOT deployed and lives
///         under `test/` on purpose. The real upgrade target lives in `src/NewsSubscriptionV2.sol`
///         (with `script/UpgradeToV2.s.sol`) and is validated against `NewsSubscription` the same way.
/// @dev Inherits all of V1 unchanged (no new storage → `__gap` untouched, layout trivially safe).
///      `initializeV2` is a `reinitializer(2)` so the upgrade can run atomically via
///      `upgradeToAndCall`. It does NOT re-run parent initializers (already run by V1) — the two
///      suppressions tell the OZ Upgrades validator exactly that. Layout safety is still validated.
/// @custom:oz-upgrades-from NewsSubscription
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract NewsSubscriptionUpgradeMock is NewsSubscription {
    /// @notice One-time V2 migration hook. No new state to migrate; reserved for future use.
    /// @dev `reinitializer(2)` allows exactly one call after the V1 initializer (version 1).
    ///      `onlyRole(UPGRADER_ROLE)` prevents a front-runner from consuming the reinitializer
    ///      slot in a non-atomic upgrade flow (defense-in-depth; the atomic upgradeToAndCall
    ///      path is already role-gated via `_authorizeUpgrade`).
    function initializeV2() external reinitializer(2) onlyRole(UPGRADER_ROLE) {}

    /// @notice Identifies the implementation version. Used to confirm a successful upgrade.
    /// @return The version string "v2".
    function version() external pure returns (string memory) {
        return "v2";
    }
}
