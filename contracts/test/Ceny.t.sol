// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC20CappedUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";

import {Ceny} from "../src/Ceny.sol";
import {CenyV2} from "./mocks/CenyV2.sol";

/// @title Ceny token test suite
/// @notice Covers signature-based claiming (happy path, cumulative, replay, bad sig, disabled),
///         direct minting (role-gated), the supply cap, and the UUPS upgrade path.
contract CenyTest is Test {
    Ceny internal ceny;
    address internal proxy;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant SIGNER_PK = 0xA11CE; // backend claim signer (test)
    address internal signer;

    uint256 internal constant CAP = 1_000_000_000e18; // 1B CENY

    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 internal constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        proxy = Upgrades.deployUUPSProxy("Ceny.sol", abi.encodeCall(Ceny.initialize, (owner, CAP, signer)));
        ceny = Ceny(proxy);
    }

    // ---- helpers ----

    function _signClaim(uint256 pk, address account, uint256 cumulative) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Ceny")),
                keccak256(bytes("1")),
                block.chainid,
                proxy
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(keccak256("Claim(address account,uint256 cumulativeAmount)"), account, cumulative));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ---- init ----

    function test_Initialize_State() public view {
        assertEq(ceny.name(), "Ceny");
        assertEq(ceny.symbol(), "CENY");
        assertEq(ceny.decimals(), 18);
        assertEq(ceny.cap(), CAP);
        assertEq(ceny.claimSigner(), signer);
        assertTrue(ceny.hasRole(ceny.MINTER_ROLE(), owner));
    }

    // ---- claim ----

    function test_Claim_HappyPath() public {
        bytes memory sig = _signClaim(SIGNER_PK, alice, 100e18);
        vm.prank(alice);
        ceny.claim(100e18, sig);
        assertEq(ceny.balanceOf(alice), 100e18);
        assertEq(ceny.claimed(alice), 100e18);
    }

    function test_Claim_CumulativeMintsOnlyDelta() public {
        vm.prank(alice);
        ceny.claim(100e18, _signClaim(SIGNER_PK, alice, 100e18));

        // New cumulative total of 150 → mints only the +50 delta.
        vm.prank(alice);
        ceny.claim(150e18, _signClaim(SIGNER_PK, alice, 150e18));
        assertEq(ceny.balanceOf(alice), 150e18);
        assertEq(ceny.claimed(alice), 150e18);
    }

    function test_Claim_RevertNothingToClaim() public {
        vm.prank(alice);
        ceny.claim(100e18, _signClaim(SIGNER_PK, alice, 100e18));

        // Re-submitting the same cumulative → nothing left.
        vm.prank(alice);
        vm.expectRevert(Ceny.NothingToClaim.selector);
        ceny.claim(100e18, _signClaim(SIGNER_PK, alice, 100e18));
    }

    function test_Claim_RevertInvalidSignature() public {
        // Signed by a non-signer key.
        bytes memory badSig = _signClaim(0xBAD, alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(Ceny.InvalidSignature.selector);
        ceny.claim(100e18, badSig);
    }

    function test_Claim_RevertWrongAccount() public {
        // Signature is for alice; bob cannot use it (digest binds msg.sender).
        bytes memory sig = _signClaim(SIGNER_PK, alice, 100e18);
        vm.prank(bob);
        vm.expectRevert(Ceny.InvalidSignature.selector);
        ceny.claim(100e18, sig);
    }

    function test_Claim_RevertWhenDisabled() public {
        vm.prank(owner);
        ceny.setClaimSigner(address(0)); // disable claiming
        vm.prank(alice);
        vm.expectRevert(Ceny.ClaimingDisabled.selector);
        ceny.claim(100e18, _signClaim(SIGNER_PK, alice, 100e18));
    }

    // ---- mint / roles ----

    function test_Mint_OnlyMinter() public {
        vm.prank(owner);
        ceny.mint(bob, 1_000e18);
        assertEq(ceny.balanceOf(bob), 1_000e18);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, MINTER_ROLE));
        ceny.mint(alice, 1);
    }

    function test_SetClaimSigner_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0)
            )
        );
        ceny.setClaimSigner(alice);
    }

    // ---- cap ----

    function test_Cap_Enforced() public {
        vm.prank(owner);
        ceny.mint(bob, CAP); // exactly the cap
        assertEq(ceny.totalSupply(), CAP);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ERC20CappedUpgradeable.ERC20ExceededCap.selector, CAP + 1, CAP));
        ceny.mint(bob, 1); // one over the cap
    }

    // ---- upgrade ----

    function test_Upgrade_ToV2PreservesBalance() public {
        vm.prank(alice);
        ceny.claim(100e18, _signClaim(SIGNER_PK, alice, 100e18));
        assertEq(ceny.balanceOf(alice), 100e18);

        vm.startPrank(owner);
        Upgrades.upgradeProxy(proxy, "CenyV2.sol", abi.encodeCall(CenyV2.initializeV2, ()));
        vm.stopPrank();

        CenyV2 v2 = CenyV2(proxy);
        assertEq(v2.balanceOf(alice), 100e18, "balance survives upgrade");
        assertEq(v2.cap(), CAP, "cap survives upgrade");
        assertEq(v2.version(), "v2");
    }
}
