// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscription} from "../src/NewsSubscription.sol";

/// @title Deploy — deploys the NewsSubscription UUPS proxy.
/// @notice Reads OWNER_ADDRESS and TREASURY_ADDRESS from the environment.
/// @dev Run with:
///      forge script script/Deploy.s.sol \
///        --rpc-url $CELO_SEPOLIA_RPC --broadcast --ffi --verify
///      The Upgrades plugin validates UUPS safety (needs ffi/ast/build_info).
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();
        address proxy = Upgrades.deployUUPSProxy(
            "NewsSubscription.sol",
            abi.encodeCall(NewsSubscription.initialize, (owner, treasury))
        );
        vm.stopBroadcast();

        console.log("NewsSubscription proxy:", proxy);
        console.log("  owner:               ", owner);
        console.log("  treasury:            ", treasury);
        console.log("Next: set PROXY_ADDRESS to the proxy above, then run script/Configure.s.sol");
    }
}
