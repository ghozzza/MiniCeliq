// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {NewsSubscription} from "../src/NewsSubscription.sol";
import {NewsSubscriptionV2} from "./mocks/NewsSubscriptionV2.sol"; // test-only upgrade fixture
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @title NewsSubscription test suite
/// @notice Covers happy paths (18- and 6-decimal tokens), the non-custody invariant,
///         renewal stacking, custom-error reverts, promo time-boxing, pausing,
///         owner-gated admin, isActive expiry, and the UUPS upgrade path.
/// @dev The proxy is deployed via the OpenZeppelin Foundry Upgrades plugin
///      (`Upgrades.deployUUPSProxy` / `Upgrades.upgradeProxy`), which validates
///      UUPS storage-layout safety through the build-info/AST (ffi). The contract
///      under test is the genuine UUPS implementation — no weakening for tests.
contract NewsSubscriptionTest is Test {
    NewsSubscription internal sub;
    address internal proxy;

    MockERC20 internal usdm; // 18 decimals (USDm / cUSD analog)
    MockERC20 internal usdc; // 6 decimals  (USDC / USDT analog)

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    // Plan ids
    uint8 internal constant PLAN_MONTHLY = 0;
    uint8 internal constant PLAN_YEARLY = 1;

    // Roles (must match NewsSubscription)
    bytes32 internal constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 internal constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Regular prices (token-native units), per README §16
    uint256 internal constant USDM_MONTHLY = 5e18; // $5
    uint256 internal constant USDM_YEARLY = 50e18; // $50
    uint256 internal constant USDC_MONTHLY = 5e6; // $5
    uint256 internal constant USDC_YEARLY = 50e6; // $50

    // Promo (monthly only): $0.10
    uint256 internal constant USDM_PROMO = 1e17; // $0.10
    uint256 internal constant USDC_PROMO = 1e5; // $0.10

    function setUp() public {
        usdm = new MockERC20("USD Mento", "USDm", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Prices are seeded in the initializer now (no promo by default — set per-test).
        NewsSubscription.InitToken[] memory toks = new NewsSubscription.InitToken[](2);
        toks[0] = NewsSubscription.InitToken({
            token: address(usdm),
            monthlyPrice: USDM_MONTHLY,
            yearlyPrice: USDM_YEARLY,
            monthlyPromo: 0
        });
        toks[1] = NewsSubscription.InitToken({
            token: address(usdc),
            monthlyPrice: USDC_MONTHLY,
            yearlyPrice: USDC_YEARLY,
            monthlyPromo: 0
        });

        // Deploy the UUPS proxy through the OZ Upgrades plugin (validates layout).
        proxy = Upgrades.deployUUPSProxy(
            "NewsSubscription.sol",
            abi.encodeCall(NewsSubscription.initialize, (owner, treasury, uint64(0), toks))
        );
        sub = NewsSubscription(proxy);
    }

    // ---- Initializer seeding ----

    function test_Initialize_SeedsPricesAndAllowlist() public view {
        assertTrue(sub.allowedToken(address(usdm)), "usdm allowlisted at init");
        assertTrue(sub.allowedToken(address(usdc)), "usdc allowlisted at init");
        assertEq(sub.price(address(usdm), PLAN_MONTHLY), USDM_MONTHLY, "usdm monthly seeded");
        assertEq(sub.price(address(usdm), PLAN_YEARLY), USDM_YEARLY, "usdm yearly seeded");
        assertEq(sub.price(address(usdc), PLAN_MONTHLY), USDC_MONTHLY, "usdc monthly seeded");
        assertEq(sub.price(address(usdc), PLAN_YEARLY), USDC_YEARLY, "usdc yearly seeded");
    }

    // ---- Helpers ----

    function _fundAndApprove(MockERC20 token, address user, uint256 amount) internal {
        token.mint(user, amount);
        vm.prank(user);
        token.approve(proxy, amount);
    }

    // ---- Happy paths ----

    function test_Subscribe_Monthly18Decimals() public {
        _fundAndApprove(usdm, alice, USDM_MONTHLY);

        uint64 expectedExpiry = uint64(block.timestamp) + 30 days;
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        assertEq(sub.subscriptionExpiry(alice), expectedExpiry, "monthly expiry wrong");
        assertTrue(sub.isActive(alice), "alice should be active");
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY, "treasury did not get exact $5 (18 dec)");
    }

    function test_Subscribe_Yearly6Decimals() public {
        _fundAndApprove(usdc, bob, USDC_YEARLY);

        uint64 expectedExpiry = uint64(block.timestamp) + 365 days;
        vm.prank(bob);
        sub.subscribe(PLAN_YEARLY, address(usdc));

        assertEq(sub.subscriptionExpiry(bob), expectedExpiry, "yearly expiry wrong");
        assertTrue(sub.isActive(bob), "bob should be active");
        assertEq(usdc.balanceOf(treasury), USDC_YEARLY, "treasury did not get exact $50 (6 dec)");
    }

    // ---- Non-custody invariant ----

    function test_NonCustody_ContractBalanceAlwaysZero() public {
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        // The contract must never hold funds — they go straight to treasury.
        assertEq(usdm.balanceOf(proxy), 0, "proxy must hold zero tokens (non-custodial)");
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY, "treasury must receive the exact amount");

        // Also true for a 6-decimal token in the same run.
        _fundAndApprove(usdc, bob, USDC_MONTHLY);
        vm.prank(bob);
        sub.subscribe(PLAN_MONTHLY, address(usdc));
        assertEq(usdc.balanceOf(proxy), 0, "proxy must hold zero USDC (non-custodial)");
        assertEq(usdc.balanceOf(treasury), USDC_MONTHLY, "treasury must receive exact USDC");
    }

    // ---- Renewal stacking ----

    function test_Renewal_StacksOnTopOfActiveSub() public {
        // First subscription: monthly.
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        uint64 firstExpiry = sub.subscriptionExpiry(alice);
        assertEq(firstExpiry, uint64(block.timestamp) + 30 days);

        // Renew BEFORE expiry (warp 10 days in). New expiry must extend from the
        // current expiry, not from now.
        vm.warp(block.timestamp + 10 days);
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        assertEq(
            sub.subscriptionExpiry(alice),
            firstExpiry + 30 days,
            "renewal must stack from previous expiry, not from now"
        );
    }

    function test_Renewal_AfterExpiryStartsFromNow() public {
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        // Let it lapse fully, then resubscribe — expiry restarts from now.
        vm.warp(block.timestamp + 40 days);
        assertFalse(sub.isActive(alice), "should be expired after 40 days");

        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        assertEq(sub.subscriptionExpiry(alice), uint64(block.timestamp) + 30 days, "lapsed renewal starts from now");
    }

    // ---- Reverts (custom errors) ----

    function test_Revert_TokenNotAllowed() public {
        MockERC20 rogue = new MockERC20("Rogue", "RGE", 18);
        _fundAndApprove(rogue, alice, 5e18);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NewsSubscription.TokenNotAllowed.selector, address(rogue)));
        sub.subscribe(PLAN_MONTHLY, address(rogue));
    }

    function test_Revert_InvalidPlan() public {
        _fundAndApprove(usdm, alice, USDM_MONTHLY);

        uint8 badPlan = 99; // no duration set
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NewsSubscription.InvalidPlan.selector, badPlan));
        sub.subscribe(badPlan, address(usdm));
    }

    function test_Revert_PriceNotSet() public {
        // Allowlist a fresh token but never set its price.
        MockERC20 noprice = new MockERC20("NoPrice", "NOP", 18);
        vm.prank(owner);
        sub.setAllowedToken(address(noprice), true);
        _fundAndApprove(noprice, alice, 5e18);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(NewsSubscription.PriceNotSet.selector, address(noprice), PLAN_MONTHLY)
        );
        sub.subscribe(PLAN_MONTHLY, address(noprice));
    }

    function test_Revert_ZeroAddressOnInitGuards() public {
        // setTreasury(0) must revert with ZeroAddress.
        vm.prank(owner);
        vm.expectRevert(NewsSubscription.ZeroAddress.selector);
        sub.setTreasury(address(0));
    }

    function test_Revert_SetTreasuryToSelf() public {
        // treasury == the contract itself would lock funds (no withdraw) — must revert.
        vm.prank(owner);
        vm.expectRevert(NewsSubscription.InvalidTreasury.selector);
        sub.setTreasury(proxy);
    }

    // ---- Promo (time-boxed) ----

    function test_Promo_CurrentPriceReturnsPromoWhileWindowOpen() public {
        // Set promo: $0.10 monthly, window ends 100 days from now.
        uint64 endsAt = uint64(block.timestamp) + 100 days;
        vm.startPrank(owner);
        sub.setPromoPrice(address(usdm), PLAN_MONTHLY, USDM_PROMO);
        sub.setPromoEndsAt(endsAt);
        vm.stopPrank();

        // While window is open: promo price.
        assertEq(sub.currentPrice(address(usdm), PLAN_MONTHLY), USDM_PROMO, "should be promo price in window");

        // Subscribing now charges only the promo amount.
        _fundAndApprove(usdm, alice, USDM_PROMO);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        assertEq(usdm.balanceOf(treasury), USDM_PROMO, "treasury got promo amount only");

        // After the cutoff: reverts to regular price automatically.
        vm.warp(uint256(endsAt) + 1);
        assertEq(sub.currentPrice(address(usdm), PLAN_MONTHLY), USDM_MONTHLY, "should fall back to regular after cutoff");
    }

    function test_Promo_YearlyHasNoPromoEvenInWindow() public {
        // Promo only set for monthly; yearly stays at regular price during the window.
        uint64 endsAt = uint64(block.timestamp) + 100 days;
        vm.startPrank(owner);
        sub.setPromoPrice(address(usdm), PLAN_MONTHLY, USDM_PROMO);
        sub.setPromoEndsAt(endsAt);
        vm.stopPrank();

        assertEq(sub.currentPrice(address(usdm), PLAN_YEARLY), USDM_YEARLY, "yearly never gets the promo");
    }

    function test_Promo_NotAppliedAfterEndsAtBoundary() public {
        // Exactly at promoEndsAt (block.timestamp == promoEndsAt) the promo is NOT active
        // because the guard is strict `<`.
        uint64 endsAt = uint64(block.timestamp) + 50 days;
        vm.startPrank(owner);
        sub.setPromoPrice(address(usdc), PLAN_MONTHLY, USDC_PROMO);
        sub.setPromoEndsAt(endsAt);
        vm.stopPrank();

        vm.warp(endsAt); // boundary
        assertEq(sub.currentPrice(address(usdc), PLAN_MONTHLY), USDC_MONTHLY, "at boundary promo is off");
    }

    // ---- Pausing ----

    function test_Paused_SubscribeReverts() public {
        vm.prank(owner);
        sub.pause();

        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        // Unpause restores function.
        vm.prank(owner);
        sub.unpause();
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        assertTrue(sub.isActive(alice));
    }

    // ---- onlyOwner on admin setters ----

    function test_NonManager_AdminSettersRevert() public {
        bytes memory expected =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MANAGER_ROLE);

        vm.startPrank(alice);

        vm.expectRevert(expected);
        sub.setTreasury(alice);

        vm.expectRevert(expected);
        sub.setAllowedToken(address(usdm), false);

        vm.expectRevert(expected);
        sub.setPrice(address(usdm), PLAN_MONTHLY, 1);

        vm.expectRevert(expected);
        sub.setPromoPrice(address(usdm), PLAN_MONTHLY, 1);

        vm.expectRevert(expected);
        sub.setPromoEndsAt(1);

        vm.expectRevert(expected);
        sub.setPlanDuration(2, 1 days);

        vm.expectRevert(expected);
        sub.pause();

        vm.stopPrank();
    }

    // ---- isActive expiry ----

    function test_IsActive_TrueBeforeFalseAfterExpiry() public {
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));

        assertTrue(sub.isActive(alice), "active right after subscribe");

        // 1 second before expiry: still active.
        vm.warp(uint256(sub.subscriptionExpiry(alice)) - 1);
        assertTrue(sub.isActive(alice), "active 1s before expiry");

        // At expiry (strict `>` means expiry == now is NOT active).
        vm.warp(uint256(sub.subscriptionExpiry(alice)));
        assertFalse(sub.isActive(alice), "inactive at expiry boundary");

        // After expiry.
        vm.warp(uint256(sub.subscriptionExpiry(alice)) + 1);
        assertFalse(sub.isActive(alice), "inactive after expiry");
    }

    // ---- UUPS upgrade ----

    function test_Upgrade_ToV2PreservesStateAndExposesVersion() public {
        // Seed state on V1.
        _fundAndApprove(usdm, alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        uint64 aliceExpiry = sub.subscriptionExpiry(alice);
        assertTrue(aliceExpiry != 0);

        // Upgrade the proxy to V2 (owner-authorized), calling the V2 reinitializer
        // atomically. The plugin validates UUPS storage-layout safety. `startPrank`
        // (not a single `prank`) because `Upgrades.upgradeProxy` makes several calls.
        vm.startPrank(owner);
        Upgrades.upgradeProxy(proxy, "NewsSubscriptionV2.sol", abi.encodeCall(NewsSubscriptionV2.initializeV2, ()));
        vm.stopPrank();

        NewsSubscriptionV2 v2 = NewsSubscriptionV2(proxy);

        // State preserved across the upgrade.
        assertEq(v2.subscriptionExpiry(alice), aliceExpiry, "subscription state must survive upgrade");
        assertEq(v2.treasury(), treasury, "treasury must survive upgrade");
        assertTrue(v2.allowedToken(address(usdm)), "allowlist must survive upgrade");
        assertEq(v2.price(address(usdm), PLAN_MONTHLY), USDM_MONTHLY, "price must survive upgrade");

        // New behavior available.
        assertEq(v2.version(), "v2", "V2 version() should return v2");

        // Still functional after upgrade.
        _fundAndApprove(usdm, bob, USDM_YEARLY);
        vm.prank(bob);
        v2.subscribe(PLAN_YEARLY, address(usdm));
        assertTrue(v2.isActive(bob), "subscribe still works on V2");
    }

    function test_Upgrade_OnlyUpgraderCanUpgrade() public {
        // A non-upgrader upgrade attempt must revert at _authorizeUpgrade.
        NewsSubscriptionV2 v2Impl = new NewsSubscriptionV2();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, UPGRADER_ROLE)
        );
        NewsSubscription(proxy).upgradeToAndCall(address(v2Impl), "");
    }

    function test_InitializeV2_OnlyUpgraderGuard() public {
        // Two-step upgrade: set the V2 implementation WITHOUT calling initializeV2
        // (empty calldata), authorized by an upgrader.
        NewsSubscriptionV2 v2Impl = new NewsSubscriptionV2();
        vm.prank(owner);
        NewsSubscription(proxy).upgradeToAndCall(address(v2Impl), "");

        NewsSubscriptionV2 v2 = NewsSubscriptionV2(proxy);

        // A front-runner (non-upgrader) must NOT be able to consume the reinitializer slot.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, UPGRADER_ROLE)
        );
        v2.initializeV2();

        // An upgrader can complete the migration; state/behaviour intact.
        vm.prank(owner);
        v2.initializeV2();
        assertEq(v2.version(), "v2", "upgrader completes V2 init");
    }
}
