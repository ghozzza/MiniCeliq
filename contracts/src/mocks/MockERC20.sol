// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — mintable ERC20 with configurable decimals (test only).
/// @notice Used to simulate USDm (18 decimals) and USDC/USDT (6 decimals).
/// @dev NOT for production. Anyone can mint.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Freely mint tokens to any address (test helper).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
