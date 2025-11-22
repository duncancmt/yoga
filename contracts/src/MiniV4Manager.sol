// SPDX-License-Identifier: BUSL
// need to figure
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MiniV4Manager
/// @notice Minimal base contract for interacting with Uniswap v4 PoolManager
abstract contract MiniV4Manager is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using SafeERC20 for IERC20;

    IPoolManager public immutable POOL_MANAGER;

    error OnlyPoolManager();

    modifier onlyPoolManager() {
        if (msg.sender != address(POOL_MANAGER)) revert OnlyPoolManager();
        _;
    }

    constructor(IPoolManager _poolManager) {
        POOL_MANAGER = _poolManager;
    }

    /// @notice Called by the pool manager on unlock
    /// @dev Override this function in derived contracts
    function unlockCallback(
        bytes calldata /* data */
    ) external virtual returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert OnlyPoolManager();
        return "";
    }

    /// @notice Helper to settle a currency with the pool manager
    /// @param currency The currency to settle
    /// @param payer The address paying the currency
    /// @param amount The amount to settle
    function _settle(
        Currency currency,
        address payer,
        uint256 amount
    ) internal {
        if (currency.isAddressZero()) {
            POOL_MANAGER.settle{value: amount}();
        } else {
            POOL_MANAGER.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransferFrom(
                payer,
                address(POOL_MANAGER),
                amount
            );
            POOL_MANAGER.settle();
        }
    }

    /// @notice Helper to take a currency from the pool manager
    /// @param currency The currency to take
    /// @param recipient The recipient of the currency
    /// @param amount The amount to take
    function _take(
        Currency currency,
        address recipient,
        uint256 amount
    ) internal {
        POOL_MANAGER.take(currency, recipient, amount);
    }

    receive() external payable {}
}
