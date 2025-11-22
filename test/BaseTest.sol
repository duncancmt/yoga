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

    bool public usingNativeETH;

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
        try vm.envAddress("POOL_CURRENCY0") returns (address currency0) {
            try vm.envAddress("POOL_CURRENCY1") returns (address currency1) {
                _setupRealPool(currency0, currency1);
                return;
            } catch {}
        } catch {}

        _setupMockTokenPool();
    }

    function _setupRealPool(address currency0, address currency1) internal {
        usingNativeETH = (currency0 == address(0) || currency1 == address(0));

        if (currency0 == address(0)) {
            token0 = IERC20(address(new NativeETHWrapper()));
        } else {
            token0 = IERC20(currency0);
        }

        if (currency1 == address(0)) {
            token1 = IERC20(address(new NativeETHWrapper()));
        } else {
            token1 = IERC20(currency1);
        }

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

        if (currency0 == address(0)) {
            deal(alice, 10000 ether);
            deal(bob, 10000 ether);
            deal(charlie, 10000 ether);
        } else {
            deal(currency0, alice, 10000 ether);
            deal(currency0, bob, 10000 ether);
            deal(currency0, charlie, 10000 ether);
        }

        if (currency1 == address(0)) {
            deal(alice, 10000 ether);
            deal(bob, 10000 ether);
            deal(charlie, 10000 ether);
        } else {
            deal(currency1, alice, 10000 ether);
            deal(currency1, bob, 10000 ether);
            deal(currency1, charlie, 10000 ether);
        }

        if (!usingNativeETH) {
            deal(alice, 100 ether);
            deal(bob, 100 ether);
            deal(charlie, 100 ether);
        }

        _tryInitializePool();
    }

    function _setupMockTokenPool() internal {
        usingNativeETH = false;

        MockERC20 mockToken0 = new MockERC20("Mock Token 0", "MTK0");
        MockERC20 mockToken1 = new MockERC20("Mock Token 1", "MTK1");

        if (address(mockToken0) < address(mockToken1)) {
            token0 = IERC20(address(mockToken0));
            token1 = IERC20(address(mockToken1));
        } else {
            token0 = IERC20(address(mockToken1));
            token1 = IERC20(address(mockToken0));
        }

        testKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        deal(address(token0), alice, 10000 ether);
        deal(address(token1), alice, 10000 ether);
        deal(address(token0), bob, 10000 ether);
        deal(address(token1), bob, 10000 ether);
        deal(address(token0), charlie, 10000 ether);
        deal(address(token1), charlie, 10000 ether);

        deal(alice, 100 ether);
        deal(bob, 100 ether);
        deal(charlie, 100 ether);

        _tryInitializePool();
    }

    function _tryInitializePool() internal {
        poolManager.initialize(testKey, TickMath.getSqrtPriceAtTick(0));
    }
}

contract NativeETHWrapper is IERC20 {
    function name() external pure returns (string memory) {
        return "Native ETH";
    }

    function symbol() external pure returns (string memory) {
        return "ETH";
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function balanceOf(address account) external view returns (uint256) {
        return account.balance;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("Use native ETH transfer");
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("Use native ETH transfer");
    }

    function totalSupply() external pure returns (uint256) {
        return type(uint256).max;
    }

    function allowance(address, address) external pure returns (uint256) {
        return type(uint256).max;
    }
}

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
