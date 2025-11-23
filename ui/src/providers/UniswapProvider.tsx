"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { createPublicClient, http, keccak256, numberToHex, padHex } from "viem";
import { unichain } from "viem/chains";
import {
  Token,
  ChainId,
  Ether,
  Percent,
  Price,
  Currency,
} from "@uniswap/sdk-core";
import {
  Pool,
  Position as UniPosition,
  V4PositionManager,
  priceToClosestTick,
  tickToPrice,
} from "@uniswap/v4-sdk";
import { nearestUsableTick } from "@uniswap/v3-sdk";
import {
  CHECK_ALLOWANCE_ABI,
  APPROVE_ALLOWANCE_ABI,
  STATE_VIEW_ABI,
  YOGA_GET_KEY_ABI,
  YOGA_GET_TICKS_ABI,
  YOGA_MINT_POSITION_ABI,
  YOGA_MODIFY_POSITION_ABI,
  YOGA_OWNER_OF_ABI,
} from "../config/abis";
import { encodePacked } from "viem";
import { safeGetItem, safeSetItem } from "@/lib/utils";

// Uniswap V4 contract addresses
const STATE_VIEW_ADDRESS = "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2";
// Yoga custom position manager address - TODO: Update with deployed contract address
const YOGA_POSITION_MANAGER_ADDRESS =
  "0xB0c8B766bFC40891F0f829CCAdb638F4Ec2393E3"; // PLACEHOLDER

// Constants
const ETH_NATIVE = Ether.onChain(ChainId.UNICHAIN);
const CHAIN_ID = ChainId.UNICHAIN;

// Token addresses
const USDC_TOKEN_ADDRESS = "0x078D782b760474a361dDA0AF3839290b0EF57AD6";

// Pool parameters
const FEE = 500;
const TICK_SPACING = 10;
const HOOKS = "0x0000000000000000000000000000000000000000";

// Token definitions
const USDC_TOKEN = new Token(CHAIN_ID, USDC_TOKEN_ADDRESS, 6, "USDC", "USDC");

// Create basic viem public client for reading blockchain data
const publicClient = createPublicClient({
  chain: unichain,
  transport: http(),
});

// Types
export interface MintPositionParams {
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  recipient: `0x${string}`;
  slippageTolerance?: number;
  deadline?: number;
}

export interface createSubPosition {
  tokenId: bigint;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  recipient: `0x${string}`;
}

export interface PoolInfo {
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
}

// Position type
export interface Position {
  minPrice: number;
  maxPrice: number;
  amount0: string;
  amount1: string;
  positionValue: string;
  lastInputToken: "eth" | "usdc" | null;
}

export interface PositionDetails {
  tokenId: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0: number;
  amount1: number;
  totalValueUsd: number;
  poolKey: {
    currency0: `0x${string}`;
    currency1: `0x${string}`;
    fee: number;
    tickSpacing: number;
    hooks: `0x${string}`;
  };
}

export interface AddLiquidityParams {
  tokenId: bigint;
  amount0Desired: bigint;
  amount1Desired: bigint;
  tickLower: number;
  tickUpper: number;
  slippageTolerance?: number;
  deadline?: number;
}

export interface RemoveLiquidityParams {
  tokenId: bigint;
  liquidityPercentage: number;
  tickLower: number;
  tickUpper: number;
  slippageTolerance?: number;
  deadline?: number;
  burnToken?: boolean;
}

//SimpleModifyLiquidityParams takes
// int24 tickLower;
// int24 tickUpper;
// int256 liquidityDelta;

//Mint takes
// PoolKey calldata key,
// SimpleModifyLiquidityParams calldata params,
// uint128 currency0Max,
// uint128 currency1Max

//Modify takes
// address payable recipient,
// uint256 tokenId,
// SimpleModifyLiquidityParams calldata params,
// uint128 currency0Max,
// uint128 currency1Max
export interface NewModifyLiquidityParams {
  tokenId: bigint;
  address: `0x${string}`;
  liquidityDelta: bigint;
  tickLower: number;
  tickUpper: number;
  amount0: bigint;
  amount1: bigint;
}

export interface NewMintPositionParams {
  liquidityDelta: bigint;
  tickLower: number;
  tickUpper: number;
  amount0: bigint;
  amount1: bigint;
  poolKey: {
    currency0: `0x${string}`;
    currency1: `0x${string}`;
    fee: number;
    tickSpacing: number;
    hooks: `0x${string}`;
  };
}

interface UniswapContextType {
  getPoolInfo: () => Promise<PoolInfo | null>;
  getCurrentPrice: () => Promise<number | null>;
  priceToTick: (price: number) => number;
  tickToPrice: (tick: number) => number;
  getTickRangeAmounts: (
    tokenId: bigint,
    tickLower: number,
    tickUpper: number
  ) => Promise<{ amount0: number; amount1: number }>;
  mintPosition: (params: MintPositionParams) => Promise<void>;
  addLiquidity: (params: AddLiquidityParams) => Promise<void>;
  checkAllowance: (spender: `0x${string}`, amount: bigint) => Promise<boolean>;
  approveAllowance: (spender: `0x${string}`, amount: bigint) => Promise<void>;
  getTicks: (tokenId: bigint) => Promise<number[]>;
  removeLiquidity: (params: RemoveLiquidityParams) => Promise<void>;
  createSubPosition: (params: createSubPosition) => Promise<void>;
  fetchUserPositions: (
    userAddress: `0x${string}`
  ) => Promise<PositionDetails[]>;
  isConfirming: boolean;
  isConfirmed: boolean;
  transactionHash?: `0x${string}`;
  error: Error | null;
}

const UniswapContext = createContext<UniswapContextType | undefined>(undefined);

export function UniswapProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<Error | null>(null);

  const { data: hash, error: writeError, writeContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  /**
   * Fetches the current pool state from the blockchain
   */
  const getPoolInfo = async (): Promise<PoolInfo | null> => {
    try {
      // Get pool ID using SDK helper
      const poolId = Pool.getPoolId(
        ETH_NATIVE,
        USDC_TOKEN,
        FEE,
        TICK_SPACING,
        HOOKS
      );

      // Fetch pool state from StateView contract
      const [slot0Data, liquidityData] = await Promise.all([
        publicClient.readContract({
          address: STATE_VIEW_ADDRESS as `0x${string}`,
          abi: STATE_VIEW_ABI,
          functionName: "getSlot0",
          args: [poolId as `0x${string}`],
        }),
        publicClient.readContract({
          address: STATE_VIEW_ADDRESS as `0x${string}`,
          abi: STATE_VIEW_ABI,
          functionName: "getLiquidity",
          args: [poolId as `0x${string}`],
        }),
      ]);

      // Extract slot0 data
      const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0Data as [
        bigint,
        number,
        number,
        number
      ];

      const poolInfo: PoolInfo = {
        sqrtPriceX96,
        tick,
        protocolFee,
        lpFee,
        liquidity: liquidityData as bigint,
      };

      return poolInfo;
    } catch (err) {
      console.error("Error fetching pool info:", err);
      setError(err as Error);
      return null;
    }
  };

  /**
   * Gets the current price of ETH in terms of USDC
   */
  const getCurrentPrice = async (): Promise<number | null> => {
    try {
      const poolInfo = await getPoolInfo();
      if (!poolInfo) return null;

      // Create Pool instance
      const pool = new Pool(
        ETH_NATIVE,
        USDC_TOKEN,
        FEE,
        TICK_SPACING,
        HOOKS,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
      );

      // Get price of ETH (currency0) in terms of USDC (currency1)
      const price = pool.priceOf(ETH_NATIVE);

      // Convert to number - this gives us USDC per ETH
      return parseFloat(price.toSignificant(6));
    } catch (err) {
      console.error("Error getting current price:", err);
      return null;
    }
  };

  /**
   * Converts a price to the nearest valid tick
   * @param price - Price in USDC per ETH
   */
  const priceToTickFn = (price: number): number => {
    // Create a Price object representing USDC per ETH
    const baseAmount = (10 ** ETH_NATIVE.decimals).toString();
    const quoteAmount = Math.floor(
      price * 10 ** USDC_TOKEN.decimals
    ).toString();

    const priceObj = new Price(ETH_NATIVE, USDC_TOKEN, baseAmount, quoteAmount);

    // Get closest tick and ensure it's aligned with tick spacing
    const tick = priceToClosestTick(priceObj);
    return nearestUsableTick(tick, TICK_SPACING);
  };

  /**
   * Converts a tick to a price
   * @param tick - Tick value
   * @returns Price in USDC per ETH
   */
  const tickToPriceFn = (tick: number): number => {
    const priceObj = tickToPrice(ETH_NATIVE, USDC_TOKEN, tick);
    return parseFloat(priceObj.toSignificant(6));
  };

  const checkAllowance = async (spender: `0x${string}`, amount: bigint) => {
    const usdcAllowance = await publicClient.readContract({
      address: USDC_TOKEN_ADDRESS as `0x${string}`,
      abi: CHECK_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [spender, YOGA_POSITION_MANAGER_ADDRESS],
    });

    if (BigInt(usdcAllowance) >= BigInt(amount)) {
      return true;
    } else {
      return false;
    }
  };

  const approveAllowance = async (spender: `0x${string}`, amount: bigint) => {
    writeContract({
      address: USDC_TOKEN_ADDRESS as `0x${string}`,
      abi: APPROVE_ALLOWANCE_ABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };
  /**
   * Mints a new liquidity position using the Yoga contract
   */
  const mintPosition = async (params: MintPositionParams) => {
    try {
      setError(null);

      // 1. Fetch current pool state
      const poolInfo = await getPoolInfo();
      if (!poolInfo) {
        throw new Error("Failed to fetch pool info");
      }

      // 2. Create Pool instance with fetched data
      const pool = new Pool(
        ETH_NATIVE,
        USDC_TOKEN,
        FEE,
        TICK_SPACING,
        HOOKS,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
      );

      // 3. Align ticks to tick spacing
      const tickLower = nearestUsableTick(params.tickLower, TICK_SPACING);
      const tickUpper = nearestUsableTick(params.tickUpper, TICK_SPACING);

      // 4. Create Position from desired amounts to calculate liquidity
      const position = UniPosition.fromAmounts({
        pool,
        tickLower,
        tickUpper,
        amount0: params.amount0Desired.toString(),
        amount1: params.amount1Desired.toString(),
        useFullPrecision: true,
      });

      const liquidity = BigInt(position.liquidity.toString());

      // 5. Prepare slippage limits
      const slippageTolerance = params.slippageTolerance || 0.5; // 0.5% default
      const slippageFactor = 1 + slippageTolerance / 100;

      const currency0Max = BigInt(
        Math.floor(Number(params.amount0Desired) * slippageFactor)
      );
      const currency1Max = BigInt(
        Math.floor(Number(params.amount1Desired) * slippageFactor)
      );

      // 6. Prepare PoolKey structure
      const poolKey = {
        currency0:
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
        currency1: USDC_TOKEN.address as `0x${string}`,
        fee: FEE,
        tickSpacing: TICK_SPACING,
        hooks: HOOKS as `0x${string}`,
      };

      // 7. Prepare SimpleModifyLiquidityParams
      const modifyParams = {
        tickLower,
        tickUpper,
        liquidityDelta: liquidity,
      };

      //Check allowance
      await checkAllowance(YOGA_POSITION_MANAGER_ADDRESS, currency1Max);

      // 8. Execute transaction
      writeContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_MINT_POSITION_ABI,
        functionName: "mint",
        args: [poolKey, modifyParams, currency0Max, currency1Max],
        value: params.amount0Desired, // ETH value for native currency
      });
    } catch (err) {
      console.error("Error minting position:", err);
      setError(err as Error);
      throw err;
    }
  };

  // /**
  //  * Fetches position IDs from the subgraph for a given owner
  //  */
  // const getPositionIds = async (owner: `0x${string}`): Promise<bigint[]> => {
  //   const GET_POSITIONS_QUERY = `
  //     query GetPositions($owner: String!) {
  //       positions(where: { owner: $owner }) {
  //         tokenId
  //         owner
  //         id
  //       }
  //     }
  //   `;

  //   try {
  //     const headers = {
  //       Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY}`,
  //     };

  //     const response = await fetch(UNICHAIN_SUBGRAPH_URL, {
  //       method: "POST",
  //       headers,
  //       body: JSON.stringify({
  //         query: GET_POSITIONS_QUERY,
  //         variables: { owner: owner.toLowerCase() },
  //       }),
  //     });

  //     const data = await response.json();

  //     if (data.errors) {
  //       throw new Error(data.errors[0].message);
  //     }

  //     const positions = data.data.positions as SubgraphPosition[];
  //     return positions.map((p) => BigInt(p.tokenId));
  //   } catch (err) {
  //     console.error("Error fetching position IDs:", err);
  //     throw err;
  //   }
  // };

  const getTicks = async (tokenId: bigint): Promise<number[]> => {
    const ticks = (await publicClient.readContract({
      address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: YOGA_GET_TICKS_ABI,
      functionName: "getTicks",
      args: [tokenId],
    })) as number[];

    const sortedTicks = ticks.sort((a, b) => a - b);

    return sortedTicks;
  };

  const getPoolKey = async (tokenId: bigint) => {
    const [currency0, currency1, fee, tickSpacing, hooks] =
      (await publicClient.readContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_GET_KEY_ABI,
        functionName: "getKey",
        args: [tokenId],
      })) as readonly [
        `0x${string}`,
        `0x${string}`,
        number,
        number,
        `0x${string}`
      ];

    const poolKey = {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    };
    return poolKey;
  };

  const getPoolId = async (tokenId: bigint) => {
    const { currency0, currency1, fee, tickSpacing, hooks } = await getPoolKey(
      tokenId
    );
    return Pool.getPoolId(ETH_NATIVE, USDC_TOKEN, fee, tickSpacing, hooks);
  };

  const getPool = async (tokenId: bigint) => {
    const poolKey = await getPoolKey(tokenId);
    const poolInfo = await getPoolInfo();
    if (!poolInfo) {
      throw new Error("Failed to fetch pool info");
    }
    return new Pool(
      ETH_NATIVE,
      USDC_TOKEN,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      poolInfo.sqrtPriceX96.toString(),
      poolInfo.liquidity.toString(),
      poolInfo.tick
    );
  };

  const getPositionId = async (
    tokenId: bigint,
    tickLower: number,
    tickUpper: number
  ) => {
    const poolInfo = await getPoolInfo();
    if (!poolInfo) {
      throw new Error("Failed to fetch pool info");
    }

    //the hash of the packed encoding owner, tick lower, tick upper, salt

    const owner = YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`;
    const salt = padHex(numberToHex(tokenId), { size: 32 });

    console.log("Salt:", salt);

    const postionId = keccak256(
      encodePacked(
        ["address", "int24", "int24", "bytes32"],
        [owner, tickLower, tickUpper, salt]
      )
    );

    return postionId;
  };

  // const getSubPositionDetails = async (
  //   tokenId: bigint,
  //   tickLower: number,
  //   tickUpper: number
  // ): Promise<PositionDetails> => {
  //   const poolId = await getPoolId(tokenId);
  //   const postionId = await getPositionId(tokenId, tickLower, tickUpper);
  //   const pool = await getPool(tokenId);
  // };
  //   const liquidity = (await publicClient.readContract({
  //     address: STATE_VIEW_ADDRESS as `0x${string}`,
  //     abi: STATE_VIEW_ABI,
  //     functionName: "getPositionLiquidity",
  //     args: [poolId as `0x${string}`, postionId as `0x${string}`],
  //   })) as bigint;

  //   const uniPos = new UniPosition({
  //     pool,
  //     tickLower,
  //     tickUpper,
  //     liquidity: liquidity.toString(),
  //   });

  //   return {
  //     tokenId,
  //     tickLower,
  //     tickUpper,
  //     liquidity,
  //     poolKey,
  //     amount0: 0,
  //     amount1: 0,
  //   };
  // };

  /**
   * Fetches details for a specific position from Yoga contract
   */
  const getPositionDetails = async (
    tokenId: bigint,
    lowerTick?: number,
    upperTick?: number
  ): Promise<PositionDetails> => {
    try {
      const ticks = await getTicks(tokenId);
      const poolId = await getPoolId(tokenId);
      const poolKey = await getPoolKey(tokenId);
      const pool = await getPool(tokenId);

      const ranges = [];

      if (lowerTick && upperTick) {
        ranges.push({
          lower: lowerTick,
          upper: upperTick,
          liquidity: BigInt(0),
        });
      } else {
        for (let i = 0; i < ticks.length - 1; i++) {
          ranges.push({
            lower: ticks[i],
            upper: ticks[i + 1],
            liquidity: BigInt(0),
          });
        }
      }

      let totalLiquidity = BigInt(0);

      for (const r of ranges) {
        const postionId = await getPositionId(tokenId, r.lower, r.upper);
        const liquidity = (await publicClient.readContract({
          address: STATE_VIEW_ADDRESS as `0x${string}`,
          abi: STATE_VIEW_ABI,
          functionName: "getPositionLiquidity",
          args: [poolId as `0x${string}`, postionId as `0x${string}`],
        })) as bigint;

        console.log(
          "Liquidity for tokenId:",
          tokenId,
          "and range:",
          r.lower,
          r.upper,
          "is:",
          liquidity
        );

        totalLiquidity += liquidity;

        r.liquidity = liquidity; // store per-range
        totalLiquidity += liquidity; // aggregate
      }

      let totalAmount0 = 0;
      let totalAmount1 = 0;

      for (const r of ranges) {
        const uniPos = new UniPosition({
          pool,
          tickLower: r.lower,
          tickUpper: r.upper,
          liquidity: r.liquidity.toString(),
        });

        totalAmount0 += parseFloat(uniPos.amount0.toExact());
        totalAmount1 += parseFloat(uniPos.amount1.toExact());
      }

      const priceUsd = await getCurrentPrice(); // USDC per ETH

      if (!priceUsd) {
        throw new Error("Failed to fetch current price");
      }

      const totalValueUsd = totalAmount0 * priceUsd + totalAmount1;

      return {
        tokenId,
        tickLower: ticks[0],
        tickUpper: ticks[ticks.length - 1],
        liquidity: totalLiquidity,
        poolKey,
        amount0: totalAmount0,
        amount1: totalAmount1,
        totalValueUsd,
      };
    } catch (err) {
      console.error(`Error fetching details for position ${tokenId}:`, err);
      throw err;
    }
  };

  const getTickRangeAmounts = async (
    tokenId: bigint,
    tickLower: number,
    tickUpper: number
  ) => {
    const poolId = await getPoolId(tokenId);
    const postionId = await getPositionId(tokenId, tickLower, tickUpper);
    const pool = await getPool(tokenId);

    const liquidity = (await publicClient.readContract({
      address: STATE_VIEW_ADDRESS as `0x${string}`,
      abi: STATE_VIEW_ABI,
      functionName: "getPositionLiquidity",
      args: [poolId as `0x${string}`, postionId as `0x${string}`],
    })) as bigint;

    const position = new UniPosition({
      pool,
      tickLower,
      tickUpper,
      liquidity: liquidity.toString(),
    });

    const amount0 = parseFloat(position.amount0.toExact());
    const amount1 = parseFloat(position.amount1.toExact());

    return {
      amount0,
      amount1,
    };
  };

  async function yogaTokenExists(tokenId: bigint): Promise<boolean> {
    try {
      await publicClient.readContract({
        address: YOGA_POSITION_MANAGER_ADDRESS,
        abi: YOGA_OWNER_OF_ABI, // includes ownerOf
        functionName: "ownerOf",
        args: [tokenId],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetches all positions for a user address.
   * Uses cached "yoga_latest_token_id" to avoid rescanning old NFTs.
   * Always returns the last 2 positions + any newly discovered ones.
   */
  const fetchUserPositions = async (
    userAddress: `0x${string}`
  ): Promise<PositionDetails[]> => {
    try {
      // Load last known tokenId from cache
      let latestTokenId = safeGetItem<number>("yoga_latest_token_id") ?? 1;

      const positions: PositionDetails[] = [];

      const numToFetch = 2;
      const fromToken = Math.max(1, latestTokenId - (numToFetch - 1));

      const recentFetches = await Promise.all(
        [...Array(numToFetch)].map(async (_, i) => {
          const id = latestTokenId - i;
          if (id < 1) return null;

          try {
            return await getPositionDetails(BigInt(id));
          } catch {
            return null;
          }
        })
      );

      for (const p of recentFetches) {
        if (p) positions.push(p);
      }

      let scanId = latestTokenId + 1;

      while (true) {
        try {
          const exists = await yogaTokenExists(BigInt(scanId));
          if (!exists) break;

          const pos = await getPositionDetails(BigInt(scanId));
          if (!pos) break;

          positions.push(pos);

          safeSetItem("yoga_latest_token_id", scanId);

          scanId++;
        } catch {
          break;
        }
      }

      console.log("returned Positions:", positions);

      return positions;
    } catch (err) {
      console.error("Error fetching user positions:", err);
      setError(err as Error);
      return [];
    }
  };

  /**
   * Creates a new sub-position using Yoga contract's modify function
   */
  const createSubPosition = async (params: createSubPosition) => {
    try {
      setError(null);

      const {
        tokenId,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        recipient,
      } = params;

      // 2. Get pool info
      const poolInfo = await getPoolInfo();
      if (!poolInfo) {
        throw new Error("Failed to fetch pool info");
      }

      // 3. Create Pool instance
      const pool = new Pool(
        ETH_NATIVE,
        USDC_TOKEN,
        FEE,
        TICK_SPACING,
        HOOKS,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
      );

      const position = UniPosition.fromAmounts({
        pool,
        tickLower,
        tickUpper,
        amount0: amount0Desired.toString(),
        amount1: amount1Desired.toString(),
        useFullPrecision: false,
      });

      const liquidityDelta = BigInt(position.liquidity.toString());

      // 5. Prepare slippage limits
      const slippageTolerance = 0.5;
      const slippageFactor = 1 + slippageTolerance / 100;

      const currency0Max = BigInt(
        Math.floor(Number(params.amount0Desired) * slippageFactor)
      );
      const currency1Max = BigInt(
        Math.floor(Number(params.amount1Desired) * slippageFactor)
      );

      if (currency1Max > 0) {
        await checkAllowance(YOGA_POSITION_MANAGER_ADDRESS, currency1Max);
      }

      // 6. Prepare SimpleModifyLiquidityParams (positive liquidityDelta for adding)
      const modifyParams = {
        tickLower: tickLower,
        tickUpper: tickUpper,
        liquidityDelta: liquidityDelta, // Positive for adding
      };

      writeContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_MODIFY_POSITION_ABI,
        functionName: "modify",
        args: [
          recipient as `0x${string}`,
          params.tokenId,
          modifyParams,
          currency0Max,
          currency1Max,
        ],
        value: params.amount0Desired, // ETH value for native currency
      });
    } catch (err) {
      console.error("Error adding liquidity:", err);
      setError(err as Error);
      throw err;
    }
  };

  /**
   * Adds liquidity to an existing position using Yoga contract's modify function
   */
  const addLiquidity = async (params: AddLiquidityParams) => {
    try {
      setError(null);

      // 1. Get position details
      const positionDetails = await getPositionDetails(
        params.tokenId,
        params.tickLower,
        params.tickUpper
      );

      // 2. Get pool info
      const poolInfo = await getPoolInfo();
      if (!poolInfo) {
        throw new Error("Failed to fetch pool info");
      }

      // 3. Create Pool instance
      const pool = new Pool(
        ETH_NATIVE,
        USDC_TOKEN,
        FEE,
        TICK_SPACING,
        HOOKS,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
      );

      // 4. Create Position from desired amounts to calculate liquidity to add
      const position = UniPosition.fromAmounts({
        pool,
        tickLower: params.tickLower || positionDetails.tickLower,
        tickUpper: params.tickUpper || positionDetails.tickUpper,
        amount0: params.amount0Desired.toString(),
        amount1: params.amount1Desired.toString(),
        useFullPrecision: false,
      });

      const liquidityDelta = BigInt(position.liquidity.toString());

      // 5. Prepare slippage limits
      const slippageTolerance = params.slippageTolerance || 0.5;
      const slippageFactor = 1 + slippageTolerance / 100;

      const currency0Max = BigInt(
        Math.floor(Number(params.amount0Desired) * slippageFactor)
      );
      const currency1Max = BigInt(
        Math.floor(Number(params.amount1Desired) * slippageFactor)
      );

      // 6. Prepare SimpleModifyLiquidityParams (positive liquidityDelta for adding)
      const modifyParams = {
        tickLower: params.tickLower || positionDetails.tickLower,
        tickUpper: params.tickUpper || positionDetails.tickUpper,
        liquidityDelta: liquidityDelta, // Positive for adding
      };

      // 7. Execute transaction - recipient can be the current owner
      const recipient = await publicClient.readContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [
          {
            name: "ownerOf",
            type: "function",
            inputs: [{ name: "tokenId", type: "uint256" }],
            outputs: [{ name: "", type: "address" }],
          },
        ],
        functionName: "ownerOf",
        args: [params.tokenId],
      });

      writeContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_MODIFY_POSITION_ABI,
        functionName: "modify",
        args: [
          recipient as `0x${string}`,
          params.tokenId,
          modifyParams,
          currency0Max,
          currency1Max,
        ],
        value: params.amount0Desired, // ETH value for native currency
      });
    } catch (err) {
      console.error("Error adding liquidity:", err);
      setError(err as Error);
      throw err;
    } finally {
    }
  };

  /**
   * Removes liquidity from a position using Yoga contract's modify function
   */
  const removeLiquidity = async (params: RemoveLiquidityParams) => {
    try {
      // 1. Get position details
      const positionDetails = await getPositionDetails(
        params.tokenId,
        params.tickLower,
        params.tickUpper
      );

      console.log("Position Details:", positionDetails);

      // 2. Calculate liquidity to remove based on percentage
      const currentLiquidity = positionDetails.liquidity;
      const liquidityToRemove = BigInt(
        Math.floor(
          (Number(currentLiquidity) * params.liquidityPercentage) / 100
        )
      );

      console.log("Current Liquidity:", currentLiquidity);
      console.log("Liquidity To Remove:", liquidityToRemove);

      // 3. Prepare slippage limits (for removing, we set minimums)
      const slippageTolerance = params.slippageTolerance || 0.5;

      // For removing liquidity, we expect to receive tokens back
      // So currency0Max and currency1Max act as minimum amounts we're willing to accept
      // Set them to 0 to accept any amount (or calculate from current position value)
      const currency0Max = BigInt(0);
      const currency1Max = BigInt(0);

      // 4. Prepare SimpleModifyLiquidityParams (negative liquidityDelta for removing)
      const modifyParams = {
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        liquidityDelta: liquidityToRemove, // Negative for removing
      };

      console.log("Modify Params:", modifyParams);

      // 5. Get recipient address (current owner)
      const recipient = await publicClient.readContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_OWNER_OF_ABI,
        functionName: "ownerOf",
        args: [params.tokenId],
      });

      // 6. Execute transaction
      writeContract({
        address: YOGA_POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: YOGA_MODIFY_POSITION_ABI,
        functionName: "modify",
        args: [
          recipient as `0x${string}`,
          params.tokenId,
          modifyParams,
          currency0Max,
          currency1Max,
        ],
        value: BigInt(0), // No ETH needed for removing liquidity
      });
    } catch (err) {
      console.error("Error removing liquidity:", err);
      setError(err as Error);
      throw err;
    }
  };

  const value: UniswapContextType = {
    getPoolInfo,
    getTickRangeAmounts,
    getCurrentPrice,
    priceToTick: priceToTickFn,
    tickToPrice: tickToPriceFn,
    checkAllowance,
    approveAllowance,
    getTicks,
    mintPosition,
    addLiquidity,
    removeLiquidity,
    createSubPosition,
    fetchUserPositions,
    isConfirming,
    isConfirmed,
    transactionHash: hash,
    error: error || writeError,
  };

  return (
    <UniswapContext.Provider value={value}>{children}</UniswapContext.Provider>
  );
}

export function useUniswap() {
  const context = useContext(UniswapContext);
  if (context === undefined) {
    throw new Error("useUniswap must be used within a UniswapProvider");
  }
  return context;
}

// Helper function to create position parameters with full range
export function createFullRangeParams(
  amountA: number,
  amountB: number,
  recipient: `0x${string}`
): MintPositionParams {
  const MIN_TICK = -887272;
  const MAX_TICK = 887272;

  const tickLower = nearestUsableTick(MIN_TICK, TICK_SPACING);
  const tickUpper = nearestUsableTick(MAX_TICK, TICK_SPACING);

  const amount0Desired = BigInt(
    Math.floor(amountA * 10 ** ETH_NATIVE.decimals)
  );
  const amount1Desired = BigInt(
    Math.floor(amountB * 10 ** USDC_TOKEN.decimals)
  );

  return {
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    recipient,
  };
}

// Helper function to create position parameters with tick range
export function createRangeParams(
  amountA: number,
  amountB: number,
  tickRange: number,
  currentTick: number,
  recipient: `0x${string}`
): MintPositionParams {
  const tickLower = nearestUsableTick(currentTick - tickRange, TICK_SPACING);
  const tickUpper = nearestUsableTick(currentTick + tickRange, TICK_SPACING);

  const amount0Desired = BigInt(
    Math.floor(amountA * 10 ** ETH_NATIVE.decimals)
  );
  const amount1Desired = BigInt(
    Math.floor(amountB * 10 ** USDC_TOKEN.decimals)
  );

  return {
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    recipient,
  };
}
