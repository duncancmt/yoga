// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "../BaseTest.sol";

contract YogaBasicTest is BaseTest {
    function test_InitialState() public view {
        assertEq(yoga.nextTokenId(), 1, "Initial token ID should be 1");
    }

    function test_PoolManagerAddress() public view {
        assertEq(
            address(yoga.POOL_MANAGER()),
            address(poolManager),
            "Pool manager address should match env"
        );
    }

    function test_PoolManagerExists() public view {
        assertTrue(
            address(poolManager).code.length > 0,
            "Pool manager should have code"
        );
    }

    function test_Name() public view {
        assertEq(yoga.name(), "YogaPosition", "Name should be YogaPosition");
    }

    function test_Symbol() public view {
        assertEq(yoga.symbol(), "YP", "Symbol should be YP");
    }

    function test_SupportsERC721Interface() public view {
        bytes4 erc721InterfaceId = 0x80ac58cd;
        assertTrue(yoga.supportsInterface(erc721InterfaceId), "Should support ERC721");
    }

    function test_SupportsERC165Interface() public view {
        bytes4 erc165InterfaceId = 0x01ffc9a7;
        assertTrue(yoga.supportsInterface(erc165InterfaceId), "Should support ERC165");
    }

    function test_TokenURI() public view {
        assertEq(yoga.tokenURI(1), "/dev/null", "Token URI should be /dev/null");
    }
}
