// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "@forge-std/Test.sol";
import {Yoga} from "../src/Yoga.sol";
import {IERC20} from "@forge-std/interfaces/IERC20.sol";
import {Currency} from "@uniswapv4/types/Currency.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {IHooks} from "@uniswapv4/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswapv4/libraries/TickMath.sol";

contract BaseTest is Test {
    Yoga public yoga;
    IPoolManager public poolManager;

    IERC20 public token0;
    IERC20 public token1;
    PoolKey public testKey;

    address public alice;
    address public bob;
    address public charlie;

    function setUp() public virtual {
        string memory rpcUrl = vm.envString("RPC_URL");
        vm.createSelectFork(rpcUrl);

        yoga = new Yoga();

        address poolManagerAddr = vm.envAddress("POOL_MANAGER");
        poolManager = IPoolManager(poolManagerAddr);

        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");

        _setupTokensAndPool();
    }

    function _setupTokensAndPool() internal {
        address currency0 = vm.envAddress("POOL_CURRENCY0");
        address currency1 = vm.envAddress("POOL_CURRENCY1");

        token0 = IERC20(currency0);
        token1 = IERC20(currency1);

        uint24 fee = uint24(vm.envUint("POOL_FEE"));
        int24 tickSpacing = int24(vm.envInt("POOL_TICK_SPACING"));
        address hooks = vm.envAddress("POOL_HOOKS");

        testKey = PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooks)
        });

        deal(currency0, alice, 10000 ether);
        deal(currency0, bob, 10000 ether);
        deal(currency0, charlie, 10000 ether);

        deal(currency1, alice, 10000 ether);
        deal(currency1, bob, 10000 ether);
        deal(currency1, charlie, 10000 ether);

        deal(alice, 100 ether);
        deal(bob, 100 ether);
        deal(charlie, 100 ether);

        poolManager.initialize(testKey, TickMath.getSqrtPriceAtTick(0));
    }
}
