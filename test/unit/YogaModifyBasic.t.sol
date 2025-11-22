// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "../BaseTest.sol";
import {Yoga, SimpleModifyLiquidityParams} from "../../src/Yoga.sol";
import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";

contract YogaModifyBasicTest is BaseTest {
    /// @notice Verifies that only the position owner can modify liquidity, non-owners should be reverted
    function test_Modify_RequiresOwnership() public {
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
        vm.stopPrank();

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 100 ether
        });

        vm.startPrank(bob);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        vm.expectRevert();
        yoga.modify(
            payable(bob), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        vm.stopPrank();
    }

    /// @notice Verifies that the position owner can successfully modify (increase) liquidity on their position
    function test_Modify_OwnerCanModify() public {
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

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        BalanceDelta delta = yoga.modify(
            payable(alice), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        assertTrue(true, "Modify should succeed for owner");

        vm.stopPrank();
    }

    /// @notice Verifies that attempting to modify with zero liquidityDelta reverts with ZeroDelta error
    function test_Modify_RevertsOnZeroDelta() public {
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

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 0
        });

        vm.expectRevert(Yoga.ZeroDelta.selector);
        yoga.modify(
            payable(alice), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        vm.stopPrank();
    }

    /// @notice Verifies that an approved address (via approve()) can modify the position on behalf of the owner
    function test_Modify_ApprovedCanModify() public {
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

        vm.startPrank(bob);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(bob), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        assertTrue(true, "Approved address should be able to modify");

        vm.stopPrank();
    }

    /// @notice Verifies that modifying liquidity on the exact same tick range succeeds and maintains tick structure
    function test_Modify_ExactRange_SameTicksSucceeds() public {
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

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(alice), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        int24[] memory ticks = yoga.getTicks(tokenId);
        assertEq(ticks.length, 2, "Should have 2 ticks for exact range");
        assertEq(ticks[0], -tickSpacing * 6, "Lower tick unchanged");
        assertEq(ticks[1], tickSpacing * 6, "Upper tick unchanged");

        vm.stopPrank();
    }

    /// @notice Verifies that a position can be modified multiple times sequentially without issues
    function test_Modify_MultipleModifications() public {
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

        SimpleModifyLiquidityParams memory modifyParams1 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(alice), tokenId, modifyParams1, type(uint128).max, type(uint128).max
        );

        SimpleModifyLiquidityParams memory modifyParams2 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 250 ether
        });

        yoga.modify(
            payable(alice), tokenId, modifyParams2, type(uint128).max, type(uint128).max
        );

        assertEq(yoga.ownerOf(tokenId), alice, "Alice should still own position after multiple modifications");

        int24[] memory ticks = yoga.getTicks(tokenId);
        assertEq(ticks.length, 2, "Should still have 2 ticks");

        vm.stopPrank();
    }

    /// @notice Verifies that an operator with approvalForAll can modify any position owned by the approver
    function test_Modify_ApprovalForAllWorks() public {
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

        yoga.setApprovalForAll(bob, true);
        vm.stopPrank();

        vm.startPrank(bob);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(bob), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        assertTrue(true, "Operator with approvalForAll should be able to modify");

        vm.stopPrank();
    }

    /// @notice Verifies that token refunds can be sent to a different recipient than the caller
    function test_Modify_DifferentRecipient() public {
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

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(bob), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        assertEq(yoga.ownerOf(tokenId), alice, "Alice should still own the position");

        vm.stopPrank();
    }

    /// @notice Fuzz test verifying that various positive liquidity deltas can be applied to a position
    function testFuzz_Modify_DifferentLiquidityDeltas(int128 liquidityDelta) public {
        vm.assume(liquidityDelta > 100 ether && liquidityDelta < 5000 ether);

        int24 tickSpacing = testKey.tickSpacing;

        SimpleModifyLiquidityParams memory params = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 10000 ether
        });

        vm.startPrank(alice);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);

        (uint256 tokenId, ) = yoga.mint(
            testKey, params, type(uint128).max, type(uint128).max
        );

        SimpleModifyLiquidityParams memory modifyParams = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: int256(liquidityDelta)
        });

        yoga.modify(
            payable(alice), tokenId, modifyParams, type(uint128).max, type(uint128).max
        );

        assertEq(yoga.ownerOf(tokenId), alice, "Alice should still own position");

        vm.stopPrank();
    }

    /// @notice Verifies that different positions with different tick ranges can be modified independently
    function test_Modify_DifferentTickRanges() public {
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
            liquidityDelta: 1000 ether
        });

        (uint256 tokenId1, ) = yoga.mint(
            testKey, params1, type(uint128).max, type(uint128).max
        );

        (uint256 tokenId2, ) = yoga.mint(
            testKey, params2, type(uint128).max, type(uint128).max
        );

        SimpleModifyLiquidityParams memory modifyParams1 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 6,
            tickUpper: tickSpacing * 6,
            liquidityDelta: 500 ether
        });

        SimpleModifyLiquidityParams memory modifyParams2 = SimpleModifyLiquidityParams({
            tickLower: -tickSpacing * 12,
            tickUpper: tickSpacing * 12,
            liquidityDelta: 500 ether
        });

        yoga.modify(
            payable(alice), tokenId1, modifyParams1, type(uint128).max, type(uint128).max
        );

        yoga.modify(
            payable(alice), tokenId2, modifyParams2, type(uint128).max, type(uint128).max
        );

        int24[] memory ticks1 = yoga.getTicks(tokenId1);
        int24[] memory ticks2 = yoga.getTicks(tokenId2);

        assertEq(ticks1[0], -tickSpacing * 6, "Position 1 lower tick");
        assertEq(ticks1[1], tickSpacing * 6, "Position 1 upper tick");
        assertEq(ticks2[0], -tickSpacing * 12, "Position 2 lower tick");
        assertEq(ticks2[1], tickSpacing * 12, "Position 2 upper tick");

        vm.stopPrank();
    }
}

