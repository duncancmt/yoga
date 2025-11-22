// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "../BaseTest.sol";
import {SimpleModifyLiquidityParams} from "../../src/Yoga.sol";

contract YogaERC721Test is BaseTest {
    function test_ERC721Transfer() public {
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

        assertEq(yoga.ownerOf(tokenId), alice, "Alice should own the token");

        yoga.transferFrom(alice, bob, tokenId);

        assertEq(yoga.ownerOf(tokenId), bob, "Bob should now own the token");

        vm.stopPrank();
    }

    function test_ERC721Approve() public {
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

        yoga.approve(bob, tokenId);

        assertEq(yoga.getApproved(tokenId), bob, "Bob should be approved");

        vm.stopPrank();
    }

    function test_ERC721ApprovedCanTransfer() public {
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

        yoga.approve(bob, tokenId);
        vm.stopPrank();

        vm.prank(bob);
        yoga.transferFrom(alice, charlie, tokenId);

        assertEq(yoga.ownerOf(tokenId), charlie, "Charlie should own the token");
    }

    function test_ERC721SetApprovalForAll() public {
        vm.startPrank(alice);

        yoga.setApprovalForAll(bob, true);
        assertTrue(yoga.isApprovedForAll(alice, bob), "Bob should be approved for all");

        yoga.setApprovalForAll(bob, false);
        assertFalse(yoga.isApprovedForAll(alice, bob), "Bob should no longer be approved for all");

        vm.stopPrank();
    }

    function test_ERC721BalanceOf() public {
        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 1000 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        assertEq(yoga.balanceOf(alice), 0, "Alice should have 0 tokens initially");

        yoga.mint(testKey, params, type(uint128).max, type(uint128).max);
        assertEq(yoga.balanceOf(alice), 1, "Alice should have 1 token");

        yoga.mint(testKey, params, type(uint128).max, type(uint128).max);
        assertEq(yoga.balanceOf(alice), 2, "Alice should have 2 tokens");

        vm.stopPrank();
    }
}
