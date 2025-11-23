// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {BaseTestHooks} from "@v4-core/src/test/BaseTestHooks.sol";
import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswapv4/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswapv4/types/BeforeSwapDelta.sol";
import {TickMath} from "@uniswapv4/libraries/TickMath.sol";
import {FixedPoint96} from "@uniswapv4/libraries/FixedPoint96.sol";
import {FullMath} from "@uniswapv4/libraries/FullMath.sol";
import {StateLibrary} from "@uniswapv4/libraries/StateLibrary.sol";
import {SwapParams} from "@uniswapv4/types/PoolOperation.sol";
import {Position} from "@uniswapv4/libraries/Position.sol";
import {Yoga, SimpleModifyLiquidityParams} from "../Yoga.sol";
import {IPyth, PythPrice} from "../interfaces/IPyth.sol";

contract YogaOracleLVRHook is BaseTestHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    Yoga public immutable yoga;
    IPyth public immutable pyth;

    // Config
    int24 public constant RANGE_WIDTH = 400; 
    int24 public constant REBALANCE_THRESHOLD = 50;
    uint64 public constant PYTH_AGE = 60; 

    struct ManagedPosition {
        uint256 tokenId;
        bytes32 priceId; 
        int24 currentCenterTick;
        bool active;
    }

    mapping(PoolId => ManagedPosition) public positions;

    error AlreadyManaging();
    error NotManaging();
    error OraclePriceStale();
    error InvalidOraclePrice();

    constructor(IPoolManager _poolManager, Yoga _yoga, IPyth _pyth) {
        poolManager = _poolManager;
        yoga = _yoga;
        pyth = _pyth;
    }

    function initializeManagedPosition(
        PoolKey calldata key,
        bytes32 _priceId,
        uint128 currency0Max,
        uint128 currency1Max,
        int256 initialLiquidity
    ) external payable {
        PoolId poolId = key.toId();
        if (positions[poolId].active) revert AlreadyManaging();

        int24 center = _fetchOracleTick(_priceId, key.tickSpacing);

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: center - (RANGE_WIDTH / 2),
            tickUpper: center + (RANGE_WIDTH / 2),
            liquidityDelta: initialLiquidity
        });

        (uint256 tokenId,) = yoga.mint{value: msg.value}(key, params, currency0Max, currency1Max);

        positions[poolId] =
            ManagedPosition({tokenId: tokenId, priceId: _priceId, currentCenterTick: center, active: true});
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        ManagedPosition storage pos = positions[poolId];
        if (!pos.active) return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        int24 oracleTick = _fetchOracleTick(pos.priceId, key.tickSpacing);


        int24 dist = oracleTick - pos.currentCenterTick;
        if (dist < 0) dist = -dist;

        if (dist > REBALANCE_THRESHOLD) {
            _rebalance(key, pos, oracleTick);
        }

        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _rebalance(PoolKey calldata key, ManagedPosition storage pos, int24 targetTick) internal {
        int24 newCenter = targetTick; 
        if (newCenter == pos.currentCenterTick) return;

        int24 oldLower = pos.currentCenterTick - (RANGE_WIDTH / 2);
        int24 oldUpper = pos.currentCenterTick + (RANGE_WIDTH / 2);

        bytes32 positionId = Position.calculatePositionKey(address(yoga), oldLower, oldUpper, bytes32(pos.tokenId));
        uint128 liq = poolManager.getPositionLiquidity(key.toId(), positionId);

        if (liq > 0) {
            yoga.modify(
                payable(address(this)),
                pos.tokenId,
                SimpleModifyLiquidityParams({
                    tickLower: oldLower,
                    tickUpper: oldUpper,
                    liquidityDelta: -int256(uint256(liq))
                }),
                type(uint128).max,
                type(uint128).max
            );

            int24 newLower = newCenter - (RANGE_WIDTH / 2);
            int24 newUpper = newCenter + (RANGE_WIDTH / 2);

            yoga.modify(
                payable(address(this)),
                pos.tokenId,
                SimpleModifyLiquidityParams({
                    tickLower: newLower,
                    tickUpper: newUpper,
                    liquidityDelta: int256(uint256(liq))
                }),
                type(uint128).max,
                type(uint128).max
            );

            pos.currentCenterTick = newCenter;
        }
    }

    // --- Math Helper ---
    function _fetchOracleTick(bytes32 priceId, int24 spacing) internal view returns (int24 tick) {
        PythPrice memory priceStruct = pyth.getPriceNoOlderThan(priceId, PYTH_AGE);
        if (priceStruct.price <= 0) revert InvalidOraclePrice();

        uint256 price = uint256(int256(priceStruct.price));
        int32 expo = priceStruct.expo;

        // Convert Pyth (price * 10^expo) to 18 decimals
        uint256 price18;
        if (expo < -18) {
            price18 = price / (10 ** uint256(int256(-18 - expo)));
        } else {
            price18 = price * (10 ** uint256(int256(18 + expo)));
        }

        // Calculate sqrtPriceX96: sqrt(price) * 2^96
        // FixedPoint96.Q96 = 2^96
        // We assume 1e18 base for the price (Token1/Token0)
        uint160 sqrtPriceX96 = uint160(FullMath.mulDiv(FixedPoint96.Q96, _sqrt(price18), 1e9)); // sqrt(1e18) = 1e9

        int24 rawTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);

        // Align to spacing
        int24 compressed = rawTick / spacing;
        if (rawTick < 0 && rawTick % spacing != 0) compressed--;
        tick = compressed * spacing;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    receive() external payable {}
}
