// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscriptionV2} from "../src/NewsSubscriptionV2.sol";

/// @title Upgrade — upgrade the live proxy to NewsSubscriptionV2 (UUPS).
/// @notice Validates storage-layout safety against the on-disk reference before upgrading
///         (`@custom:oz-upgrades-from NewsSubscription` on V2), then calls the V2
///         reinitializer atomically.
/// @dev Must be broadcast by the proxy owner. Run with:
///        forge script script/Upgrade.s.sol \
///          --rpc-url $CELO_SEPOLIA_RPC --broadcast --ffi
contract Upgrade is Script {
    function run() external {
        address proxy = vm.envAddress("PROXY_ADDRESS");

        vm.startBroadcast();
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV2.sol",
            abi.encodeCall(NewsSubscriptionV2.initializeV2, ())
        );
        vm.stopBroadcast();

        console.log("Upgraded proxy to NewsSubscriptionV2:", proxy);
        console.log("  version():", NewsSubscriptionV2(proxy).version());
    }
}
