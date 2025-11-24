// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "@forge-std/Test.sol";
import {StdInvariant} from "@forge-std/StdInvariant.sol";
import {Yoga, SimpleModifyLiquidityParams} from "../../src/Yoga.sol";
import {IERC20} from "@forge-std/interfaces/IERC20.sol";
import {Currency} from "@uniswapv4/types/Currency.sol";
import {PoolKey} from "@uniswapv4/types/PoolKey.sol";
import {IHooks} from "@uniswapv4/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswapv4/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswapv4/libraries/TickMath.sol";
import {StateLibrary} from "@uniswapv4/libraries/StateLibrary.sol";
import {Position} from "@uniswapv4/libraries/Position.sol";
import {BalanceDelta} from "@uniswapv4/types/BalanceDelta.sol";

contract YogaInvariantHandler is Test {
    Yoga public yoga;
    IPoolManager public poolManager;
    IERC20 public token0;
    IERC20 public token1;
    PoolKey public testKey;
    address public user;

    uint256[] public tokenIds;

    // perf: track last id to focus checks. checking all tokens is gas suicide.
    uint256 public lastModifiedTokenId;

    uint256 public ghost_mintCount;
    uint256 public ghost_modifyCount;

    // ghost state: theoretical volume (liq * width) we expect the contract to hold.
    // if this drifts from reality, we have a precision leak or a split/merge bug.
    int256 public ghost_tickVolume;

    constructor(
        Yoga _yoga,
        IPoolManager _poolManager,
        IERC20 _token0,
        IERC20 _token1,
        PoolKey memory _testKey,
        address _user
    ) {
        yoga = _yoga;
        poolManager = _poolManager;
        token0 = _token0;
        token1 = _token1;
        testKey = _testKey;
        user = _user;

        // setup: approve once. doing this in every handler call wastes traces.
        vm.startPrank(user);
        token0.approve(address(yoga), type(uint256).max);
        token1.approve(address(yoga), type(uint256).max);
        vm.stopPrank();
    }

    function mint(
        uint256 tickLowerSeed,
        uint256 tickUpperSeed,
        uint256 liquidityDeltaSeed
    ) public {
        int24 tickSpacing = testKey.tickSpacing;

        // fuzzing heuristic: keep ticks tight (+/- 20).
        // wide ranges blow up bitmap lookups and slow down the fuzzer.
        int24 tickLower = int24(int256(bound(tickLowerSeed, 0, 20))) *
            tickSpacing;
        int24 tickUpper = int24(int256(bound(tickUpperSeed, 21, 40))) *
            tickSpacing;

        // ordering sanity check
        if (tickLower >= tickUpper) {
            tickUpper = tickLower + tickSpacing;
        }

        uint256 liquidityDelta = bound(liquidityDeltaSeed, 1, 1000 ether);

        SimpleModifyLiquidityParams
            memory params = SimpleModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(liquidityDelta)
            });

        vm.startPrank(user);

        // note: inputs are valid now. if this reverts, the contract is broken.
        (uint256 tokenId, ) = yoga.mint(
            testKey,
            params,
            type(uint128).max,
            type(uint128).max
        );

        tokenIds.push(tokenId);
        lastModifiedTokenId = tokenId;
        ghost_mintCount++;

        // invariant update: track volume
        int256 width = int256(int24(tickUpper - tickLower));
        ghost_tickVolume += (width * int256(liquidityDelta));

        vm.stopPrank();
    }

    function modifyIncrease(
        uint256 tokenIdSeed,
        uint256 liquidityDeltaSeed
    ) public {
        if (tokenIds.length == 0) return;

        uint256 index = bound(tokenIdSeed, 0, tokenIds.length - 1);
        uint256 tokenId = tokenIds[index];

        int24[] memory ticks = yoga.getTicks(tokenId);
        if (ticks.length < 2) return;

        int24 tickLower = ticks[0];
        int24 tickUpper = ticks[1];

        uint256 liquidityDelta = bound(liquidityDeltaSeed, 1, 500 ether);

        SimpleModifyLiquidityParams
            memory params = SimpleModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(liquidityDelta)
            });

        vm.startPrank(user);
        yoga.modify(
            payable(user),
            tokenId,
            params,
            type(uint128).max,
            type(uint128).max
        );
        lastModifiedTokenId = tokenId;
        ghost_modifyCount++;

        // invariant update: track volume
        int256 width = int256(int24(tickUpper - tickLower));
        ghost_tickVolume += (width * int256(liquidityDelta));

        vm.stopPrank();
    }

    function modifyDecrease(
        uint256 tokenIdSeed,
        uint256 liquidityDeltaSeed
    ) public {
        if (tokenIds.length == 0) return;

        uint256 index = bound(tokenIdSeed, 0, tokenIds.length - 1);
        uint256 tokenId = tokenIds[index];

        int24[] memory ticks = yoga.getTicks(tokenId);
        if (ticks.length < 2) return;

        int24 tickLower = ticks[0];
        int24 tickUpper = ticks[1];

        // we need actual liquidity here to ensure we don't underflow.
        // heavy state read, but necessary.
        uint256 currentLiquidity = _getLiquidity(tokenId, tickLower, tickUpper);
        if (currentLiquidity == 0) return;

        // bug fix: allow dust removal (min = 1 wei).
        // previous impl used 1 ether, causing crashes on small positions.
        uint256 decreaseAmount = bound(liquidityDeltaSeed, 1, currentLiquidity);

        SimpleModifyLiquidityParams
            memory params = SimpleModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: -int256(decreaseAmount)
            });

        vm.startPrank(user);
        yoga.modify(
            payable(user),
            tokenId,
            params,
            type(uint128).max,
            type(uint128).max
        );
        lastModifiedTokenId = tokenId;
        ghost_modifyCount++;

        // invariant update: track volume (negative delta)
        int256 width = int256(int24(tickUpper - tickLower));
        ghost_tickVolume += (width * -int256(decreaseAmount));

        vm.stopPrank();
    }

    function _getLiquidity(
        uint256 tokenId,
        int24 tickLower,
        int24 tickUpper
    ) private view returns (uint256) {
        return
            StateLibrary.getPositionLiquidity(
                poolManager,
                testKey.toId(),
                Position.calculatePositionKey(
                    address(yoga),
                    tickLower,
                    tickUpper,
                    bytes32(tokenId)
                )
            );
    }

    function getTokenIds() external view returns (uint256[] memory) {
        return tokenIds;
    }
}

contract YogaInvariantTest is StdInvariant, Test {
    Yoga public yoga;
    IPoolManager public poolManager;
    IERC20 public token0;
    IERC20 public token1;
    PoolKey public testKey;
    address public user;
    YogaInvariantHandler public handler;

    function setUp() public {
        string memory rpcUrl = vm.envString("RPC_URL");
        vm.createSelectFork(rpcUrl);

        yoga = new Yoga();

        address poolManagerAddr = vm.envAddress("POOL_MANAGER");
        poolManager = IPoolManager(poolManagerAddr);

        user = makeAddr("user");

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

        deal(currency0, user, 100000 ether);
        deal(currency1, user, 100000 ether);
        deal(user, 100 ether);

        poolManager.initialize(testKey, TickMath.getSqrtPriceAtTick(0));

        handler = new YogaInvariantHandler(
            yoga,
            poolManager,
            token0,
            token1,
            testKey,
            user
        );

        targetContract(address(handler));
    }

    // --- helpers ---

    function _checkLiquidity(uint256 tokenId) internal view {
        int24[] memory ticks;
        try yoga.getTicks(tokenId) returns (int24[] memory _ticks) {
            ticks = _ticks;
        } catch {
            return;
        }

        if (ticks.length == 0) return;

        // invariant: monotonicity
        for (uint256 j = 1; j < ticks.length; j++) {
            if (ticks[j] <= ticks[j - 1]) revert("ticks not sorted");
        }

        // invariant: alignment
        int24 spacing = testKey.tickSpacing;
        for (uint256 j = 0; j < ticks.length; j++) {
            if (ticks[j] % spacing != 0) revert("invalid spacing");
        }

        // invariant: topology
        uint256 prevLiquidity = 0;
        for (uint256 j = 0; j < ticks.length; j += 2) {
            if (j + 1 >= ticks.length) break;

            int24 tickLower = ticks[j];
            int24 tickUpper = ticks[j + 1];

            uint256 liquidity = StateLibrary.getPositionLiquidity(
                poolManager,
                testKey.toId(),
                Position.calculatePositionKey(
                    address(yoga),
                    tickLower,
                    tickUpper,
                    bytes32(tokenId)
                )
            );

            // 1: terminus health. start/end nodes must have liquidity or they should be pruned.
            if (j == 0 || j + 2 >= ticks.length) {
                if (liquidity == 0) revert("terminus zero liquidity");
            }

            // 2: merge efficiency. adjacent ranges with identical liquidity implies failed merge.
            if (j > 0) {
                if (
                    liquidity != 0 &&
                    prevLiquidity != 0 &&
                    liquidity == prevLiquidity
                ) {
                    revert("adjacent ranges have same non-zero liquidity");
                }
            }

            prevLiquidity = liquidity;
        }
    }

    /// @notice invariant: structural integrity
    /// checks last modified token + 1 random token.
    /// avoids o(n) loop which increases time required, can be removed later.
    function invariant_core_health_checks() public view {
        uint256[] memory tokenIds = handler.getTokenIds();
        if (tokenIds.length == 0) return;

        // 1. check hot path (highest regression probability)
        uint256 lastId = handler.lastModifiedTokenId();
        if (lastId != 0) {
            _checkLiquidity(lastId);
        }

        // 2. check random historical token id
        // using block.timestamp is weak randomness but fine for invariant view context
        uint256 randomIndex = uint256(
            keccak256(abi.encodePacked(block.timestamp, tokenIds.length))
        ) % tokenIds.length;
        _checkLiquidity(tokenIds[randomIndex]);
    }

    /// @notice invariant: conservation of mass
    /// sum(liquidity * width) must equal ghost volume.
    /// proves split/merge logic never creates or destroys value.
    function invariant_conserved_tick_volume() public view {
        uint256[] memory tokenIds = handler.getTokenIds();
        int256 actualTotalVolume = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            int24[] memory ticks;
            try yoga.getTicks(tokenId) returns (int24[] memory _ticks) {
                ticks = _ticks;
            } catch {
                continue;
            }

            for (uint256 j = 0; j < ticks.length; j += 2) {
                if (j + 1 >= ticks.length) break;

                int24 tLower = ticks[j];
                int24 tUpper = ticks[j + 1];

                // query uniswap v4 state directly
                uint256 liquidity = StateLibrary.getPositionLiquidity(
                    poolManager,
                    testKey.toId(),
                    Position.calculatePositionKey(
                        address(yoga),
                        tLower,
                        tUpper,
                        bytes32(tokenId)
                    )
                );

                int256 width = int256(int24(tUpper - tLower));
                actualTotalVolume += (width * int256(liquidity));
            }
        }

        assertEq(
            actualTotalVolume,
            handler.ghost_tickVolume(),
            "liquidity volume mismatch"
        );
    }
}
