"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { createPublicClient, http } from "viem";
import { unichain } from "viem/chains";
import { Token, ChainId, Ether, Percent, Price } from "@uniswap/sdk-core";
import {
  Pool,
  Position,
  V4PositionManager,
  priceToClosestTick,
  tickToPrice,
} from "@uniswap/v4-sdk";
import { nearestUsableTick } from "@uniswap/v3-sdk";
import { STATE_VIEW_ABI } from "../config/abis";

// Uniswap V4 contract addresses
const STATE_VIEW_ADDRESS = "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2";
const POSITION_MANAGER_ADDRESS = "0x4529a01c7a0410167c5740c487a8de60232617bf";

// Constants
const ETH_NATIVE = Ether.onChain(ChainId.UNICHAIN);
const CHAIN_ID = ChainId.UNICHAIN;
const UNICHAIN_SUBGRAPH_URL =
  "https://gateway.thegraph.com/api/subgraphs/id/EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH";

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

export interface PoolInfo {
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
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
  slippageTolerance?: number;
  deadline?: number;
}

export interface RemoveLiquidityParams {
  tokenId: bigint;
  liquidityPercentage: number;
  slippageTolerance?: number;
  deadline?: number;
  burnToken?: boolean;
}

interface SubgraphPosition {
  id: string;
  tokenId: string;
  owner: string;
}

interface UniswapContextType {
  getPoolInfo: () => Promise<PoolInfo | null>;
  getCurrentPrice: () => Promise<number | null>;
  priceToTick: (price: number) => number;
  tickToPrice: (tick: number) => number;
  mintPosition: (params: MintPositionParams) => Promise<void>;
  addLiquidity: (params: AddLiquidityParams) => Promise<void>;
  removeLiquidity: (params: RemoveLiquidityParams) => Promise<void>;
  collectFees: (tokenId: bigint, recipient: string) => Promise<void>;
  fetchUserPositions: (
    userAddress: `0x${string}`
  ) => Promise<PositionDetails[]>;
  isMinting: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  transactionHash?: `0x${string}`;
  error: Error | null;
}

const UniswapContext = createContext<UniswapContextType | undefined>(undefined);

export function UniswapProvider({ children }: { children: ReactNode }) {
  const [isMinting, setIsMinting] = useState(false);
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

      console.log("Pool Info:", {
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick,
        protocolFee,
        lpFee,
        liquidity: liquidityData.toString(),
      });

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

  /**
   * Mints a new liquidity position using the Uniswap v4 SDK
   */
  const mintPosition = async (params: MintPositionParams) => {
    try {
      setIsMinting(true);
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

      // 3. Create Position from desired amounts
      const position = Position.fromAmounts({
        pool,
        tickLower: nearestUsableTick(params.tickLower, TICK_SPACING),
        tickUpper: nearestUsableTick(params.tickUpper, TICK_SPACING),
        amount0: params.amount0Desired.toString(),
        amount1: params.amount1Desired.toString(),
        useFullPrecision: true,
      });

      console.log("Position created:", {
        liquidity: position.liquidity.toString(),
        amount0: position.amount0.toExact(),
        amount1: position.amount1.toExact(),
      });

      // 4. Prepare MintOptions
      const slippageTolerance = params.slippageTolerance || 0.5; // 0.5% default
      const slippagePct = new Percent(
        Math.floor(slippageTolerance * 100),
        10_000
      );

      const deadlineSeconds = params.deadline || 20 * 60; // 20 minutes default
      const currentBlock = await publicClient.getBlock();
      const currentBlockTimestamp = Number(currentBlock.timestamp);
      const deadline = currentBlockTimestamp + deadlineSeconds;

      const mintOptions = {
        recipient: params.recipient,
        slippageTolerance: slippagePct,
        deadline: deadline.toString(),
        useNative: USDC_TOKEN.isNative
          ? Ether.onChain(USDC_TOKEN.chainId)
          : ETH_NATIVE,
        hookData: "0x",
      };

      //Now I need tick lower, tick upper, and liquidity to add

      console.log("mintOptions:", mintOptions);

      // 5. Generate transaction calldata using SDK
      const { calldata, value } = V4PositionManager.addCallParameters(
        position,
        mintOptions
      );

      console.log("Transaction data:", {
        calldata,
        value,
        to: POSITION_MANAGER_ADDRESS,
      });

      // 6. Execute transaction
      writeContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "bytes[]", name: "data", type: "bytes[]" },
            ],
            name: "multicall",
            outputs: [
              { internalType: "bytes[]", name: "results", type: "bytes[]" },
            ],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "multicall",
        args: [[calldata as `0x${string}`]],
        value: BigInt(value),
      });
    } catch (err) {
      console.error("Error minting position:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsMinting(false);
    }
  };

  /**
   * Helper function to decode packed position info
   */
  const decodePositionInfo = (value: bigint) => {
    return {
      getTickUpper: () => {
        const raw = Number((value >> BigInt(32)) & BigInt(0xffffff));
        return raw >= 0x800000 ? raw - 0x1000000 : raw;
      },
      getTickLower: () => {
        const raw = Number((value >> BigInt(8)) & BigInt(0xffffff));
        return raw >= 0x800000 ? raw - 0x1000000 : raw;
      },
      hasSubscriber: () => (value & BigInt(0xff)) !== BigInt(0),
    };
  };

  /**
   * Fetches position IDs from the subgraph for a given owner
   */
  const getPositionIds = async (owner: `0x${string}`): Promise<bigint[]> => {
    const GET_POSITIONS_QUERY = `
      query GetPositions($owner: String!) {
        positions(where: { owner: $owner }) {
          tokenId
          owner
          id
        }
      }
    `;

    try {
      const headers = {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY}`,
      };

      const response = await fetch(UNICHAIN_SUBGRAPH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: GET_POSITIONS_QUERY,
          variables: { owner: owner.toLowerCase() },
        }),
      });

      const data = await response.json();

      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const positions = data.data.positions as SubgraphPosition[];
      return positions.map((p) => BigInt(p.tokenId));
    } catch (err) {
      console.error("Error fetching position IDs:", err);
      throw err;
    }
  };

  /**
   * Fetches details for a specific position
   */
  const getPositionDetails = async (
    tokenId: bigint
  ): Promise<PositionDetails> => {
    const POSITION_MANAGER_ABI = [
      {
        name: "getPoolAndPositionInfo",
        type: "function",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "info", type: "uint256" },
        ],
      },
      {
        name: "getPositionLiquidity",
        type: "function",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "liquidity", type: "uint128" }],
      },
    ] as const;

    try {
      // Get pool key and packed position info
      const [poolKey, infoValue] = (await publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: POSITION_MANAGER_ABI,
        functionName: "getPoolAndPositionInfo",
        args: [tokenId],
      })) as readonly [
        {
          currency0: `0x${string}`;
          currency1: `0x${string}`;
          fee: number;
          tickSpacing: number;
          hooks: `0x${string}`;
        },
        bigint
      ];

      // Get current liquidity
      const liquidity = (await publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: POSITION_MANAGER_ABI,
        functionName: "getPositionLiquidity",
        args: [tokenId],
      })) as bigint;

      // Decode packed position info
      const positionInfo = decodePositionInfo(infoValue);

      // Fetch pool info to compute actual token balances
      const poolInfo = await getPoolInfo();
      if (!poolInfo) {
        throw new Error("Failed to fetch pool info");
      }
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

      const position = new Position({
        pool,
        tickLower: positionInfo.getTickLower(),
        tickUpper: positionInfo.getTickUpper(),
        liquidity: liquidity.toString(),
      });

      const amount0 = parseFloat(position.amount0.toExact());
      const amount1 = parseFloat(position.amount1.toExact());

      const priceUsd = await getCurrentPrice(); // USDC per ETH

      if (!priceUsd) {
        throw new Error("Failed to fetch current price");
      }

      const totalValueUsd = amount0 * priceUsd + amount1;

      return {
        tokenId,
        tickLower: positionInfo.getTickLower(),
        tickUpper: positionInfo.getTickUpper(),
        liquidity,
        poolKey,
        amount0,
        amount1,
        totalValueUsd,
      };
    } catch (err) {
      console.error(`Error fetching details for position ${tokenId}:`, err);
      throw err;
    }
  };

  /**
   * Fetches all positions for a user address
   */
  const fetchUserPositions = async (
    userAddress: `0x${string}`
  ): Promise<PositionDetails[]> => {
    try {
      // Get position IDs from subgraph
      const tokenIds = await getPositionIds(userAddress);
      console.log(`Found ${tokenIds.length} positions for ${userAddress}`);

      // Fetch details for each position
      const positions = await Promise.all(
        tokenIds.map((tokenId) => getPositionDetails(tokenId))
      );

      // Log position details
      positions.forEach((position) => {
        console.log(`Position ${position.tokenId}:`);
        console.log(`  Token0: ${position.poolKey.currency0}`);
        console.log(`  Token1: ${position.poolKey.currency1}`);
        console.log(`  Fee: ${position.poolKey.fee / 10000}%`);
        console.log(`  Range: ${position.tickLower} to ${position.tickUpper}`);
        console.log(`  Liquidity: ${position.liquidity.toString()}`);
        console.log(`  Hooks: ${position.poolKey.hooks}`);
        console.log("---");
      });

      return positions;
    } catch (err) {
      console.error("Error fetching user positions:", err);
      setError(err as Error);
      return [];
    }
  };

  /**
   * Adds liquidity to an existing position
   */
  const addLiquidity = async (params: AddLiquidityParams) => {
    try {
      setIsMinting(true);
      setError(null);

      // 1. Get position details
      const positionDetails = await getPositionDetails(params.tokenId);

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

      // 4. Create Position from desired amounts
      const position = Position.fromAmounts({
        pool,
        tickLower: positionDetails.tickLower,
        tickUpper: positionDetails.tickUpper,
        amount0: params.amount0Desired.toString(),
        amount1: params.amount1Desired.toString(),
        useFullPrecision: true,
      });

      // 5. Prepare options
      const slippageTolerance = params.slippageTolerance || 0.5;
      const slippagePct = new Percent(
        Math.floor(slippageTolerance * 100),
        10_000
      );

      const deadlineSeconds = params.deadline || 20 * 60;
      const currentBlock = await publicClient.getBlock();
      const currentBlockTimestamp = Number(currentBlock.timestamp);
      const deadline = currentBlockTimestamp + deadlineSeconds;

      const addOptions = {
        slippageTolerance: slippagePct,
        deadline: deadline.toString(),
        tokenId: params.tokenId.toString(),
        useNative: ETH_NATIVE,
        hookData: "0x",
      };

      // 6. Generate transaction calldata
      const { calldata, value } = V4PositionManager.addCallParameters(
        position,
        addOptions
      );

      console.log("Add liquidity transaction:", { calldata, value });

      // 7. Execute transaction
      writeContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "bytes[]", name: "data", type: "bytes[]" },
            ],
            name: "multicall",
            outputs: [
              { internalType: "bytes[]", name: "results", type: "bytes[]" },
            ],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "multicall",
        args: [[calldata as `0x${string}`]],
        value: BigInt(value),
      });
    } catch (err) {
      console.error("Error adding liquidity:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsMinting(false);
    }
  };

  /**
   * Removes liquidity from a position
   */
  const removeLiquidity = async (params: RemoveLiquidityParams) => {
    try {
      setIsMinting(true);
      setError(null);

      // 1. Get position details
      const positionDetails = await getPositionDetails(params.tokenId);

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

      // 4. Create Position instance with current liquidity
      const position = new Position({
        pool,
        tickLower: positionDetails.tickLower,
        tickUpper: positionDetails.tickUpper,
        liquidity: positionDetails.liquidity.toString(),
      });

      // 5. Prepare options
      const slippageTolerance = params.slippageTolerance || 0.5;
      const slippagePct = new Percent(
        Math.floor(slippageTolerance * 100),
        10_000
      );

      const deadlineSeconds = params.deadline || 20 * 60;
      const currentBlock = await publicClient.getBlock();
      const currentBlockTimestamp = Number(currentBlock.timestamp);
      const deadline = currentBlockTimestamp + deadlineSeconds;

      const liquidityPercentage = new Percent(
        Math.floor(params.liquidityPercentage * 100),
        100
      );

      const removeOptions = {
        slippageTolerance: slippagePct,
        deadline: deadline.toString(),
        tokenId: params.tokenId.toString(),
        liquidityPercentage,
        burnToken: params.burnToken || false,
        hookData: "0x",
      };

      // 6. Generate transaction calldata
      const { calldata, value } = V4PositionManager.removeCallParameters(
        position,
        removeOptions
      );

      console.log("Remove liquidity transaction:", { calldata, value });

      // 7. Execute transaction
      writeContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "bytes[]", name: "data", type: "bytes[]" },
            ],
            name: "multicall",
            outputs: [
              { internalType: "bytes[]", name: "results", type: "bytes[]" },
            ],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "multicall",
        args: [[calldata as `0x${string}`]],
        value: BigInt(value),
      });
    } catch (err) {
      console.error("Error removing liquidity:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsMinting(false);
    }
  };

  /**
   * Collects fees from a position
   */
  const collectFees = async (tokenId: bigint, recipient: string) => {
    try {
      setIsMinting(true);
      setError(null);

      // Get position details to create proper Position instance
      const positionDetails = await getPositionDetails(tokenId);
      const poolInfo = await getPoolInfo();
      if (!poolInfo) {
        throw new Error("Failed to fetch pool info");
      }

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

      const position = new Position({
        pool,
        tickLower: positionDetails.tickLower,
        tickUpper: positionDetails.tickUpper,
        liquidity: positionDetails.liquidity.toString(),
      });

      const currentBlock = await publicClient.getBlock();
      const deadline = Number(currentBlock.timestamp) + 20 * 60;

      const collectOptions = {
        tokenId: tokenId.toString(),
        slippageTolerance: new Percent(0, 10_000), // 0% for fee collection
        deadline: deadline.toString(),
        hookData: "0x",
        recipient: recipient,
      };

      const { calldata, value } = V4PositionManager.collectCallParameters(
        position,
        collectOptions
      );

      console.log("Collect fees transaction:", { calldata, value });

      writeContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "bytes[]", name: "data", type: "bytes[]" },
            ],
            name: "multicall",
            outputs: [
              { internalType: "bytes[]", name: "results", type: "bytes[]" },
            ],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "multicall",
        args: [[calldata as `0x${string}`]],
        value: BigInt(value),
      });
    } catch (err) {
      console.error("Error collecting fees:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsMinting(false);
    }
  };

  const value: UniswapContextType = {
    getPoolInfo,
    getCurrentPrice,
    priceToTick: priceToTickFn,
    tickToPrice: tickToPriceFn,
    mintPosition,
    addLiquidity,
    removeLiquidity,
    collectFees,
    fetchUserPositions,
    isMinting,
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
