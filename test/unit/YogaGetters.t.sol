// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "../BaseTest.sol";
import {SimpleModifyLiquidityParams} from "../../src/Yoga.sol";
import {Currency} from "@uniswapv4/types/Currency.sol";
import {IHooks} from "@uniswapv4/interfaces/IHooks.sol";

contract YogaGettersTest is BaseTest {
    function test_GetKey() public {
        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 1000 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        (uint256 tokenId, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        (Currency currency0, Currency currency1, uint24 fee, int24 spacing, IHooks hooks) = yoga.getKey(tokenId);

        assertEq(Currency.unwrap(currency0), Currency.unwrap(testKey.currency0), "Currency0 should match");
        assertEq(Currency.unwrap(currency1), Currency.unwrap(testKey.currency1), "Currency1 should match");
        assertEq(fee, testKey.fee, "Fee should match");
        assertEq(spacing, testKey.tickSpacing, "Tick spacing should match");
        assertEq(address(hooks), address(testKey.hooks), "Hooks should match");

        vm.stopPrank();
    }

    function test_GetTicks() public {
        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 12,
            tickUpper: tickSpacing * 18,
            liquidityDelta: 1000 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        (uint256 tokenId, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        int24[] memory ticks = yoga.getTicks(tokenId);

        assertEq(ticks.length, 2, "Should have 2 ticks");
        assertEq(ticks[0], params.tickLower, "Lower tick should match");
        assertEq(ticks[1], params.tickUpper, "Upper tick should match");

        vm.stopPrank();
    }

    function test_GetTicks_DifferentRanges() public {
        int24 tickSpacing = testKey.tickSpacing;

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        SimpleModifyLiquidityParams memory params1 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 1000 ether
        });

        SimpleModifyLiquidityParams memory params2 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 24,
            tickUpper: tickSpacing * 30,
            liquidityDelta: 500 ether
        });

        (uint256 tokenId1, ) = yoga.mint(
            testKey, params1, type(uint128).max, type(uint128).max
        );
        (uint256 tokenId2, ) = yoga.mint(
            testKey, params2, type(uint128).max, type(uint128).max
        );

        int24[] memory ticks1 = yoga.getTicks(tokenId1);
        int24[] memory ticks2 = yoga.getTicks(tokenId2);

        assertEq(ticks1.length, 2, "Position 1 should have 2 ticks");
        assertEq(ticks1[0], params1.tickLower, "Position 1 lower tick");
        assertEq(ticks1[1], params1.tickUpper, "Position 1 upper tick");

        assertEq(ticks2.length, 2, "Position 2 should have 2 ticks");
        assertEq(ticks2[0], params2.tickLower, "Position 2 lower tick");
        assertEq(ticks2[1], params2.tickUpper, "Position 2 upper tick");

        vm.stopPrank();
    }
}
