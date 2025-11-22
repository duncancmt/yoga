// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "../BaseTest.sol";
import {SimpleModifyLiquidityParams} from "../../src/Yoga.sol";
import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";

contract YogaMintTest is BaseTest {
    function test_Mint_CreatesPosition() public {
        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 1000 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        uint256 balanceBefore0 = token0.balanceOf(alice);
        uint256 balanceBefore1 = token1.balanceOf(alice);

        (uint256 tokenId, BalanceDelta delta) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        assertEq(tokenId, 1, "First minted token should be ID 1");
        assertEq(yoga.ownerOf(tokenId), alice, "Alice should own the minted NFT");
        assertEq(yoga.nextTokenId(), 2, "Next token ID should be 2");

        assertTrue(
            token0.balanceOf(alice) < balanceBefore0 || token1.balanceOf(alice) < balanceBefore1,
            "Tokens should be transferred"
        );

        vm.stopPrank();
    }

    function test_Mint_IncrementsTokenId() public {
        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 12,
            tickUpper: tickSpacing * 12,
            liquidityDelta: 500 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        (uint256 tokenId1, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );
        (uint256 tokenId2, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        assertEq(tokenId1, 1, "First token ID");
        assertEq(tokenId2, 2, "Second token ID");
        assertEq(yoga.nextTokenId(), 3, "Next token ID should be 3");

        vm.stopPrank();
    }

    function test_Mint_MultipleDifferentPositions() public {
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
            tickLower: -tickSpacing * 12,
            tickUpper: tickSpacing * 12,
            liquidityDelta: 500 ether
        });

        (uint256 tokenId1, ) = yoga.mint(
            testKey, params1, type(uint128).max, type(uint128).max
        );
        (uint256 tokenId2, ) = yoga.mint(
            testKey, params2, type(uint128).max, type(uint128).max
        );

        assertEq(tokenId1, 1, "First position token ID");
        assertEq(tokenId2, 2, "Second position token ID");

        int24[] memory ticks1 = yoga.getTicks(tokenId1);
        int24[] memory ticks2 = yoga.getTicks(tokenId2);

        assertEq(ticks1[0], params1.tickLower, "First position lower tick");
        assertEq(ticks1[1], params1.tickUpper, "First position upper tick");
        assertEq(ticks2[0], params2.tickLower, "Second position lower tick");
        assertEq(ticks2[1], params2.tickUpper, "Second position upper tick");

        vm.stopPrank();
    }

    function testFuzz_MintWithDifferentLiquidityAmounts(uint128 liquidityAmount) public {
        vm.assume(liquidityAmount > 1000 && liquidityAmount < 10000 ether);

        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: int256(uint256(liquidityAmount))
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        (uint256 tokenId, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        assertEq(tokenId, 1, "Token ID should be 1");
        assertEq(yoga.ownerOf(tokenId), alice, "Alice should own the token");

        vm.stopPrank();
    }
}
