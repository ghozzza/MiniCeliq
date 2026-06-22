// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {NewsSubscription} from "../src/NewsSubscription.sol";

/// @title Deploy — deploys the NewsSubscription UUPS proxy with prices seeded in the initializer.
/// @notice Reads OWNER_ADDRESS (initial admin: DEFAULT_ADMIN + MANAGER + UPGRADER) and
///         TREASURY_ADDRESS from env. Token addresses default to Celo Mainnet (README §8) and can
///         be overridden per-network via env — Sepolia token addresses differ, fetch them from the
///         FeeCurrencyDirectory `getCurrencies()`. Prices (README §16): Monthly $5, Yearly $50,
///         monthly promo $0.10 until 2026-06-30 UTC. All prices stay adjustable via the setters.
/// @dev forge script script/Deploy.s.sol --rpc-url $CELO_SEPOLIA_RPC --broadcast --ffi --verify
contract Deploy is Script {
    uint64 internal constant PROMO_ENDS_AT = 1782864000; // 2026-07-01T00:00:00Z (end of Jun 30 UTC)

    // Celo Mainnet token addresses (README §8) — env fallbacks.
    address internal constant USDM_MAINNET = 0x765DE816845861e75A25fCA122bb6898B8B1282a; // 18 dec
    address internal constant USDC_MAINNET = 0xcebA9300f2b948710d2653dD7B07f33A8B32118C; // 6 dec
    address internal constant USDT_MAINNET = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e; // 6 dec

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY"); // signed in-script; never on the CLI
        address owner = vm.envAddress("OWNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        address usdm = vm.envOr("USDM_ADDRESS", USDM_MAINNET);
        address usdc = vm.envOr("USDC_ADDRESS", USDC_MAINNET);
        address usdt = vm.envOr("USDT_ADDRESS", USDT_MAINNET);

        // Prices in token-native units: USDm = 18 dec, USDC/USDT = 6 dec.
        NewsSubscription.InitToken[] memory tokens = new NewsSubscription.InitToken[](3);
        tokens[0] =
            NewsSubscription.InitToken({token: usdm, monthlyPrice: 5e18, yearlyPrice: 50e18, monthlyPromo: 1e17});
        tokens[1] = NewsSubscription.InitToken({token: usdc, monthlyPrice: 5e6, yearlyPrice: 50e6, monthlyPromo: 1e5});
        tokens[2] = NewsSubscription.InitToken({token: usdt, monthlyPrice: 5e6, yearlyPrice: 50e6, monthlyPromo: 1e5});

        vm.startBroadcast(deployerKey);
        address proxy = Upgrades.deployUUPSProxy(
            "NewsSubscription.sol",
            abi.encodeCall(NewsSubscription.initialize, (owner, treasury, PROMO_ENDS_AT, tokens))
        );
        vm.stopBroadcast();

        console.log("NewsSubscription proxy:", proxy);
        console.log("  admin:   ", owner);
        console.log("  treasury:", treasury);
        console.log("Prices seeded in the initializer. Adjust later via setPrice / setPromoPrice / setPromoEndsAt.");
    }
}
