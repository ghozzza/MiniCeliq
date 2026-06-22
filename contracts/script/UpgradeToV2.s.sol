// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscriptionV2} from "../src/NewsSubscriptionV2.sol";

/// @title UpgradeToV2 — upgrades the live NewsSubscription UUPS proxy to NewsSubscriptionV2.
/// @notice Reads PROXY_ADDRESS (the live NewsSubscription proxy) + CENY_ADDRESS (the deployed Ceny
///         proxy) from env, and optional reward amounts CENY_MONTHLY_REWARD / CENY_YEARLY_REWARD
///         (defaults 10e18 / 120e18). Signs in-script via PRIVATE_KEY (the UPGRADER_ROLE holder).
///         Atomically upgrades + runs `reinitializeV2(CENY, monthly, yearly)`. The OZ plugin
///         validates UUPS storage-layout safety (NewsSubscription → NewsSubscriptionV2) via ffi.
/// @dev Prerequisite: the proxy must already hold Ceny's MINTER_ROLE for rewards to mint
///      (best-effort — the upgrade still works without it; rewards just no-op until granted).
///      forge script script/UpgradeToV2.s.sol --rpc-url $CELO_RPC --broadcast --ffi --verify
contract UpgradeToV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY"); // signed in-script; never on the CLI
        address proxy = vm.envAddress("PROXY_ADDRESS"); // live NewsSubscription proxy
        address ceny = vm.envAddress("CENY_ADDRESS"); // deployed Ceny proxy
        uint256 monthlyReward = vm.envOr("CENY_MONTHLY_REWARD", uint256(10e18)); // plan 0 reward
        uint256 yearlyReward = vm.envOr("CENY_YEARLY_REWARD", uint256(120e18)); // plan 1 reward

        vm.startBroadcast(deployerKey);
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV2.sol:NewsSubscriptionV2",
            abi.encodeCall(NewsSubscriptionV2.reinitializeV2, (ceny, monthlyReward, yearlyReward))
        );
        vm.stopBroadcast();

        console.log("NewsSubscription upgraded to V2 at proxy:", proxy);
        console.log("  ceny token:    ", ceny);
        console.log("  monthly reward:", monthlyReward);
        console.log("  yearly reward: ", yearlyReward);
        console.log("Reminder: grant the proxy Ceny's MINTER_ROLE so rewards can mint.");
    }
}
