// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NewsSubscription} from "../src/NewsSubscription.sol";

/// @title Configure — allowlist tokens + set regular/promo prices on a deployed proxy.
/// @notice Implements the pricing config from README §16:
///         - Allowlist USDm (18 dec), USDC (6 dec), USDT (6 dec).
///         - Regular price: Monthly $5, Yearly $50 (token-native units).
///         - Promo price (monthly only): $0.10.
///         - promoEndsAt = 1782864000 (2026-07-01T00:00:00Z = end of Jun 30 UTC).
/// @dev Token addresses are read from env so this script works on both Mainnet and
///      Sepolia (testnet token addresses differ — fetch them from the live
///      FeeCurrencyDirectory `getCurrencies()` per README §8). Mainnet defaults are
///      provided as documentation. Run with:
///        forge script script/Configure.s.sol --rpc-url $CELO_SEPOLIA_RPC --broadcast
contract Configure is Script {
    // Plan ids
    uint8 internal constant PLAN_MONTHLY = 0;
    uint8 internal constant PLAN_YEARLY = 1;

    // Promo cutoff: 2026-07-01T00:00:00Z (end of Jun 30 UTC).
    uint64 internal constant PROMO_ENDS_AT = 1782864000;

    // ---- Mainnet token addresses (README §8) used as env fallbacks ----
    address internal constant USDM_MAINNET = 0x765DE816845861e75A25fCA122bb6898B8B1282a; // 18 dec
    address internal constant USDC_MAINNET = 0xcebA9300f2b948710d2653dD7B07f33A8B32118C; // 6 dec
    address internal constant USDT_MAINNET = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e; // 6 dec

    function run() external {
        NewsSubscription sub = NewsSubscription(vm.envAddress("PROXY_ADDRESS"));

        // Token addresses (override per-network via env; default to mainnet).
        address usdm = vm.envOr("USDM_ADDRESS", USDM_MAINNET);
        address usdc = vm.envOr("USDC_ADDRESS", USDC_MAINNET);
        address usdt = vm.envOr("USDT_ADDRESS", USDT_MAINNET);

        // Prices in token-native units (README §16).
        uint256 monthly18 = 5e18; // $5  (USDm, 18 dec)
        uint256 yearly18 = 50e18; // $50 (USDm, 18 dec)
        uint256 promo18 = 1e17; // $0.10 (USDm, 18 dec)

        uint256 monthly6 = 5e6; // $5  (USDC/USDT, 6 dec)
        uint256 yearly6 = 50e6; // $50 (USDC/USDT, 6 dec)
        uint256 promo6 = 1e5; // $0.10 (USDC/USDT, 6 dec)

        vm.startBroadcast();

        // Allowlist.
        sub.setAllowedToken(usdm, true);
        sub.setAllowedToken(usdc, true);
        sub.setAllowedToken(usdt, true);

        // Regular prices — USDm (18 dec).
        sub.setPrice(usdm, PLAN_MONTHLY, monthly18);
        sub.setPrice(usdm, PLAN_YEARLY, yearly18);
        // Regular prices — USDC (6 dec).
        sub.setPrice(usdc, PLAN_MONTHLY, monthly6);
        sub.setPrice(usdc, PLAN_YEARLY, yearly6);
        // Regular prices — USDT (6 dec).
        sub.setPrice(usdt, PLAN_MONTHLY, monthly6);
        sub.setPrice(usdt, PLAN_YEARLY, yearly6);

        // Promo prices — monthly only (yearly stays at regular $50).
        sub.setPromoPrice(usdm, PLAN_MONTHLY, promo18);
        sub.setPromoPrice(usdc, PLAN_MONTHLY, promo6);
        sub.setPromoPrice(usdt, PLAN_MONTHLY, promo6);

        // Promo window.
        sub.setPromoEndsAt(PROMO_ENDS_AT);

        vm.stopBroadcast();

        console.log("Configured NewsSubscription at:", address(sub));
        console.log("  USDm:", usdm);
        console.log("  USDC:", usdc);
        console.log("  USDT:", usdt);
        console.log("  promoEndsAt:", PROMO_ENDS_AT);
    }
}
