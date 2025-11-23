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

import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswapv4/interfaces/callback/IUnlockCallback.sol";

import {Position} from "@uniswapv4/libraries/Position.sol";
import {StateLibrary} from "@uniswapv4/libraries/StateLibrary.sol";

import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswapv4/types/PoolOperation.sol";

//import {MultiCallContext} from "lib/MultiCallContext.sol";
import {Panic} from "./lib/Panic.sol";

struct SimpleModifyLiquidityParams {
    // the lower and upper tick of the position
    int24 tickLower;
    int24 tickUpper;
    // how to modify the liquidity
    int256 liquidityDelta;
}

library LibSimpleModifyLiquidityParams {
    function truncate(SimpleModifyLiquidityParams[] memory a, uint256 l)
        internal
        pure
        returns (SimpleModifyLiquidityParams[] memory)
    {
        if (l > a.length) {
            Panic.panic(Panic.ARRAY_OUT_OF_BOUNDS);
        }
        assembly ("memory-safe") {
            mstore(a, l)
        }
        return a;
    }
}

using LibSimpleModifyLiquidityParams for SimpleModifyLiquidityParams[];

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

    error TooMuchSlippage(Currency currency, uint256 limit, uint256 actual);
    error SplitTooComplicated();
    error NegativeLiquidity();
    error ZeroDelta();

    modifier onlyOwnerOrApproved(uint256 tokenId) {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) {
            revert NotOwnerNorApproved();
        }
        _;
    }

    modifier onlyPoolManager() {
        require(msg.sender == address(POOL_MANAGER));
        _;
    }

    IPoolManager public constant POOL_MANAGER = IPoolManager(0x1F98400000000000000000000000000000000004);

    function name() public pure override returns (string memory) {
        return "YogaPosition";
    }

    function symbol() public pure override returns (string memory) {
        return "YP";
    }

    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        return "/dev/null";
    }

    int24 private constant _MIN_TICK = -887272;

    uint256 public nextTokenId = 1;

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

    function _treeKeyToTick(uint256 treeKey) private pure returns (int24) {
        unchecked {
            return int24(uint24(treeKey)) + (_MIN_TICK - 1);
        }
    }

    function mint(
        PoolKey calldata key,
        SimpleModifyLiquidityParams calldata params,
        uint128 currency0Max,
        uint128 currency1Max
    ) external payable nonReentrant returns (uint256 tokenId, BalanceDelta delta) {
        if (params.liquidityDelta < 0) {
            revert NegativeLiquidity();
        }
        unchecked {
            tokenId = nextTokenId++;
        }

        TokenInfo storage tokenInfo = _tokenInfo[tokenId];
        tokenInfo.key = key;
        RedBlackTreeLib.Tree storage subPositions = tokenInfo.subPositions;
        subPositions.insert(_tickToTreeKey(params.tickLower));
        subPositions.insert(_tickToTreeKey(params.tickUpper));

        _safeMint(msg.sender, tokenId);

        SimpleModifyLiquidityParams[] memory paramsArray = new SimpleModifyLiquidityParams[](1);
        paramsArray[0] = params;
        delta = abi.decode(
            POOL_MANAGER.unlock(abi.encode(msg.sender, payable(msg.sender), key, bytes32(tokenId), paramsArray)),
            (BalanceDelta)
        );

        if (-int256(delta.amount0()) > int256(uint256(currency0Max))) {
            revert TooMuchSlippage(key.currency0, currency0Max, uint256(-int256(delta.amount0())));
        }
        if (-int256(delta.amount1()) > int256(uint256(currency1Max))) {
            revert TooMuchSlippage(key.currency1, currency1Max, uint256(-int256(delta.amount1())));
        }

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
            Position.calculatePositionKey(address(this), tickLower, tickUpper, bytes32(tokenId))
        );
    }

    function _populateActions(
        uint256 tokenId,
        SimpleModifyLiquidityParams calldata params,
        TokenInfo storage tokenInfo,
        PoolKey memory key
    ) private returns (SimpleModifyLiquidityParams[] memory actions) {
        actions = new SimpleModifyLiquidityParams[](4);
        RedBlackTreeLib.Tree storage subPositions = tokenInfo.subPositions;

        bytes32 leftTickPtr = subPositions.nearestBefore(_tickToTreeKey(params.tickLower));
        int24 leftTick;
        bytes32 rightTickPtr;
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
            // add new liquidity beyond the current left terminus of the tick ranges
            subPositions.insert(_tickToTreeKey(params.tickLower));

            bytes32 afterTickPtr = rightTickPtr.next();
            // `afterTickPtr` is guaranteed to be non-null. if it were null,
            // then there would be no sub-positions managed by this NFT, and the
            // NFT would've been burned
            int24 afterTick = _treeKeyToTick(afterTickPtr.value());
            if (_getLiquidity(tokenId, key, params.tickUpper, afterTick) == uint256(params.liquidityDelta)) {
                subPositions.remove(_tickToTreeKey(params.tickUpper));

                SimpleModifyLiquidityParams memory i = actions[0];
                i.tickLower = params.tickUpper;
                i.tickUpper = afterTick;
                i.liquidityDelta = -params.liquidityDelta;

                i = actions[1];
                i.tickLower = params.tickLower;
                i.tickUpper = afterTick;
                i.liquidityDelta = params.liquidityDelta;

                return actions.truncate(2);
            } else {
                SimpleModifyLiquidityParams memory i = actions[0];
                i.tickLower = params.tickLower;
                i.tickUpper = params.tickUpper;
                i.liquidityDelta = params.liquidityDelta;
                return actions.truncate(1);
            }
        } else if ((leftTick = _treeKeyToTick(leftTickPtr.value())) == params.tickLower) {
            if ((rightTickPtr = leftTickPtr.next()) == 0) {
                if (params.liquidityDelta < 0) {
                    revert NegativeLiquidity();
                }
                // add new liquidity beyond the current right terminus of the tick ranges
                subPositions.insert(_tickToTreeKey(rightTick = params.tickUpper));

                bytes32 beforeTickPtr = rightTickPtr.next();
                // `beforeTickPtr` is guaranteed to be non-null. if it were
                // null, then there would be no sub-positions managed by this
                // NFT, and the NFT would've been burned
                int24 beforeTick = _treeKeyToTick(beforeTickPtr.value());
                if (_getLiquidity(tokenId, key, beforeTick, params.tickLower) == uint256(params.liquidityDelta)) {
                    subPositions.remove(_tickToTreeKey(params.tickLower));

                    SimpleModifyLiquidityParams memory i = actions[0];
                    i.tickLower = beforeTick;
                    i.tickUpper = params.tickLower;
                    i.liquidityDelta = -params.liquidityDelta;

                    i = actions[1];
                    i.tickLower = beforeTick;
                    i.tickUpper = params.tickUpper;
                    i.liquidityDelta = params.liquidityDelta;

                    return actions.truncate(2);
                } else {
                    SimpleModifyLiquidityParams memory i = actions[0];
                    i.tickLower = params.tickLower;
                    i.tickUpper = params.tickUpper;
                    i.liquidityDelta = params.liquidityDelta;
                    return actions.truncate(1);
                }
            } else if ((rightTick = _treeKeyToTick(rightTickPtr.value())) == params.tickUpper) {
                // the liquidity modification happens exactly on an existing
                // range of ticks. we don't need to mutate the tree, unless
                // we're merging ranges

                uint256 beforeLiquidity = _getLiquidity(tokenId, key, leftTick, params.tickUpper);
                int256 netLiquidity = int256(beforeLiquidity) + params.liquidityDelta;
                if (netLiquidity < 0) {
                    revert NegativeLiquidity();
                }

                SimpleModifyLiquidityParams memory i = actions[0];
                i.tickLower = params.tickLower;
                i.tickUpper = params.tickUpper;
                i.liquidityDelta = params.liquidityDelta;

                bytes32 beforeTickPtr = leftTickPtr.prev();
                bytes32 afterTickPtr = rightTickPtr.next();
                if (beforeTickPtr == 0) {
                    if (int256(beforeLiquidity) + i.liquidityDelta == 0) {
                        subPositions.remove(_tickToTreeKey(params.tickLower));
                        if (afterTickPtr == 0) {
                            // `remove` here deletes the last element of the
                            // tree. the storage rooted here is now zeroed.
                            subPositions.remove(_tickToTreeKey(params.tickUpper));
                            // we get a gas refund by zeroing this storage, so why not
                            delete tokenInfo.key;
                            _burn(tokenId);
                        } else {
                            // Check if next range has zero liquidity and would become invalid terminus
                            if (
                                _getLiquidity(tokenId, key, params.tickUpper, _treeKeyToTick(afterTickPtr.value())) == 0
                            ) {
                                // Cascade: remove the zero-liquidity range that would be at terminus
                                subPositions.remove(_tickToTreeKey(params.tickUpper));
                            }
                        }
                        return actions.truncate(1);
                    }
                }
                if (afterTickPtr == 0) {
                    if (int256(beforeLiquidity) + i.liquidityDelta == 0) {
                        subPositions.remove(_tickToTreeKey(params.tickUpper));

                        // Check if previous range has zero liquidity and would become invalid terminus
                        if (beforeTickPtr != 0) {
                            if (
                                _getLiquidity(tokenId, key, _treeKeyToTick(beforeTickPtr.value()), params.tickLower)
                                    == 0
                            ) {
                                // Cascade: remove the zero-liquidity range that would be at terminus
                                subPositions.remove(_tickToTreeKey(params.tickLower));
                            }
                        }
                        return actions.truncate(1);
                    }
                }

                int24 beforeTick;
                if (
                    _getLiquidity(tokenId, key, beforeTick = _treeKeyToTick(beforeTickPtr.value()), params.tickLower)
                        == uint256(netLiquidity)
                ) {
                    subPositions.remove(_tickToTreeKey(params.tickLower));
                    i.liquidityDelta = -int256(beforeLiquidity);

                    i = actions[1];
                    i.tickLower = beforeTick;
                    i.tickUpper = params.tickLower;
                    i.liquidityDelta = -netLiquidity;

                    int24 afterTick;
                    if (
                        _getLiquidity(tokenId, key, params.tickUpper, afterTick = _treeKeyToTick(afterTickPtr.value()))
                            == uint256(netLiquidity)
                    ) {
                        subPositions.remove(_tickToTreeKey(params.tickUpper));

                        i = actions[2];
                        i.tickLower = params.tickUpper;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = -netLiquidity;

                        i = actions[3];
                        i.tickLower = beforeTick;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = netLiquidity;

                        return actions;
                    } else {
                        i = actions[2];
                        i.tickLower = beforeTick;
                        i.tickUpper = params.tickUpper;
                        i.liquidityDelta = netLiquidity;
                        return actions.truncate(3);
                    }
                }

                {
                    int24 afterTick;
                    if (
                        _getLiquidity(tokenId, key, params.tickUpper, afterTick = _treeKeyToTick(afterTickPtr.value()))
                            == uint256(netLiquidity)
                    ) {
                        subPositions.remove(_tickToTreeKey(params.tickUpper));
                        i.liquidityDelta = -int256(beforeLiquidity);

                        i = actions[1];
                        i.tickLower = params.tickUpper;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = -netLiquidity;

                        i = actions[2];
                        i.tickLower = params.tickLower;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = netLiquidity;
                        return actions.truncate(3);
                    }
                }

                return actions.truncate(1);
            } else {
                // split the existing position that ranges from
                // `params.tickLower` to `rightTick` into two new positions that
                // range from `params.tickLower` to `params.tickUpper` and from
                // `params.tickUpper` to `rightTick` and then mutate the
                // liquidity in the range `params.tickLower` to
                // `params.tickUpper`

                subPositions.insert(_tickToTreeKey(params.tickUpper));
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
                            // we completely remove all liquidity from the range
                            // at the left terminus of the tick ranges. we no
                            // longer need to keep `leftTick` in the enumeration
                            subPositions.remove(_tickToTreeKey(params.tickLower));
                            return actions.truncate(2);
                        }
                        return actions.truncate(3);
                    } else {
                        int24 beforeTick;
                        int256 combinedLiquidity;

                        if (
                            _getLiquidity(
                                tokenId, key, beforeTick = _treeKeyToTick(beforeTickPtr.value()), params.tickLower
                            ) == uint256(combinedLiquidity = i.liquidityDelta)
                        ) {
                            // the liquidity in the modified range
                            // [`params.tickLower` `params.tickUpper`] is
                            // identical to the liquidity in the range to its
                            // left. combine these two ranges in the tree and
                            // merge their positions.

                            i.tickLower = beforeTick;

                            i = actions[3];
                            i.tickLower = beforeTick;
                            i.tickUpper = params.tickLower;
                            i.liquidityDelta = -combinedLiquidity;

                            subPositions.remove(_tickToTreeKey(params.tickLower));

                            (actions[3], actions[2]) = (actions[2], actions[3]);
                            return actions;
                        } else {
                            return actions.truncate(3);
                        }
                    }
                }
            }
        } else if ((rightTick = _treeKeyToTick((rightTickPtr = leftTickPtr.next()).value())) != params.tickUpper) {
            revert SplitTooComplicated();
        } else {
            // split the existing position that ranges from `leftTick` to
            // `params.tickUpper` into two new positions that range from
            // `leftTick` to `params.tickLower` and from `params.tickLower` to
            // `params.tickUpper` and then mutate the liquidity in the range
            // `params.tickLower` to `params.tickUpper`

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
                        return actions.truncate(2);
                    }
                    return actions.truncate(3);
                } else {
                    int24 afterTick;
                    int256 combinedLiquidity;
                    if (
                        _getLiquidity(tokenId, key, params.tickUpper, afterTick = _treeKeyToTick(afterTickPtr.value()))
                            == uint256(combinedLiquidity = i.liquidityDelta)
                    ) {
                        // the liquidity in the modified range
                        // [`params.tickLower` `params.tickUpper`] is identical
                        // to the liquidity in the range to its right. combine
                        // these two ranges in the tree and merge their
                        // positions.

                        i.tickUpper = afterTick;

                        i = actions[3];
                        i.tickLower = params.tickUpper;
                        i.tickUpper = afterTick;
                        i.liquidityDelta = -combinedLiquidity;

                        subPositions.remove(_tickToTreeKey(params.tickUpper));

                        (actions[3], actions[2]) = (actions[2], actions[3]);
                        return actions;
                    } else {
                        return actions.truncate(3);
                    }
                }
            }
        }
    }

    function modify(
        address payable recipient,
        uint256 tokenId,
        SimpleModifyLiquidityParams calldata params,
        uint128 currency0Max,
        uint128 currency1Max
    ) external payable nonReentrant onlyOwnerOrApproved(tokenId) returns (BalanceDelta delta) {
        if (params.liquidityDelta == 0) {
            revert ZeroDelta();
        }

        TokenInfo storage tokenInfo = _tokenInfo[tokenId];
        PoolKey memory key = tokenInfo.key;

        SimpleModifyLiquidityParams[] memory actions = _populateActions(tokenId, params, tokenInfo, key);

        delta = abi.decode(
            POOL_MANAGER.unlock(abi.encode(msg.sender, recipient, key, bytes32(tokenId), actions)), (BalanceDelta)
        );

        if (-int256(delta.amount0()) > int256(uint256(currency0Max))) {
            revert TooMuchSlippage(key.currency0, currency0Max, uint256(-int256(delta.amount0())));
        }
        if (-int256(delta.amount1()) > int256(uint256(currency1Max))) {
            revert TooMuchSlippage(key.currency1, currency1Max, uint256(-int256(delta.amount1())));
        }

        if (address(this).balance != 0) {
            msg.sender.safeTransferAllETH();
        }
    }

    function _settle(address owner, address payable recipient, Currency currency, int128 amount) private {
        if (amount < 0) {
            uint256 debt;
            unchecked {
                debt = uint256(-int256(amount));
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

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (
            address owner,
            address payable recipient,
            PoolKey memory key,
            bytes32 salt,
            SimpleModifyLiquidityParams[] memory params
        ) = abi.decode(data, (address, address, PoolKey, bytes32, SimpleModifyLiquidityParams[]));

        BalanceDelta delta;
        ModifyLiquidityParams memory managerParams;
        managerParams.salt = salt;
        for (uint256 i; i < params.length; i++) {
            SimpleModifyLiquidityParams memory simpleParams = params[i];
            managerParams.tickLower = simpleParams.tickLower;
            managerParams.tickUpper = simpleParams.tickUpper;
            managerParams.liquidityDelta = simpleParams.liquidityDelta;
            (BalanceDelta callerDelta,) = POOL_MANAGER.modifyLiquidity(key, managerParams, ""); // TODO: hookData
            delta = delta + callerDelta;
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
        RedBlackTreeLib.Tree storage subPositions = _tokenInfo[tokenId].subPositions;

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

    // Solidity inheritance sucks
    function supportsInterface(bytes4 interfaceId) public view override(IERC165, ERC721) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
