// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {NewsSubscription} from "../src/NewsSubscription.sol";
import {NewsSubscriptionV2} from "../src/NewsSubscriptionV2.sol";
import {NewsSubscriptionV3} from "../src/NewsSubscriptionV3.sol";
import {Ceny} from "../src/Ceny.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @title NewsSubscriptionV3 test suite
/// @notice Covers the V3 admin-override upgrade: a MANAGER_ROLE admin can revoke an active subscriber
///         back to "free" (`revokeSubscription`) or write an arbitrary expiry (`setSubscriptionExpiry`,
///         future = active, past = inactive), both emit `SubscriptionExpiryUpdated`, and both revert for
///         a non-MANAGER_ROLE caller. Also asserts V2 behaviour is preserved post-upgrade (subscribe
///         still works, still stacks expiry, still best-effort mints the CENY reward).
/// @dev The proxy is upgraded via the OZ Foundry Upgrades plugin, which validates UUPS storage-layout
///      safety (NewsSubscriptionV2 → NewsSubscriptionV3, no storage change) through the build-info/AST
///      (ffi). The upgrade carries empty init data — V3 introduces no reinitializer.
contract NewsSubscriptionV3Test is Test {
    NewsSubscription internal sub; // V1 view of the proxy
    NewsSubscriptionV3 internal v3; // V3 view of the proxy (after upgrade)
    address internal proxy;

    Ceny internal ceny;
    address internal cenyProxy;

    MockERC20 internal usdm; // 18 decimals payment token

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint8 internal constant PLAN_MONTHLY = 0;
    uint8 internal constant PLAN_YEARLY = 1;

    bytes32 internal constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 internal constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 internal constant USDM_MONTHLY = 5e18; // $5
    uint256 internal constant USDM_YEARLY = 50e18; // $50

    uint256 internal constant MONTHLY_REWARD = 10e18; // CENY for plan 0
    uint256 internal constant YEARLY_REWARD = 120e18; // CENY for plan 1
    uint256 internal constant CENY_CAP = 1_000_000_000e18; // 1B CENY

    // Mirror the V3 event for expectEmit.
    event SubscriptionExpiryUpdated(address indexed user, uint64 newExpiry);

    function setUp() public {
        usdm = new MockERC20("USD Mento", "USDm", 18);

        // ---- Deploy V1 proxy with usdm seeded ----
        NewsSubscription.InitToken[] memory toks = new NewsSubscription.InitToken[](1);
        toks[0] = NewsSubscription.InitToken({
            token: address(usdm),
            monthlyPrice: USDM_MONTHLY,
            yearlyPrice: USDM_YEARLY,
            monthlyPromo: 0
        });
        proxy = Upgrades.deployUUPSProxy(
            "NewsSubscription.sol",
            abi.encodeCall(NewsSubscription.initialize, (owner, treasury, uint64(0), toks))
        );
        sub = NewsSubscription(proxy);

        // ---- Deploy Ceny proxy (admin = owner) + grant the subscription proxy MINTER_ROLE ----
        cenyProxy = Upgrades.deployUUPSProxy("Ceny.sol", abi.encodeCall(Ceny.initialize, (owner, CENY_CAP, owner)));
        ceny = Ceny(cenyProxy);
        vm.prank(owner);
        ceny.grantRole(MINTER_ROLE, proxy);

        // ---- Subscribe alice on V1 so she is active before the upgrade ----
        _fundAndApprove(alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        assertTrue(sub.isActive(alice), "alice active pre-upgrade");
    }

    // ---- Helpers ----

    function _fundAndApprove(address user, uint256 amount) internal {
        usdm.mint(user, amount);
        vm.prank(user);
        usdm.approve(proxy, amount);
    }

    /// @dev Upgrade the proxy to V2 (wiring Ceny + rewards) then to V3 (empty init data — no reinitializer).
    function _upgradeToV3() internal {
        vm.startPrank(owner);
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV2.sol:NewsSubscriptionV2",
            abi.encodeCall(NewsSubscriptionV2.reinitializeV2, (cenyProxy, MONTHLY_REWARD, YEARLY_REWARD))
        );
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV3.sol:NewsSubscriptionV3",
            "" // no reinitializer to run — V3 adds no storage
        );
        vm.stopPrank();
        v3 = NewsSubscriptionV3(proxy);
    }

    // ---- State survives the upgrade ----

    function test_Upgrade_PreservesActiveSubscriber() public {
        _upgradeToV3();
        assertTrue(v3.isActive(alice), "alice sub survives V2+V3 upgrade");
        assertEq(v3.treasury(), treasury, "treasury survives upgrade");
        assertEq(v3.cenyToken(), cenyProxy, "ceny wiring (V2) survives upgrade");
    }

    // ---- revokeSubscription ----

    function test_RevokeSubscription_SendsUserBackToFree() public {
        _upgradeToV3();
        assertTrue(v3.isActive(alice), "alice active before revoke");

        vm.expectEmit(true, false, false, true, proxy);
        emit SubscriptionExpiryUpdated(alice, 0);
        vm.prank(owner);
        v3.revokeSubscription(alice);

        assertFalse(v3.isActive(alice), "alice inactive after revoke");
        assertEq(v3.subscriptionExpiry(alice), 0, "alice expiry zeroed");
    }

    function test_RevokeSubscription_OnlyManager() public {
        _upgradeToV3();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MANAGER_ROLE)
        );
        v3.revokeSubscription(alice);
    }

    // ---- setSubscriptionExpiry ----

    function test_SetSubscriptionExpiry_FutureActivatesPastDeactivates() public {
        _upgradeToV3();

        // Revoke first so we start from "free".
        vm.prank(owner);
        v3.revokeSubscription(bob);
        assertFalse(v3.isActive(bob), "bob starts inactive");

        // A future expiry makes bob active.
        uint64 futureTs = uint64(block.timestamp + 30 days);
        vm.expectEmit(true, false, false, true, proxy);
        emit SubscriptionExpiryUpdated(bob, futureTs);
        vm.prank(owner);
        v3.setSubscriptionExpiry(bob, futureTs);
        assertTrue(v3.isActive(bob), "future expiry activates bob");
        assertEq(v3.subscriptionExpiry(bob), futureTs, "future expiry stored");

        // A past expiry makes bob inactive again.
        uint64 pastTs = uint64(block.timestamp - 1);
        vm.prank(owner);
        v3.setSubscriptionExpiry(bob, pastTs);
        assertFalse(v3.isActive(bob), "past expiry deactivates bob");
        assertEq(v3.subscriptionExpiry(bob), pastTs, "past expiry stored");
    }

    function test_SetSubscriptionExpiry_OnlyManager() public {
        _upgradeToV3();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MANAGER_ROLE)
        );
        v3.setSubscriptionExpiry(alice, uint64(block.timestamp + 1 days));
    }

    // ---- V2 behaviour preserved post-upgrade ----

    function test_V2Behavior_SubscribeStacksAndRewardsAfterV3() public {
        _upgradeToV3();

        // First subscribe on V3: stacks on top of nothing, mints the monthly reward.
        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v3.subscribe(PLAN_MONTHLY, address(usdm));
        uint64 firstExpiry = v3.subscriptionExpiry(bob);
        assertTrue(v3.isActive(bob), "bob active after subscribe");
        // alice paid USDM_MONTHLY in setUp; bob now adds another → treasury holds 2x.
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY * 2, "treasury paid for both alice + bob");
        assertEq(ceny.balanceOf(bob), MONTHLY_REWARD, "best-effort CENY reward minted");

        // Renew → expiry stacks from the current expiry, reward mints again.
        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v3.subscribe(PLAN_MONTHLY, address(usdm));
        assertEq(v3.subscriptionExpiry(bob), firstExpiry + 30 days, "renewal stacks expiry");
        assertEq(ceny.balanceOf(bob), MONTHLY_REWARD * 2, "renewal mints reward again");
    }
}
