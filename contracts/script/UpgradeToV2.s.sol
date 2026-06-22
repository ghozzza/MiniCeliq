// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscriptionV2} from "../src/NewsSubscriptionV2.sol";

/// @title UpgradeToV2 — upgrades the live NewsSubscription UUPS proxy to NewsSubscriptionV2.
/// @notice Reads PROXY_ADDRESS (the live NewsSubscription proxy) + CENY_ADDRESS (the deployed Ceny
///         proxy) from env, and optional reward amounts CENY_MONTHLY_REWARD / CENY_YEARLY_REWARD
///         (defaults 10e18 / 120e18). The signer is supplied by the forge CLI and MUST hold
///         UPGRADER_ROLE. Atomically upgrades + runs `reinitializeV2(CENY, monthly, yearly)`. The OZ
///         plugin validates UUPS storage-layout safety (NewsSubscription → NewsSubscriptionV2) via ffi.
/// @dev Prerequisite: the proxy must already hold Ceny's MINTER_ROLE for rewards to mint
///      (best-effort — the upgrade still works without it; rewards just no-op until granted).
///      forge script script/UpgradeToV2.s.sol --rpc-url $CELO_RPC --broadcast --ffi --verify --interactive
contract UpgradeToV2 is Script {
    function run() external {
        // Signer comes from the forge CLI (--interactive / --account / --ledger / --private-key),
        // so the UPGRADER_ROLE admin key never needs to live in .env or the shell history.
        address proxy = vm.envAddress("PROXY_ADDRESS"); // live NewsSubscription proxy
        address ceny = vm.envAddress("CENY_ADDRESS"); // deployed Ceny proxy
        uint256 monthlyReward = vm.envOr("CENY_MONTHLY_REWARD", uint256(10e18)); // plan 0 reward
        uint256 yearlyReward = vm.envOr("CENY_YEARLY_REWARD", uint256(120e18)); // plan 1 reward

        vm.startBroadcast();
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
