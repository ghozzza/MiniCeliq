// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ceny} from "../../src/Ceny.sol";

/// @title CenyV2 — TEST-ONLY upgrade fixture (not a product version).
/// @notice Proves the Ceny UUPS upgrade path: storage-layout safety + balance preservation +
///         role-gated `_authorizeUpgrade`. Not deployed; lives under `test/`.
/// @custom:oz-upgrades-from Ceny
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract CenyV2 is Ceny {
    function initializeV2() external reinitializer(2) onlyRole(UPGRADER_ROLE) {}

    function version() external pure returns (string memory) {
        return "v2";
    }
}
