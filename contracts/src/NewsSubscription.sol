// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MiniCeliq subscription registry (non-custodial, UUPS-upgradeable).
/// @notice Records on-chain news subscriptions for the MiniCeliq MiniPay mini app.
///         Payment is pulled straight from the caller to the treasury in the same
///         transaction, so the contract never custodies user funds.
/// @dev Design principles:
///      - No custody: `subscribe()` uses `safeTransferFrom(user -> treasury)`. Contract balance stays ~0.
///      - No `require`: every guard is `if (cond) revert CustomError(...)`.
///      - UUPS upgradeable: logic can evolve without migrating subscriber state.
///      - Multi-token / multi-plan: owner-curated allowlist + per-token, per-plan prices.
///      - Renewal stacks: renewing before expiry extends from the current expiry, not from now.
contract NewsSubscription is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ---- Custom errors (no `require`) ----
    error ZeroAddress();
    error TokenNotAllowed(address token);
    error InvalidPlan(uint8 plan);
    error PriceNotSet(address token, uint8 plan);
    error InvalidTreasury(); // treasury must not be the contract itself (would lock funds)

    // ---- Storage (append-only on upgrade; do NOT reorder/remove) ----
    address public treasury; // receives all payments
    mapping(uint8 => uint64) public planDuration; // plan => seconds
    mapping(address => bool) public allowedToken; // stablecoin allowlist
    mapping(address => mapping(uint8 => uint256)) public price; // token => plan => amount (token-native decimals)
    mapping(address => uint64) public subscriptionExpiry; // user => unix expiry
    uint64 public promoEndsAt; // promo active while block.timestamp < this (0 = no promo)
    mapping(address => mapping(uint8 => uint256)) public promoPrice; // token => plan => promo amount (0 = use regular)
    uint256[43] private __gap; // reserve room for future vars

    // ---- Events (the analytics / indexing surface) ----
    event Subscribed(
        address indexed user, uint8 indexed plan, address indexed token, uint256 amount, uint64 newExpiry
    );
    event TreasuryUpdated(address treasury);
    event TokenAllowed(address indexed token, bool allowed);
    event PriceUpdated(address indexed token, uint8 indexed plan, uint256 amount);
    event PromoPriceUpdated(address indexed token, uint8 indexed plan, uint256 amount);
    event PromoEndsAtUpdated(uint64 endsAt);
    event PlanDurationUpdated(uint8 indexed plan, uint64 duration);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // implementation contract can never be initialized directly
    }

    /// @notice Initialize the proxy. Sets owner, treasury, and the default monthly/yearly durations.
    /// @param initialOwner Address that controls admin functions and upgrades.
    /// @param treasury_ Address that receives all subscription payments.
    function initialize(address initialOwner, address treasury_) external initializer {
        if (initialOwner == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert InvalidTreasury();
        __Ownable_init(initialOwner);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        treasury = treasury_;
        planDuration[0] = 30 days; // plan 0 = monthly
        planDuration[1] = 365 days; // plan 1 = yearly
    }

    /// @notice Subscribe / renew. Pulls `currentPrice(token, plan)` from the caller straight to the treasury.
    /// @dev Caller must `approve(address(this), price)` on `token` first (no permit — MiniPay can't sign typed data).
    /// @param plan 0 = monthly, 1 = yearly (or any plan with a non-zero `planDuration`).
    /// @param token Allowlisted stablecoin used for payment (USDm / USDC / USDT).
    function subscribe(uint8 plan, address token) external nonReentrant whenNotPaused {
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        uint64 duration = planDuration[plan];
        if (duration == 0) revert InvalidPlan(plan);
        uint256 amount = currentPrice(token, plan); // promo-aware, time-boxed
        if (amount == 0) revert PriceNotSet(token, plan);

        // Effects before interaction (CEI): write the new expiry first. A revert in the
        // transfer below rolls this back, so subscriptions are never granted unpaid.
        uint64 nowTs = uint64(block.timestamp);
        uint64 current = subscriptionExpiry[msg.sender];
        uint64 base = current > nowTs ? current : nowTs; // stack on top of an active sub
        uint64 newExpiry = base + duration;
        subscriptionExpiry[msg.sender] = newExpiry;

        // Interaction last. Non-custodial: funds never rest in this contract.
        IERC20(token).safeTransferFrom(msg.sender, treasury, amount);

        emit Subscribed(msg.sender, plan, token, amount, newExpiry);
    }

    /// @notice The read every gate uses (FE + BE).
    /// @param user Address to check.
    /// @return True if the user has an unexpired subscription.
    function isActive(address user) external view returns (bool) {
        return subscriptionExpiry[user] > block.timestamp;
    }

    /// @notice Effective price right now — returns the promo price while the promo window is open,
    ///         otherwise the regular price. The FE reads this to show the live amount.
    /// @param token Stablecoin address.
    /// @param plan Plan id.
    /// @return The amount (token-native decimals) the caller must approve and pay.
    function currentPrice(address token, uint8 plan) public view returns (uint256) {
        uint256 promo = promoPrice[token][plan];
        if (promo != 0 && block.timestamp < promoEndsAt) return promo;
        return price[token][plan];
    }

    // ---- Admin (onlyOwner) ----

    /// @notice Update the treasury that receives all payments.
    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        if (t == address(this)) revert InvalidTreasury();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    /// @notice Add or remove a stablecoin from the payment allowlist.
    function setAllowedToken(address token, bool allowed_) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed_;
        emit TokenAllowed(token, allowed_);
    }

    /// @notice Set the regular price for a token/plan (token-native decimals).
    function setPrice(address token, uint8 plan, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (planDuration[plan] == 0) revert InvalidPlan(plan);
        price[token][plan] = amount;
        emit PriceUpdated(token, plan, amount);
    }

    /// @notice Set the promo price for a token/plan; 0 disables the promo for that token/plan.
    function setPromoPrice(address token, uint8 plan, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (planDuration[plan] == 0) revert InvalidPlan(plan);
        promoPrice[token][plan] = amount; // 0 disables promo for this token/plan
        emit PromoPriceUpdated(token, plan, amount);
    }

    /// @notice Set the promo cutoff. Promo auto-expires once `block.timestamp >= endsAt`.
    function setPromoEndsAt(uint64 endsAt) external onlyOwner {
        promoEndsAt = endsAt; // promo auto-expires once block.timestamp >= endsAt
        emit PromoEndsAtUpdated(endsAt);
    }

    /// @notice Set (or change) the duration in seconds for a plan id.
    function setPlanDuration(uint8 plan, uint64 duration) external onlyOwner {
        planDuration[plan] = duration;
        emit PlanDurationUpdated(plan, duration);
    }

    /// @notice Pause `subscribe()` (emergency stop).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume `subscribe()`.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev UUPS upgrade authorization — only the owner may upgrade the implementation.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
