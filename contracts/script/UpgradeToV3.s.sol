// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscriptionV3} from "../src/NewsSubscriptionV3.sol";

/// @title UpgradeToV3 — upgrades the live NewsSubscription UUPS proxy to NewsSubscriptionV3.
/// @notice Reads PROXY_ADDRESS (the live NewsSubscription proxy) from env. The signer is supplied by
///         the forge CLI and MUST hold UPGRADER_ROLE. V3 adds the MANAGER_ROLE-gated
///         `setSubscriptionExpiry` / `revokeSubscription` admin overrides and introduces NO new
///         storage, so the upgrade runs with EMPTY init data (there is no reinitializer to call). The
///         OZ plugin validates UUPS storage-layout safety (NewsSubscriptionV2 → NewsSubscriptionV3,
///         a no-change / append-only-safe upgrade) via ffi.
/// @dev forge script script/UpgradeToV3.s.sol --rpc-url $CELO_RPC --broadcast --ffi --verify --account <keystore>
contract UpgradeToV3 is Script {
    function run() external {
        // Signer comes from the forge CLI (--account / --interactive / --ledger / --private-key),
        // so the UPGRADER_ROLE admin key never needs to live in .env or the shell history.
        address proxy = vm.envAddress("PROXY_ADDRESS"); // live NewsSubscription proxy

        vm.startBroadcast();
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV3.sol:NewsSubscriptionV3",
            "" // empty init data — V3 has no reinitializer / no new storage to migrate
        );
        vm.stopBroadcast();

        console.log("NewsSubscription upgraded to V3 at proxy:", proxy);
        console.log("V3 adds MANAGER_ROLE-gated setSubscriptionExpiry / revokeSubscription (support/QA override).");
    }
}
