// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NewsSubscription} from "./NewsSubscription.sol";

/// @title NewsSubscriptionV2 — trivial upgrade used to exercise the UUPS upgrade path.
/// @notice Inherits all of V1's storage and logic unchanged (storage-layout safe) and
///         adds a single `version()` getter. Existing state must be preserved after
///         `upgradeToAndCall` to V2.
/// @dev No new state variables are added, so the inherited `__gap` is untouched and
///      the layout is trivially compatible. A real future upgrade that adds storage
///      would consume slots from `__gap` and shrink its size accordingly.
///
///      `initializeV2` is a `reinitializer(2)` so the upgrade can be performed atomically
///      via `upgradeToAndCall(newImpl, abi.encodeCall(NewsSubscriptionV2.initializeV2, ()))`.
///      It deliberately does NOT re-run the parent (`Ownable`/`ReentrancyGuard`/…)
///      initializers — those were already run by V1's `initialize` on the live proxy and
///      re-running them would either revert or wipe state. The two suppressions below tell
///      the OZ Upgrades validator exactly this: V2 has no fresh initializer and must not
///      re-call parent initializers. Storage-layout safety is still fully validated.
/// @custom:oz-upgrades-from NewsSubscription
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract NewsSubscriptionV2 is NewsSubscription {
    /// @notice One-time V2 migration hook. No new state to migrate; reserved for future use.
    /// @dev `reinitializer(2)` allows exactly one call after the V1 initializer (version 1).
    ///      `onlyOwner` prevents a front-runner from consuming the reinitializer slot in a
    ///      non-atomic upgrade flow (defense-in-depth; the atomic upgradeToAndCall path is
    ///      already owner-gated via `_authorizeUpgrade`).
    function initializeV2() external reinitializer(2) onlyOwner {}

    /// @notice Identifies the implementation version. Used to confirm a successful upgrade.
    /// @return The version string "v2".
    function version() external pure returns (string memory) {
        return "v2";
    }
}
