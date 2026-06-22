// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20CappedUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Ceny — Celiq's reward token (ERC-20, capped, UUPS-upgradeable).
/// @notice The on-chain version of Celiq's "Ceny" reward points. Users claim the Ceny they have
///         earned by calling `claim()` directly on this proxy with a backend-signed authorization —
///         the user signs nothing (MiniPay-compatible); only the off-chain CLAIM signer does.
/// @dev Design:
///      - Role-based access control (not Ownable): DEFAULT_ADMIN_ROLE manages roles + config,
///        MINTER_ROLE mints directly, UPGRADER_ROLE authorizes upgrades.
///      - Capped supply: total supply can never exceed `cap()` (enforced on every mint).
///      - Signature claim: backend signs an EIP-712 `Claim(account, cumulativeAmount)`; the contract
///        mints `cumulativeAmount - claimed[account]`. Cumulative totals make claims idempotent and
///        replay-safe, and let the backend keep authorizing as a user earns more.
///      - No `require`: every guard is `if (cond) revert CustomError(...)`.
contract Ceny is
    Initializable,
    ERC20CappedUpgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    using ECDSA for bytes32;

    // ---- Roles ----
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // EIP-712 typehash for a claim authorization.
    bytes32 private constant CLAIM_TYPEHASH = keccak256("Claim(address account,uint256 cumulativeAmount)");

    // ---- Custom errors (no `require`) ----
    error ZeroAddress();
    error InvalidCap();
    error ClaimingDisabled();
    error NothingToClaim();
    error InvalidSignature();

    // ---- Storage (append-only on upgrade) ----
    address public claimSigner; // backend address whose signatures authorize claims (0 = claiming off)
    mapping(address => uint256) public claimed; // account => cumulative Ceny already claimed
    uint256[48] private __gap;

    // ---- Events ----
    event Claimed(address indexed account, uint256 amount, uint256 cumulative);
    event ClaimSignerUpdated(address indexed signer);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the token.
    /// @param admin Receives DEFAULT_ADMIN_ROLE + MINTER_ROLE + UPGRADER_ROLE (ideally a multisig).
    /// @param cap_ Maximum total supply (18 decimals). Immutable after deploy (changeable only via upgrade).
    /// @param claimSigner_ Backend signer for claim authorizations (0 to start with claiming disabled).
    function initialize(address admin, uint256 cap_, address claimSigner_) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        if (cap_ == 0) revert InvalidCap();

        __ERC20_init("Ceny", "CENY");
        __ERC20Capped_init(cap_);
        __AccessControl_init();
        __EIP712_init("Ceny", "1");
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        claimSigner = claimSigner_;
        emit ClaimSignerUpdated(claimSigner_);
    }

    /// @notice Claim earned Ceny. Mints `cumulativeAmount - claimed[msg.sender]` to the caller.
    /// @param cumulativeAmount Total Ceny the caller has earned to date (the backend-signed figure).
    /// @param signature EIP-712 signature over `Claim(msg.sender, cumulativeAmount)` by `claimSigner`.
    function claim(uint256 cumulativeAmount, bytes calldata signature) external {
        address signer = claimSigner;
        if (signer == address(0)) revert ClaimingDisabled();

        uint256 already = claimed[msg.sender];
        if (cumulativeAmount <= already) revert NothingToClaim();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, cumulativeAmount)));
        if (digest.recover(signature) != signer) revert InvalidSignature();

        uint256 amount = cumulativeAmount - already;
        claimed[msg.sender] = cumulativeAmount;
        _mint(msg.sender, amount); // cap enforced in ERC20Capped._update
        emit Claimed(msg.sender, amount, cumulativeAmount);
    }

    /// @notice Direct mint (backend/admin distribution). Cap-enforced.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Update the backend claim signer (0 disables claiming).
    function setClaimSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        claimSigner = signer;
        emit ClaimSignerUpdated(signer);
    }

    /// @dev UUPS upgrade authorization — only UPGRADER_ROLE may upgrade the implementation.
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
