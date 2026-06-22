// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {Ceny} from "../src/Ceny.sol";

/// @title CenyDeploy — deploys the Ceny ERC-20 UUPS proxy.
/// @notice Reads OWNER_ADDRESS (admin: DEFAULT_ADMIN + MINTER + UPGRADER) and signs in-script via
///         PRIVATE_KEY. The claim signer defaults to the admin and can be overridden via
///         CENY_CLAIM_SIGNER (set it to the backend signer address). Cap = 1,000,000,000 CENY.
/// @dev forge script script/CenyDeploy.s.sol --rpc-url $CELO_RPC --broadcast --ffi
contract CenyDeploy is Script {
    uint256 internal constant CAP = 1_000_000_000e18; // 1B CENY (18 decimals)

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY"); // signed in-script; never on the CLI
        address admin = vm.envAddress("OWNER_ADDRESS");
        address claimSigner = vm.envOr("CENY_CLAIM_SIGNER", admin); // backend signer; defaults to admin

        vm.startBroadcast(deployerKey);
        address proxy = Upgrades.deployUUPSProxy("Ceny.sol", abi.encodeCall(Ceny.initialize, (admin, CAP, claimSigner)));
        vm.stopBroadcast();

        console.log("Ceny proxy:    ", proxy);
        console.log("  admin:       ", admin);
        console.log("  claim signer:", claimSigner);
        console.log("  cap (wei):   ", CAP);
    }
}
