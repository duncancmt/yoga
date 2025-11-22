// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@forge-std/interfaces/IERC20.sol";
import {IERC165} from "@forge-std/interfaces/IERC165.sol";

import {ERC721} from "@solady/tokens/ERC721.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {ReentrancyGuardTransient} from "@solady/utils/ReentrancyGuardTransient.sol";
import {RedBlackTreeLib} from "@solady/utils/RedBlackTreeLib.sol";

import {Currency} from "@uniswapv4/types/Currency.sol";
import {IHooks} from "@uniswapv4/interfaces/IHooks.sol";

import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswapv4/types/PoolOperation.sol";
import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswapv4/interfaces/IUnlockCallback.sol";
import {Position} from "@uniswapv4/libraries/Position.sol";
import {StateLibrary} from "@uniswapv4/libraries/StateLibrary.sol";

//import {MultiCallContext} from "lib/MultiCallContext.sol";
import {Panic} from "lib/Panic.sol";

struct SimpleModifyLiquidityParams {
    // the lower and upper tick of the position
    int24 tickLower;
    int24 tickUpper;
    // how to modify the liquidity
    int256 liquidityDelta;
}

library LibSimpleModifyLiquidityParams {
    function truncate(SimpleModifyLiquidityParams[] memory a, uint256 l) {
        if (l > a.length) {
            Panic.panic(Panic.ARRAY_OUT_OF_BOUNDS);
        }
        assembly ("memory-safe") {
            mstore(a, l)
        }
    }
}

using LibSimpleModifyLiquidityParams for SimpleModifyLiquidityParams;

library CurrencySafeTransferLib {
    using SafeTransferLib for address;

    function safeTransferFrom(Currency token, address from, address to, uint256 amount) internal {
        return Currency.unwrap(token).safeTransferFrom(from, to, amount);
    }
}

contract Yoga is IERC165, IUnlockCallback, ERC721, /*, MultiCallContext */ ReentrancyGuardTransient {
    using SafeTransferLib for address;
    using CurrencySafeTransferLib for Currency;
    using RedBlackTreeLib for RedBlackTreeLib.Tree;
    using RedBlackTreeLib for bytes32;

    error SplitTooComplicated();
    error NegativeLiquidity();

    modifier onlyOwnerOrApproved(uint256 tokenId) {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) {
            revert NotOwnerNorApproved();
        }
    }

    IPoolManager public constant POOL_MANAGER = IPoolManager(0x1F98400000000000000000000000000000000004);

    int24 private constant _MIN_TICK = -887272;

    uint256 public nextTokenid = 1;

    struct TokenInfo {
        RedBlackTreeLib.Tree subPositions;
        PoolKey key;
    }

    mapping(uint256 => TokenInfo) private _tokenInfo;

    function _tickToTreeKey(int24 tick) private pure returns (uint24) {
        unchecked {
            return uint24(tick - (_MIN_TICK - 1));
        }
    }

    function _treeKeyToTick(uint24 treeKey) private pure returns (int24) {
        unchecked {
            return int24(tick) + (_MIN_TICK - 1);
        }
    }

    function mint(PoolKey calldata key, SimpleModifyLiquidityParams calldata params)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, BalanceDelta delta)
    {
        unchecked {
            tokenId = nextTokenId++;
        }

        TokenInfo storage tokenInfo = _tokenInfo[tokenId];
        tokenInfo.key = key;
        RedBlackTreeLib.Tree storage subPositions = tokenInfo.subPositions;
        subPositions.insert(_tickToTreeKey(params.tickLower));
        subPositions.insert(_tickToTreeKey(params.tickUpper));

        SimpleModifyLiquidityParams[] memory paramsArray = new SimpleModifyLiquidityParams[](1);
        paramsArray[0] = params;
        delta = abi.decode(
            POOL_MANAGER.unlock(abi.encode(msg.sender, payable(msg.sender), key, bytes32(tokenId), paramsArray)),
            (BalanceDelta)
        );

        _safeMint(msg.sender, tokenId);
        if (address(this).balance != 0) {
            msg.sender.safeTransferAllETH();
        }
    }

    function _getLiquidity(uint256 tokenId, PoolKey memory key, int24 tickLower, int24 tickUpper)
        private
        view
        returns (uint256)
    {
        return StateLibrary.getPositionLiquidity(
            POOL_MANAGER,
            key.toId(),
            Position.calculatePositionKey(address(this), tickLower, tickUpper, bytes32(tokenid))
        );
    }

    function modify(address payable recipient, uint256 tokenId, SimpleModifyLiquidityParams calldata params)
        external
        payable
        nonReentrant
        onlyOwnerOrApproved(tokenId)
        returns (BalanceDelta delta)
    {
        SimpleModifyLiquidityParams[] memory actions = new SimpleModifyLiquidityParams[](4);

        TokenInfo storage tokenInfo = _tokenInfo[tokenId];
        RedBlackTreeLib.Tree storage subPositions = tokenInfo.subPositions;
        PoolKey memory key = tokenInfo.key;

        bytes32 leftTickPtr = subPositions.nearestBefore(_tickToTreeKey(params.tickLower));
        int24 leftTick;
        bytes32 rightTick;
        int24 rightTick;
        if (leftTickPtr == 0) {
            rightTickPtr = subPositions.first();
            rightTick = _treeKeyToTick(rightTickPtr.value());
            if (rightTick != params.tickUpper) {
                revert SplitTooComplicated();
            }
            if (params.liquidityDelta < 0) {
                revert NegativeLiquidity();
            }

            subPositions.insert(_tickToTreeKey(params.tickLower));
            SimpleModifyLiquidityParams memory i = actions[0];
            i.tickLower = params.tickLower;
            i.tickUpper = params.tickUpper;
            i.liquidityDelta = params.liquidityDelta;
            actions.truncate(1);
        } else if ((leftTick = _treeKeyToTick(leftTickPtr.value())) == params.tickLower) {
            // TODO: handle the condition where both `params.tickLower` and `params.tickUpper` are already in the tree

            subPositions.insert(_tickToTreeKey(rightTick = params.tickUpper));

            if ((rightTickPtr = leftTick.next()) == 0) {
                if (params.liquidityDelta < 0) {
                    revert NegativeLiquidity();
                }

                actions[0] = params;
                actions.truncate(1);
            } else {
                rightTick = _treeKeyToTick(rightTickPtr.value());
                uint256 beforeLiquidity = _getLiquidity(tokenId, key, params.tickLower, rightTick);
                {
                    SimpleModifyLiquidityParams memory i = actions[0];
                    i.tickLower = params.tickLower;
                    i.tickUpper = rightTick;
                    i.liquidityDelta = -int256(beforeLiquidity);
                }
                {
                    SimpleModifyLiquidityParams memory i = actions[1];
                    i.tickLower = params.tickUpper;
                    i.tickUpper = rightTick;
                    i.liquidityDelta = int256(beforeLiquidity);
                }

                {
                    SimpleModifyLiquidityParams memory i = actions[2];
                    i.tickLower = params.tickLower;
                    i.tickUpper = params.tickUpper;
                    i.liquidityDelta = int256(beforeLiquidity) + params.liquidityDelta;
                    if (i.liquidityDelta < 0) {
                        revert NegativeLiquidity();
                    }

                    bytes32 beforeTickPtr = leftTickPtr.prev();
                    if (beforeTickPtr == 0) {
                        if (i.liquidityDelta == 0) {
                            // this is a liquidity removal at the start of the
                            // range; we no longer need to keep `leftTick` in
                            // the enumeration
                            subPositions.remove(_tickToTreeKey(params.tickLower));
                            actions.truncate(2);
                        }
                    } else {
                        int24 beforeTick;
                        int256 combinedLiquidity;

                        if (
                            _getLiquidity(tokenId, key, beforeTick = _treeKeyToTick(beforeTickPtr.value()), params.tickLower)
                                    == combinedLiquidity = i.liquidityDelta
                        ) {
                            i.tickLower = beforeTick;

                            i = actions[3];
                            i.tickLower = beforeTick;
                            i.tickUpper = params.tickLower;
                            i.liquidityDelta = -combinedLiquidity;

                            subPositions.remove(_tickToTreeKey(i.tickLower));

                            (actions[3], actions[2]) = (actions[2], actions[3]);
                        } else {
                            actions.truncate(3);
                        }
                    }
                }
            }
        } else if (
            (
                rightTick =
                    _treeKeyToTick((rightTickPtr = subpositions.nearestAfter(_tickToTreeKey(params.tickUpper))).value())
            ) != param.tickUpper
        ) {
            revert SplitTooComplicated();
        } else {
            subPositions.insert(_tickToTreeKey(params.tickLower));

            uint256 beforeLiquidity = _getLiquidity(tokenId, key, leftTick, params.tickUpper);
            {
                SimpleModifyLiquidityParams memory i = actions[0];
                i.tickLower = leftTick;
                i.tickUpper = params.tickUpper;
                i.liquidityDelta = -int256(beforeLiquidity);
            }
            {
                SimpleModifyLiquidityParams memory i = actions[1];
                i.tickLower = leftTick;
                i.tickUpper = params.tickLower;
                i.liquidityDelta = int256(beforeLiquidity);
            }
            {
                SimpleModifyLiquidityParams memory i = actions[2];
                i.tickLower = params.tickLower;
                i.tickUpper = params.tickUpper;
                i.liquidityDelta = int256(beforeLiquidity) + params.liquidityDelta;
                if (i.liquidityDelta < 0) {
                    revert NegativeLiquidity();
                }

                bytes32 afterTickPtr = rightTickPtr.next();
                if (afterTickPtr == 0) {
                    if (i.liquidityDelta == 0) {
                        // this is a liquidity removal at the end of the
                        // range; we no longer need to keep `rightTick` in
                        // the enumeration
                        subPositions.remove(_tickToTreeKey(params.tickUpper));
                        actions.truncate(2);
                    }
                } else {
                    int24 afterTick;
                    int256 combinedLiquidity;
                    if (
                        _getLiquidity(tokenId, key, params..tickUpper, afterTick = _treeKeyToTick(afterTickPtr.value()))
                                == (combinedLiquidity = i.liquidityDelta)
                    ) {
                        i.tickUpper = afterTick;

                        i = actions[3];
                        i.tickLower = params.tickUpper;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = -combinedLiquidity;

                        subPositions.remove(_tickToTreeKey(i.tickUpper));

                        (actions[3], actions[2]) = (actions[2], actions[3]);
                    } else {
                        actions.truncate(3);
                    }
                }
            }
        }

        delta = abi.decode(
            POOL_MANAGER.unlock(abi.encode(msg.sender, recipient, key, bytes32(tokenId), actions)), (BalanceDelta)
        );

        if (address(this).balance != 0) {
            msg.sender.safeTransferAllETH();
        }
    }

    function _settle(address owner, address payable recipient, Currency currency, int128 amount) private {
        if (amount < 0) {
            uint256 debt;
            unchecked {
                debt = -int256(amount);
            }
            POOL_MANAGER.sync(currency);
            if (currency.isAddressZero()) {
                POOL_MANAGER.settle{value: debt}();
            } else {
                currency.safeTransferFrom(owner, address(POOL_MANAGER), debt);
                POOL_MANAGER.settle();
            }
        } else {
            uint256 credit = uint256(int256(amount));
            POOL_MANAGER.take(currency, recipient, credit);
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(POOL_MANAGER));
        (
            address owner,
            address payable recipient,
            PoolKey memory key,
            bytes32 salt,
            SimpleModifyLiquidityParams[] memory params
        ) = abi.decode(data, (address, address payable, PoolKey, bytes32, SimpleModifyLiquidityParams[]));

        BalanceDelta delta;
        ModifyLiquidityParams memory managerParams;
        managerParams.salt = salt;
        for (uint256 i; i < params.length; i++) {
            SimpleModifyLiquidityParams memory simpleParams = params[i];
            managerParams.tickLower = simpleParams.tickLower;
            managerParams.tickUpper = simpleParams.tickUpper;
            managerParams.liquidityDelta = simpleParams.liquidityDelta;
            (BalanceDelta callerDelta,) = POOL_MANAGER.modifyLiquidity(key, managerParams, ""); // TODO: hookData
            delta += callerDelta;
        }

        _settle(owner, recipient, key.currency0, delta.amount0());
        _settle(owner, recipient, key.currency1, delta.amount1());

        return abi.encode(delta);
    }

    function getKey(uint256 tokenId)
        external
        view
        returns (Currency currency0, Currency currency1, uint24 fee, int24 tickSpacing, IHooks hooks)
    {
        PoolKey storage key = _tokenInfo[tokenId].key;
        (currency0, currency1, fee, tickSpacing, hooks) =
            (key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks);
    }

    function getTicks(uint256 tokenId) external view returns (int24[] memory) {
        SubPositions storage subPositions = _subPositions[tokenId];

        // allocate an extra word to store the indirection offset for the return
        assembly ("memory-safe") {
            mstore(0x40, add(0x20, mload(0x40)))
        }

        // walk the tree
        uint256[] memory result = subPositions.values();

        // return
        assembly ("memory-safe") {
            let len := shl(0x05, mload(result))

            // format each tree key as a tick
            for {
                let i := add(0x20, result)
                let end := add(len, i)
            } xor(i, end) { i := add(0x20, i) } {
                // tick conversion
                mstore(i, sub(mload(i), 887273))
            }

            // return
            result := sub(result, 0x20)
            mstore(result, 0x20)
            return(result, add(0x40, len))
        }
    }
}
