"use client";

import { useState, useEffect } from "react";
import { useAccount, useBalance } from "wagmi";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUniswap } from "@/providers/UniswapProvider";
import type {
  MintPositionParams,
  PositionDetails,
} from "@/providers/UniswapProvider";
import { MultiRangePriceSelector } from "@/components/MultiRangePriceSelector";
import ethLogo from "cryptocurrency-icons/svg/color/eth.svg";
import usdcLogo from "cryptocurrency-icons/svg/color/usdc.svg";
import { Pool, Position } from "@uniswap/v4-sdk";
import { Token, Ether, ChainId, CurrencyAmount } from "@uniswap/sdk-core";
import DepositTokens from "@/components/DepositTokens";
import { PositionType } from "@/lib/types";
import { getPositionType } from "@/lib/utils";

// Token constants
const ETH_NATIVE = Ether.onChain(ChainId.UNICHAIN);
const USDC_TOKEN = new Token(
  ChainId.UNICHAIN,
  "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  6,
  "USDC",
  "USDC"
);
const FEE = 500;
const TICK_SPACING = 10;
const HOOKS = "0x0000000000000000000000000000000000000000";

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const {
    mintPosition,
    getCurrentPrice,
    priceToTick,
    tickToPrice,
    getPoolInfo,
    fetchUserPositions,
    isMinting,
    isConfirming,
    isConfirmed,
    transactionHash,
    error,
  } = useUniswap();

  // Sub-position type
  interface Position {
    id: string;
    minPrice: number;
    maxPrice: number;
    amount0: string;
    amount1: string;
    lastInputToken: "eth" | "usdc" | null;
  }

  // Price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>({
    id: "1",
    minPrice: 2000,
    maxPrice: 3500,
    amount0: "",
    amount1: "",
    lastInputToken: null,
  });

  // Positions state
  const [positions, setPositions] = useState<PositionDetails[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);

  // Fetch current price on mount
  useEffect(() => {
    getCurrentPrice().then((price) => {
      if (price) {
        setCurrentPrice(price);
        // Set default range to +/- 25% from current price
        setPosition({
          id: "1",
          minPrice: price * 0.75,
          maxPrice: price * 1.25,
          amount0: "",
          amount1: "",
          lastInputToken: null,
        });
      }
    });
  }, [getCurrentPrice]);

  // Fetch positions on mount and when address changes
  useEffect(() => {
    if (address) {
      setIsLoadingPositions(true);
      fetchUserPositions(address)
        .then((fetchedPositions) => {
          // Filter out closed positions (liquidity === 0)
          const openPositions = fetchedPositions.filter(
            (position) => position.liquidity > BigInt(0)
          );
          setPositions(openPositions);
        })
        .finally(() => {
          setIsLoadingPositions(false);
        });
    }
  }, [address, fetchUserPositions]);

  // Refresh positions when a new position is created
  useEffect(() => {
    if (isConfirmed && address) {
      // Wait a bit for the subgraph to index the new position
      setTimeout(() => {
        fetchUserPositions(address).then((fetchedPositions) => {
          const openPositions = fetchedPositions.filter(
            (position) => position.liquidity > BigInt(0)
          );
          console.log("openPositions", openPositions);
          setPositions(openPositions);
        });
      }, 2000);
    }
  }, [isConfirmed, address, fetchUserPositions]);

  const handleCreatePosition = () => {
    if (!address || !position) return;

    // Convert prices to ticks
    const tickLower = priceToTick(position.minPrice);
    const tickUpper = priceToTick(position.maxPrice);

    mintPosition({
      tickLower,
      tickUpper,
      amount0Desired: BigInt(
        Math.floor(parseFloat(position.amount0 || "0") * 1e18)
      ),
      amount1Desired: BigInt(
        Math.floor(parseFloat(position.amount1 || "0") * 1e6)
      ),
      recipient: address,
    });
  };

  const handlePositionClick = (tokenId: bigint) => {
    router.push(`/position/${tokenId}`);
  };

  // // Add a new sub-position by splitting the last position in half
  // const handleAddSubPosition = () => {
  //   if (!currentPrice || !position) return;

  //   // Get the last position to split
  //   const lastPos = subPositions[subPositions.length - 1];
  //   const midPrice = (lastPos.minPrice + lastPos.maxPrice) / 2;

  //   // Update the last position to end at midpoint
  //   const updatedLastPos: SubPosition = {
  //     ...lastPos,
  //     maxPrice: midPrice,
  //     amount0: "",
  //     amount1: "",
  //     lastInputToken: null,
  //   };

  //   // Create new position from midpoint to the original max
  //   const newId = (subPositions.length + 1).toString();
  //   const newSubPosition: SubPosition = {
  //     id: newId,
  //     minPrice: midPrice,
  //     maxPrice: lastPos.maxPrice,
  //     amount0: "",
  //     amount1: "",
  //     lastInputToken: null,
  //   };

  //   // Update state with modified last position and new position
  //   setSubPositions([
  //     ...subPositions.slice(0, -1),
  //     updatedLastPos,
  //     newSubPosition,
  //   ]);
  // };

  // Remove a sub-position and merge with adjacent position
  // const handleRemoveSubPosition = (id: string) => {
  //   if (subPositions.length === 1) return; // Don't remove the last one

  //   const posIdx = subPositions.findIndex((sp) => sp.id === id);
  //   if (posIdx === -1) return;

  //   // If removing the last position, extend the previous position to cover its range
  //   if (posIdx === subPositions.length - 1) {
  //     const prevPos = subPositions[posIdx - 1];
  //     const removedPos = subPositions[posIdx];

  //     const extendedPrevPos: SubPosition = {
  //       ...prevPos,
  //       maxPrice: removedPos.maxPrice,
  //       amount0: "",
  //       amount1: "",
  //       lastInputToken: null,
  //     };

  //     setSubPositions([...subPositions.slice(0, posIdx - 1), extendedPrevPos]);
  //   } else {
  //     // Otherwise, extend the next position to cover the removed position's range
  //     const removedPos = subPositions[posIdx];
  //     const nextPos = subPositions[posIdx + 1];

  //     const extendedNextPos: SubPosition = {
  //       ...nextPos,
  //       minPrice: removedPos.minPrice,
  //       amount0: "",
  //       amount1: "",
  //       lastInputToken: null,
  //     };

  //     setSubPositions([
  //       ...subPositions.slice(0, posIdx),
  //       extendedNextPos,
  //       ...subPositions.slice(posIdx + 2),
  //     ]);
  //   }
  // };

  // // Update sub-position range
  // const updateSubPositionRange = (
  //   id: string,
  //   minPrice: number,
  //   maxPrice: number
  // ) => {
  //   setSubPositions((prevPositions) =>
  //     prevPositions.map((sp) =>
  //       sp.id === id ? { ...sp, minPrice, maxPrice } : sp
  //     )
  //   );
  // };

  // Bulk update multiple sub-position ranges atomically
  // const bulkUpdateSubPositionRanges = (
  //   updates: Array<{ id: string; minPrice: number; maxPrice: number }>
  // ) => {
  //   setSubPositions((prevPositions) =>
  //     prevPositions.map((sp) => {
  //       const update = updates.find((u) => u.id === sp.id);
  //       return update
  //         ? { ...sp, minPrice: update.minPrice, maxPrice: update.maxPrice }
  //         : sp;
  //     })
  //   );
  // };

  // Auto-calculate corresponding token amount using Position SDK
  const handleAmount0Change = async (value: string) => {
    // Update the position with new amount0 and mark ETH as last input
    setPosition((prevPosition) => ({
      ...prevPosition,
      amount0: value,
      lastInputToken: "eth" as const,
    }));

    if (!position || !value || !currentPrice) {
      setPosition((prevPosition) => ({ ...prevPosition, amount1: "" }));
      return;
    }

    const positionType = getPositionType(
      position.minPrice,
      position.maxPrice,
      currentPrice
    );
    if (positionType === PositionType.ONLY_ETH) {
      // Single-sided ETH only
      setPosition((prevPosition) => ({ ...prevPosition, amount1: "" }));
      return;
    }

    if (positionType === "only-usdc") {
      // Single-sided USDC only - shouldn't provide ETH
      setPosition((prevPosition) => ({ ...prevPosition, amount0: "" }));
      return;
    }

    try {
      // Get pool info to create Position
      const poolInfo = await getPoolInfo();
      if (!poolInfo) return;

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

      const tickLower = priceToTick(position.minPrice);
      const tickUpper = priceToTick(position.maxPrice);

      // Create position from ETH amount to calculate required USDC
      const ethAmount = CurrencyAmount.fromRawAmount(
        ETH_NATIVE,
        Math.floor(parseFloat(value) * 10 ** 18)
      );

      const newPosition = Position.fromAmount0({
        pool,
        tickLower,
        tickUpper,
        amount0: ethAmount.quotient,
        useFullPrecision: true,
      });

      const usdcAmount = parseFloat(newPosition.amount1.toSignificant(6));
      setPosition((prevPosition) => ({
        ...prevPosition,
        amount1: usdcAmount.toFixed(2),
      }));
    } catch (err) {
      console.error("Error calculating amount1:", err);
    }
  };

  const handleAmount1Change = async (value: string) => {
    // Update the sub-position with new amount1 and mark USDC as last input
    setPosition((prevPosition) => ({
      ...prevPosition,
      amount1: value,
      lastInputToken: "usdc" as const,
    }));

    if (!position || !value || !currentPrice) {
      setPosition((prevPosition) => ({ ...prevPosition, amount0: "" }));
      return;
    }

    const positionType = getPositionType(
      position.minPrice,
      position.maxPrice,
      currentPrice
    );
    if (positionType === PositionType.ONLY_USDC) {
      // Single-sided USDC only
      setPosition((prevPosition) => ({ ...prevPosition, amount0: "" }));
      return;
    }

    if (positionType === "only-eth") {
      // Single-sided ETH only - shouldn't provide USDC
      setPosition((prevPosition) => ({ ...prevPosition, amount1: "" }));
      return;
    }

    try {
      // Get pool info to create Position
      const poolInfo = await getPoolInfo();
      if (!poolInfo) return;

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

      const tickLower = priceToTick(position.minPrice);
      const tickUpper = priceToTick(position.maxPrice);

      // Create position from USDC amount to calculate required ETH
      const usdcAmount = CurrencyAmount.fromRawAmount(
        USDC_TOKEN,
        Math.floor(parseFloat(value) * 10 ** 6)
      );

      const newPosition = Position.fromAmount1({
        pool,
        tickLower,
        tickUpper,
        amount1: usdcAmount.quotient,
      });

      const ethAmount = parseFloat(newPosition.amount0.toSignificant(6));
      setPosition((prevPosition) => ({
        ...prevPosition,
        amount0: ethAmount.toFixed(6),
      }));
    } catch (err) {
      console.error("Error calculating amount0:", err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center font-sans">
      {/* Main Content */}
      {isConnected && (
        <div className="w-2xl mx-auto">
          {/* Position Management Card */}
          <Card>
            <CardHeader>
              <CardTitle>Create a new position</CardTitle>
              <CardDescription>
                Create a new position by providing the following details:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Token Pair Display */}
              <div className="flex items-center gap-16 justify-center pb-4 border-b">
                <div>
                  <img width={48} height={48} src={ethLogo} alt="ETH" />
                  <p className="text-lg text-muted-foreground text-center">
                    ETH
                  </p>
                </div>
                <div>
                  <img width={48} height={48} src={usdcLogo} alt="USDC" />
                  <p className="text-lg text-muted-foreground text-center">
                    USDC
                  </p>
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground">
                Fee tier: 0.05%
              </div>

              {/* Position Parameters Form */}
              <div className="grid gap-4">
                {/* Price Range Selector */}
                {currentPrice && (
                  <MultiRangePriceSelector
                    currentPrice={currentPrice}
                    subPositions={[position]}
                    onRangeChange={(id, minPrice, maxPrice) => {
                      setPosition((prevPosition) => ({
                        ...prevPosition,
                        minPrice,
                        maxPrice,
                      }));
                    }}
                    onBulkRangeChange={() => {}}
                    onAddSubPosition={() => {}}
                    onRemoveSubPosition={() => {}}
                    handleAutoRebalance={(id) => {
                      // Recalculate based on the last input token (the anchor)
                      if (
                        position.lastInputToken === "eth" &&
                        position.amount0
                      ) {
                        // ETH is anchored, recalculate USDC
                        handleAmount0Change(position.amount0);
                      } else if (
                        position.lastInputToken === "usdc" &&
                        position.amount1
                      ) {
                        // USDC is anchored, recalculate ETH
                        handleAmount1Change(position.amount1);
                      } else if (position.amount0) {
                        // No anchor set, default to ETH
                        handleAmount0Change(position.amount0);
                      }
                    }}
                    tokenSymbol="ETH/USDC"
                  />
                )}

                <DepositTokens
                  positionType={getPositionType(
                    position.minPrice,
                    position.maxPrice,
                    currentPrice ?? 0
                  )}
                  handleAmount0Change={handleAmount0Change}
                  handleAmount1Change={handleAmount1Change}
                  amount0={position.amount0}
                  amount1={position.amount1}
                  currentPrice={currentPrice ?? 0}
                />

                <Button
                  onClick={handleCreatePosition}
                  disabled={!address || isMinting || isConfirming}
                  className="w-full"
                >
                  {isMinting
                    ? "Creating Position..."
                    : isConfirming
                    ? "Confirming..."
                    : "Create Position"}
                </Button>

                {/* Transaction Status */}
                {error && (
                  <div className="p-4 bg-destructive/10 border border-destructive rounded-md overflow-auto">
                    <p className="text-sm text-destructive font-medium">
                      Error: {error.name}
                    </p>
                  </div>
                )}

                {isConfirmed && transactionHash && (
                  <div className="p-4 bg-success/10 border border-success rounded-md">
                    <p className="text-sm text-success font-medium">
                      Position created successfully!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 break-all">
                      Transaction: {transactionHash}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Open Positions Section */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">Open Positions</h2>

            {isLoadingPositions ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    Loading positions...
                  </p>
                </CardContent>
              </Card>
            ) : positions.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    No open positions found
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {positions.map((position) => (
                  <Card
                    key={position.tokenId.toString()}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handlePositionClick(position.tokenId)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Token pair icons */}
                          <div className="flex items-center -space-x-2">
                            <img
                              width={40}
                              height={40}
                              src={ethLogo}
                              alt="ETH"
                              className="rounded-full border-2 border-background"
                            />
                            <img
                              width={40}
                              height={40}
                              src={usdcLogo}
                              alt="USDC"
                              className="rounded-full border-2 border-background"
                            />
                          </div>

                          <div>
                            <h3 className="font-semibold text-lg">
                              ETH / USDC
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Token ID: {position.tokenId.toString()}
                            </p>
                          </div>
                        </div>

                        <div className="text-right space-y-1">
                          <div className="text-sm text-muted-foreground">
                            Fee: {position.poolKey.fee / 10000}%
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Range: {position.tickLower} to {position.tickUpper}
                          </div>
                          <div className="text-sm font-medium">
                            Liquidity: {position.liquidity.toString()}
                          </div>
                          <div className="text-sm font-medium">
                            Position Size: $
                            {position.totalValueUsd.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
