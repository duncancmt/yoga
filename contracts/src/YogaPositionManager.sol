// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {MiniV4Manager} from "./MiniV4Manager.sol";

/// @title YogaStudio
/// @notice Don't just hold positions. Flow through them.
/// @dev Manages multi-range liquidity positions (Asanas) via a single NFT.
contract YogaStudio is MiniV4Manager, ERC721 {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    // --- Vibe Checks ---
    error BadKarma(); // Not authorized
    error EmptyMat(); // Token doesn't exist
    error ChakraBlocked(int24 tl, int24 tu, int24 current); // Overlaps active tick
    error Imbalanced(int256 d0, int256 d1); // Principal delta not zero
    error BrokenBone(); // Invalid range
    error PainfulStretch(); // Slippage

    event Namaste(uint256 indexed matId, address indexed yogi, PoolKey key);
    event Flow(uint256 indexed matId, uint256 limbsGone, uint256 limbsNew);

    // A "Limb" is a specific tick range within your total Asana
    struct Limb {
        int24 tl; // tick lower
        int24 tu; // tick upper
        uint128 liq;
        bytes32 mantra; // salt for the hook
    }

    struct AsanaConfig {
        PoolKey key;
        uint96 mantraNonce; // bumps up to keep salts unique
    }

    // Where we want to move liquidity to
    struct NextMove {
        int24 tl;
        int24 tu;
        uint128 liq;
    }

    struct SessionParams {
        PoolKey key;
        int24 tl;
        int24 tu;
        uint128 liq;
        uint128 max0;
        uint128 max1;
        address yogi;
    }

    // Payload for the unlock callback
    struct BreathData {
        uint256 matId;
        NextMove[] moves;
        uint128 max0;
        uint128 max1;
        address payer;
    }

    uint256 public nextMatId = 1;

    // map(matId => config)
    mapping(uint256 => AsanaConfig) public asanas;
    // map(matId => limbs[])
    mapping(uint256 => Limb[]) public limbs;

    constructor(
        IPoolManager _pm
    ) MiniV4Manager(_pm) ERC721("Yoga Studio", "OM") {}

    modifier onlyYogi(uint256 id) {
        if (_ownerOf(id) == address(0)) revert EmptyMat();
        if (!_isAuthorized(_ownerOf(id), msg.sender, id)) revert BadKarma();
        _;
    }

    // Start a new session. One range to begin with.
    function beginPractice(
        SessionParams calldata p
    ) external returns (uint256 matId) {
        matId = nextMatId++;
        _mint(p.yogi, matId);

        asanas[matId] = AsanaConfig({key: p.key, mantraNonce: 0});

        // Initial pose has just one limb
        NextMove[] memory firstMove = new NextMove[](1);
        firstMove[0] = NextMove(p.tl, p.tu, p.liq);

        _breathe(matId, firstMove, p.max0, p.max1, msg.sender);

        emit Namaste(matId, p.yogi, p.key);
    }

    // Re-arrange your liquidity without swapping.
    // The "flow" state implies strict 0-principal delta.
    function flow(
        uint256 matId,
        NextMove[] calldata nextMoves
    ) external onlyYogi(matId) {
        _breathe(matId, nextMoves, 0, 0, msg.sender);
    }

    // Trigger the hook interactions
    function _breathe(
        uint256 matId,
        NextMove[] memory moves,
        uint128 m0,
        uint128 m1,
        address payer
    ) internal {
        BreathData memory d = BreathData({
            matId: matId,
            moves: moves,
            max0: m0,
            max1: m1,
            payer: payer
        });

        POOL_MANAGER.unlock(abi.encode(d));
    }

    // Required V4 callback. This is where the heavy lifting happens.
    function unlockCallback(
        bytes calldata raw
    ) external override onlyPoolManager returns (bytes memory) {
        BreathData memory data = abi.decode(raw, (BreathData));

        // storage pointer for cleaner code
        AsanaConfig storage cfg = asanas[data.matId];

        // Check alignment (current tick)
        (, int24 currentTick, , ) = StateLibrary.getSlot0(
            POOL_MANAGER,
            cfg.key.toId()
        );

        BalanceDelta net;
        Limb[] storage currentLimbs = limbs[data.matId];

        // We reconstruct the array of limbs to keep.
        // Allocating slightly more memory than needed to be safe/lazy.
        Limb[] memory nextLimbs = new Limb[](
            currentLimbs.length + data.moves.length
        );

        uint256 kept = 0;
        uint256 dropped = 0;

        // 1. EXHALE: Remove inactive limbs
        for (uint256 i = 0; i < currentLimbs.length; i++) {
            Limb memory l = currentLimbs[i];
            bool active = (l.tl <= currentTick && currentTick < l.tu);

            if (active) {
                // Keep the tension here, don't touch active ranges
                nextLimbs[kept++] = l;
            } else {
                // Relax this limb (remove liq)
                (BalanceDelta d, ) = POOL_MANAGER.modifyLiquidity(
                    cfg.key,
                    ModifyLiquidityParams({
                        tickLower: l.tl,
                        tickUpper: l.tu,
                        liquidityDelta: -int256(uint256(l.liq)),
                        salt: l.mantra
                    }),
                    ""
                );
                net = net + d;
                dropped++;
            }
        }

        // 2. INHALE: Add new moves
        uint256 added = 0;
        for (uint256 i = 0; i < data.moves.length; i++) {
            NextMove memory m = data.moves[i];
            if (m.liq == 0) continue;
            if (m.tl >= m.tu) revert BrokenBone();

            // Don't stretch into the active tick during a reshape
            // (It messes up the 0-swap math)
            bool overlap = (m.tl <= currentTick && currentTick < m.tu);
            if (overlap && currentLimbs.length > 0) {
                revert ChakraBlocked(m.tl, m.tu, currentTick);
            }

            // Generate a unique mantra for this range
            bytes32 newMantra = keccak256(
                abi.encode(data.matId, cfg.mantraNonce++)
            );

            (BalanceDelta d, ) = POOL_MANAGER.modifyLiquidity(
                cfg.key,
                ModifyLiquidityParams({
                    tickLower: m.tl,
                    tickUpper: m.tu,
                    liquidityDelta: int256(uint256(m.liq)),
                    salt: newMantra
                }),
                ""
            );

            net = net + d;

            nextLimbs[kept++] = Limb({
                tl: m.tl,
                tu: m.tu,
                liq: m.liq,
                mantra: newMantra
            });
            added++;
        }

        // 3. BALANCE: Ensure we didn't accidentally swap
        // Skip check on first mint
        if (currentLimbs.length > 0) {
            // tiny tolerance for wei-dust issues
            int256 dust = 1e14;
            int256 d0 = int256(net.amount0());
            int256 d1 = int256(net.amount1());

            if (d0 > dust || d0 < -dust || d1 > dust || d1 < -dust) {
                revert Imbalanced(d0, d1);
            }
        }

        // 4. UPDATE STATE
        delete limbs[data.matId];
        for (uint256 i = 0; i < kept; i++) {
            limbs[data.matId].push(nextLimbs[i]);
        }

        // 5. SETTLEMENT
        address owner = ownerOf(data.matId);
        int256 final0 = int256(net.amount0());
        int256 final1 = int256(net.amount1());

        // Handle Token 0
        if (final0 < 0) {
            uint256 debt = uint256(-final0);
            // Slippage check only on entry
            if (currentLimbs.length == 0 && debt > data.max0)
                revert PainfulStretch();
            _settle(cfg.key.currency0, data.payer, debt);
        } else if (final0 > 0) {
            _take(cfg.key.currency0, owner, uint256(final0));
        }

        // Handle Token 1
        if (final1 < 0) {
            uint256 debt = uint256(-final1);
            if (currentLimbs.length == 0 && debt > data.max1)
                revert PainfulStretch();
            _settle(cfg.key.currency1, data.payer, debt);
        } else if (final1 > 0) {
            _take(cfg.key.currency1, owner, uint256(final1));
        }

        emit Flow(data.matId, dropped, added);
        return abi.encode(net);
    }

    // --- Views (Look in the Mirror) ---

    function lookAtLimbs(uint256 matId) external view returns (Limb[] memory) {
        return limbs[matId];
    }
}
