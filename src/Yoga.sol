// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC165} from "@forge-std/interfaces/IERC165.sol";
import {ERC721} from "@solady/tokens/ERC721.sol";

import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswapv4/types/PoolOperation.sol";
import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswapv4/interfaces/IUnlockCallback.sol";

//import {MultiCallContext} from "lib/MultiCallContext.sol";

contract Yoga is IERC165, IUnlockCallback, ERC721 /*, MultiCallContext */ {
    IPoolManager public constant POOL_MANAGER = IPoolManager(0x1f98400000000000000000000000000000000004);

    uint256 public nextTokenid = 1;

    function mint(PoolKey calldata key, ModifyLiquidityParams calldata params) external returns (uint256 tokenId) {
        unchecked {
            tokenId = nextTokenId++;
        }
        _safeMint(msg.sender, tokenId);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(POOL_MANAGER));
    }
}
