// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {NewsSubscription} from "../src/NewsSubscription.sol";
import {NewsSubscriptionV2} from "../src/NewsSubscriptionV2.sol";
import {Ceny} from "../src/Ceny.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @title NewsSubscriptionV2 test suite
/// @notice Covers the V2 auto-mint-CENY-on-subscribe upgrade: rewards mint to the subscriber on
///         subscribe + renewal, the best-effort invariant (a reward failure never blocks payment),
///         the role-gated `reinitializeV2`, and the MANAGER_ROLE-gated setters.
/// @dev The proxy is upgraded via the OZ Foundry Upgrades plugin, which validates UUPS storage-layout
///      safety (NewsSubscription → NewsSubscriptionV2) through the build-info/AST (ffi).
contract NewsSubscriptionV2Test is Test {
    NewsSubscription internal sub; // V1 view of the proxy
    NewsSubscriptionV2 internal v2; // V2 view of the proxy (after upgrade)
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

    // Mirror the V2 events for expectEmit.
    event CenyRewarded(address indexed user, uint8 indexed plan, uint256 amount);
    event CenyTokenUpdated(address token);
    event CenyRewardUpdated(uint8 indexed plan, uint256 amount);

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

        // ---- Deploy Ceny proxy (admin = owner) ----
        cenyProxy = Upgrades.deployUUPSProxy("Ceny.sol", abi.encodeCall(Ceny.initialize, (owner, CENY_CAP, owner)));
        ceny = Ceny(cenyProxy);

        // ---- Grant the subscription proxy Ceny's MINTER_ROLE ----
        vm.prank(owner);
        ceny.grantRole(MINTER_ROLE, proxy);
    }

    // ---- Helpers ----

    function _fundAndApprove(address user, uint256 amount) internal {
        usdm.mint(user, amount);
        vm.prank(user);
        usdm.approve(proxy, amount);
    }

    /// @dev Subscribe works on the V1 proxy before any upgrade (sanity that we start from a live V1).
    function _v1SubscribeSanity() internal {
        _fundAndApprove(alice, USDM_MONTHLY);
        vm.prank(alice);
        sub.subscribe(PLAN_MONTHLY, address(usdm));
        assertTrue(sub.isActive(alice), "V1 subscribe should work pre-upgrade");
    }

    /// @dev Upgrade the proxy to V2, wiring the Ceny token + reward amounts.
    function _upgradeToV2(address cenyToken_) internal {
        vm.startPrank(owner);
        Upgrades.upgradeProxy(
            proxy,
            "NewsSubscriptionV2.sol:NewsSubscriptionV2",
            abi.encodeCall(NewsSubscriptionV2.reinitializeV2, (cenyToken_, MONTHLY_REWARD, YEARLY_REWARD))
        );
        vm.stopPrank();
        v2 = NewsSubscriptionV2(proxy);
    }

    // ---- V1 sanity + upgrade wiring ----

    function test_Upgrade_WiresCenyAndRewards() public {
        _v1SubscribeSanity();
        _upgradeToV2(cenyProxy);

        assertEq(v2.cenyToken(), cenyProxy, "cenyToken wired");
        assertEq(v2.cenyReward(PLAN_MONTHLY), MONTHLY_REWARD, "monthly reward wired");
        assertEq(v2.cenyReward(PLAN_YEARLY), YEARLY_REWARD, "yearly reward wired");

        // State preserved from V1.
        assertTrue(v2.isActive(alice), "alice sub survives upgrade");
        assertEq(v2.treasury(), treasury, "treasury survives upgrade");
    }

    // ---- Reward minting on subscribe ----

    function test_Subscribe_MintsCenyReward() public {
        _upgradeToV2(cenyProxy);

        _fundAndApprove(bob, USDM_MONTHLY);
        vm.expectEmit(true, true, false, true, proxy);
        emit CenyRewarded(bob, PLAN_MONTHLY, MONTHLY_REWARD);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm));

        assertEq(ceny.balanceOf(bob), MONTHLY_REWARD, "bob receives the monthly CENY reward");
        assertTrue(v2.isActive(bob), "bob is subscribed");
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY, "treasury still gets paid");
    }

    function test_Subscribe_YearlyMintsYearlyReward() public {
        _upgradeToV2(cenyProxy);

        _fundAndApprove(bob, USDM_YEARLY);
        vm.prank(bob);
        v2.subscribe(PLAN_YEARLY, address(usdm));

        assertEq(ceny.balanceOf(bob), YEARLY_REWARD, "bob receives the yearly CENY reward");
    }

    function test_Renewal_MintsRewardAgain() public {
        _upgradeToV2(cenyProxy);

        // First subscribe.
        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm));
        assertEq(ceny.balanceOf(bob), MONTHLY_REWARD, "first reward");

        // Renew → reward mints again (stacks).
        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm));
        assertEq(ceny.balanceOf(bob), MONTHLY_REWARD * 2, "renewal mints reward again");
    }

    // ---- Best-effort invariant: reward failure never blocks a paid subscription ----

    function test_Subscribe_SucceedsWhenMinterRoleRevoked() public {
        _upgradeToV2(cenyProxy);

        // Revoke the proxy's MINTER_ROLE — Ceny.mint will now revert.
        vm.prank(owner);
        ceny.revokeRole(MINTER_ROLE, proxy);

        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm)); // must NOT revert

        assertTrue(v2.isActive(bob), "subscription succeeds despite reward failure");
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY, "treasury paid");
        assertEq(ceny.balanceOf(bob), 0, "no reward minted (role revoked) but no revert");
    }

    function test_Subscribe_SucceedsWhenCenyTokenUnset() public {
        // Upgrade with cenyToken deferred (address(0)).
        _upgradeToV2(address(0));
        assertEq(v2.cenyToken(), address(0), "ceny token deferred");

        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm)); // must NOT revert

        assertTrue(v2.isActive(bob), "subscription succeeds with reward off");
        assertEq(usdm.balanceOf(treasury), USDM_MONTHLY, "treasury paid");
    }

    function test_Subscribe_NoRewardWhenPlanRewardZero() public {
        _upgradeToV2(cenyProxy);

        // Zero out the monthly reward.
        vm.prank(owner);
        v2.setCenyReward(PLAN_MONTHLY, 0);

        _fundAndApprove(bob, USDM_MONTHLY);
        vm.prank(bob);
        v2.subscribe(PLAN_MONTHLY, address(usdm));

        assertEq(ceny.balanceOf(bob), 0, "no reward when plan reward is zero");
        assertTrue(v2.isActive(bob), "subscription still works");
    }

    // ---- reinitializeV2 guards ----

    function test_ReinitializeV2_RevertsOnSecondCall() public {
        _upgradeToV2(cenyProxy);

        vm.prank(owner);
        vm.expectRevert(); // InvalidInitialization from the reinitializer
        v2.reinitializeV2(cenyProxy, MONTHLY_REWARD, YEARLY_REWARD);
    }

    function test_ReinitializeV2_OnlyUpgrader() public {
        // Two-step: set the V2 implementation without running reinitializeV2.
        NewsSubscriptionV2 v2Impl = new NewsSubscriptionV2();
        vm.prank(owner);
        NewsSubscription(proxy).upgradeToAndCall(address(v2Impl), "");
        NewsSubscriptionV2 v2p = NewsSubscriptionV2(proxy);

        // A non-upgrader cannot consume the reinitializer slot.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, UPGRADER_ROLE)
        );
        v2p.reinitializeV2(cenyProxy, MONTHLY_REWARD, YEARLY_REWARD);

        // An upgrader completes it.
        vm.prank(owner);
        v2p.reinitializeV2(cenyProxy, MONTHLY_REWARD, YEARLY_REWARD);
        assertEq(v2p.cenyToken(), cenyProxy, "upgrader completes V2 init");
    }

    // ---- Setters gated by MANAGER_ROLE ----

    function test_SetCenyToken_OnlyManager() public {
        _upgradeToV2(cenyProxy);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MANAGER_ROLE)
        );
        v2.setCenyToken(address(0xBEEF));

        // Manager can update.
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, proxy);
        emit CenyTokenUpdated(address(0xBEEF));
        v2.setCenyToken(address(0xBEEF));
        assertEq(v2.cenyToken(), address(0xBEEF), "manager updates ceny token");
    }

    function test_SetCenyReward_OnlyManager() public {
        _upgradeToV2(cenyProxy);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MANAGER_ROLE)
        );
        v2.setCenyReward(PLAN_MONTHLY, 1e18);

        // Manager can update.
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, proxy);
        emit CenyRewardUpdated(PLAN_MONTHLY, 7e18);
        v2.setCenyReward(PLAN_MONTHLY, 7e18);
        assertEq(v2.cenyReward(PLAN_MONTHLY), 7e18, "manager updates reward");
    }
}
