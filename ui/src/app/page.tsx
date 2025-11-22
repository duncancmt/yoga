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
  interface SubPosition {
    id: string;
    minPrice: number;
    maxPrice: number;
    amount0: string;
    amount1: string;
    lastInputToken: "eth" | "usdc" | null;
  }

  // Price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [subPositions, setSubPositions] = useState<SubPosition[]>([
    {
      id: "1",
      minPrice: 2000,
      maxPrice: 3500,
      amount0: "",
      amount1: "",
      lastInputToken: null,
    },
  ]);

  // Fetch wallet balances
  const { data: ethBalance } = useBalance({
    address: address,
  });

  const { data: usdcBalance } = useBalance({
    address: address,
    token: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as `0x${string}`, // USDC on Unichain
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
        setSubPositions([
          {
            id: "1",
            minPrice: price * 0.75,
            maxPrice: price * 1.25,
            amount0: "",
            amount1: "",
            lastInputToken: null,
          },
        ]);
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
    if (!address || subPositions.length === 0) return;

    // For now, create position with the first sub-position
    // TODO: Support creating multiple positions
    const firstSubPos = subPositions[0];

    // Convert prices to ticks
    const tickLower = priceToTick(firstSubPos.minPrice);
    const tickUpper = priceToTick(firstSubPos.maxPrice);

    mintPosition({
      tickLower,
      tickUpper,
      amount0Desired: BigInt(
        Math.floor(parseFloat(firstSubPos.amount0 || "0") * 1e18)
      ),
      amount1Desired: BigInt(
        Math.floor(parseFloat(firstSubPos.amount1 || "0") * 1e6)
      ),
      recipient: address,
    });
  };

  const handlePositionClick = (tokenId: bigint) => {
    router.push(`/position/${tokenId}`);
  };

  // Add a new sub-position by splitting the last position in half
  const handleAddSubPosition = () => {
    if (!currentPrice || subPositions.length === 0) return;

    // Get the last position to split
    const lastPos = subPositions[subPositions.length - 1];
    const midPrice = (lastPos.minPrice + lastPos.maxPrice) / 2;

    // Update the last position to end at midpoint
    const updatedLastPos: SubPosition = {
      ...lastPos,
      maxPrice: midPrice,
      amount0: "",
      amount1: "",
      lastInputToken: null,
    };

    // Create new position from midpoint to the original max
    const newId = (subPositions.length + 1).toString();
    const newSubPosition: SubPosition = {
      id: newId,
      minPrice: midPrice,
      maxPrice: lastPos.maxPrice,
      amount0: "",
      amount1: "",
      lastInputToken: null,
    };

    // Update state with modified last position and new position
    setSubPositions([
      ...subPositions.slice(0, -1),
      updatedLastPos,
      newSubPosition,
    ]);
  };

  // Remove a sub-position and merge with adjacent position
  const handleRemoveSubPosition = (id: string) => {
    if (subPositions.length === 1) return; // Don't remove the last one

    const posIdx = subPositions.findIndex((sp) => sp.id === id);
    if (posIdx === -1) return;

    // If removing the last position, extend the previous position to cover its range
    if (posIdx === subPositions.length - 1) {
      const prevPos = subPositions[posIdx - 1];
      const removedPos = subPositions[posIdx];

      const extendedPrevPos: SubPosition = {
        ...prevPos,
        maxPrice: removedPos.maxPrice,
        amount0: "",
        amount1: "",
        lastInputToken: null,
      };

      setSubPositions([
        ...subPositions.slice(0, posIdx - 1),
        extendedPrevPos,
      ]);
    } else {
      // Otherwise, extend the next position to cover the removed position's range
      const removedPos = subPositions[posIdx];
      const nextPos = subPositions[posIdx + 1];

      const extendedNextPos: SubPosition = {
        ...nextPos,
        minPrice: removedPos.minPrice,
        amount0: "",
        amount1: "",
        lastInputToken: null,
      };

      setSubPositions([
        ...subPositions.slice(0, posIdx),
        extendedNextPos,
        ...subPositions.slice(posIdx + 2),
      ]);
    }
  };

  // Update sub-position range
  const updateSubPositionRange = (
    id: string,
    minPrice: number,
    maxPrice: number
  ) => {
    setSubPositions((prevPositions) =>
      prevPositions.map((sp) =>
        sp.id === id ? { ...sp, minPrice, maxPrice } : sp
      )
    );
  };

  // Bulk update multiple sub-position ranges atomically
  const bulkUpdateSubPositionRanges = (
    updates: Array<{ id: string; minPrice: number; maxPrice: number }>
  ) => {
    setSubPositions((prevPositions) =>
      prevPositions.map((sp) => {
        const update = updates.find((u) => u.id === sp.id);
        return update
          ? { ...sp, minPrice: update.minPrice, maxPrice: update.maxPrice }
          : sp;
      })
    );
  };

  // Calculate position type based on current price and range
  const getPositionType = (
    minPrice: number,
    maxPrice: number
  ): "both" | "only-eth" | "only-usdc" | "unknown" => {
    if (!currentPrice || !minPrice || !maxPrice) return "unknown";

    if (minPrice > currentPrice) {
      // Entire range above current price - only ETH needed
      return "only-eth";
    } else if (maxPrice < currentPrice) {
      // Entire range below current price - only USDC needed
      return "only-usdc";
    } else {
      // Price within range - both tokens needed
      return "both";
    }
  };

  // Auto-calculate corresponding token amount using Position SDK
  const handleAmount0Change = async (subPosId: string, value: string) => {
    // Update the sub-position with new amount0 and mark ETH as last input
    setSubPositions((prevPositions) =>
      prevPositions.map((sp) =>
        sp.id === subPosId
          ? { ...sp, amount0: value, lastInputToken: "eth" as const }
          : sp
      )
    );

    const subPos = subPositions.find((sp) => sp.id === subPosId);
    if (!subPos || !value || !currentPrice) {
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount1: "" } : sp
        )
      );
      return;
    }

    const positionType = getPositionType(subPos.minPrice, subPos.maxPrice);
    if (positionType === "only-eth") {
      // Single-sided ETH only
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount1: "" } : sp
        )
      );
      return;
    }

    if (positionType === "only-usdc") {
      // Single-sided USDC only - shouldn't provide ETH
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount0: "" } : sp
        )
      );
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

      const tickLower = priceToTick(subPos.minPrice);
      const tickUpper = priceToTick(subPos.maxPrice);

      // Create position from ETH amount to calculate required USDC
      const ethAmount = CurrencyAmount.fromRawAmount(
        ETH_NATIVE,
        Math.floor(parseFloat(value) * 10 ** 18)
      );

      const position = Position.fromAmount0({
        pool,
        tickLower,
        tickUpper,
        amount0: ethAmount.quotient,
        useFullPrecision: true,
      });

      const usdcAmount = parseFloat(position.amount1.toSignificant(6));
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount1: usdcAmount.toFixed(2) } : sp
        )
      );
    } catch (err) {
      console.error("Error calculating amount1:", err);
    }
  };

  const handleAmount1Change = async (subPosId: string, value: string) => {
    // Update the sub-position with new amount1 and mark USDC as last input
    setSubPositions((prevPositions) =>
      prevPositions.map((sp) =>
        sp.id === subPosId
          ? { ...sp, amount1: value, lastInputToken: "usdc" as const }
          : sp
      )
    );

    const subPos = subPositions.find((sp) => sp.id === subPosId);
    if (!subPos || !value || !currentPrice) {
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount0: "" } : sp
        )
      );
      return;
    }

    const positionType = getPositionType(subPos.minPrice, subPos.maxPrice);
    if (positionType === "only-usdc") {
      // Single-sided USDC only
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount0: "" } : sp
        )
      );
      return;
    }

    if (positionType === "only-eth") {
      // Single-sided ETH only - shouldn't provide USDC
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount1: "" } : sp
        )
      );
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

      const tickLower = priceToTick(subPos.minPrice);
      const tickUpper = priceToTick(subPos.maxPrice);

      // Create position from USDC amount to calculate required ETH
      const usdcAmount = CurrencyAmount.fromRawAmount(
        USDC_TOKEN,
        Math.floor(parseFloat(value) * 10 ** 6)
      );

      const position = Position.fromAmount1({
        pool,
        tickLower,
        tickUpper,
        amount1: usdcAmount.quotient,
      });

      const ethAmount = parseFloat(position.amount0.toSignificant(6));
      setSubPositions((prevPositions) =>
        prevPositions.map((sp) =>
          sp.id === subPosId ? { ...sp, amount0: ethAmount.toFixed(6) } : sp
        )
      );
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
                    subPositions={subPositions.map((sp) => ({
                      id: sp.id,
                      minPrice: sp.minPrice,
                      maxPrice: sp.maxPrice,
                    }))}
                    onRangeChange={updateSubPositionRange}
                    onBulkRangeChange={bulkUpdateSubPositionRanges}
                    onAddSubPosition={handleAddSubPosition}
                    onRemoveSubPosition={handleRemoveSubPosition}
                    handleAutoRebalance={(id) => {
                      const subPos = subPositions.find((sp) => sp.id === id);
                      if (!subPos) return;

                      // Recalculate based on the last input token (the anchor)
                      if (subPos.lastInputToken === "eth" && subPos.amount0) {
                        // ETH is anchored, recalculate USDC
                        handleAmount0Change(id, subPos.amount0);
                      } else if (
                        subPos.lastInputToken === "usdc" &&
                        subPos.amount1
                      ) {
                        // USDC is anchored, recalculate ETH
                        handleAmount1Change(id, subPos.amount1);
                      } else if (subPos.amount0) {
                        // No anchor set, default to ETH
                        handleAmount0Change(id, subPos.amount0);
                      }
                    }}
                    tokenSymbol="ETH/USDC"
                  />
                )}

                {/* Token Deposit Inputs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">
                      Deposit Tokens
                    </Label>
                  </div>

                  {subPositions.map((subPos, index) => {
                    const positionType = getPositionType(
                      subPos.minPrice,
                      subPos.maxPrice
                    );

                    return (
                      <div key={subPos.id} className="space-y-2">
                        {subPositions.length > 1 && (
                          <Label className="text-xs text-muted-foreground">
                            Position {index + 1}
                          </Label>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            {/* ETH Input */}
                            <div
                              className={`p-4 bg-card border border-border rounded-lg space-y-2 transition-opacity ${
                                positionType === "only-usdc"
                                  ? "opacity-40 pointer-events-none"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    width={24}
                                    height={24}
                                    src={ethLogo}
                                    alt="ETH"
                                    className="rounded-full"
                                  />
                                  <span className="font-semibold">ETH</span>
                                </div>
                                {ethBalance && (
                                  <button
                                    onClick={() =>
                                      handleAmount0Change(
                                        subPos.id,
                                        parseFloat(
                                          formatUnits(
                                            ethBalance.value,
                                            ethBalance.decimals
                                          )
                                        ).toFixed(6)
                                      )
                                    }
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {parseFloat(
                                      formatUnits(
                                        ethBalance.value,
                                        ethBalance.decimals
                                      )
                                    ).toFixed(4)}{" "}
                                    ETH
                                  </button>
                                )}
                              </div>
                              <Input
                                type="number"
                                step="0.000001"
                                value={subPos.amount0}
                                onChange={(e) =>
                                  handleAmount0Change(subPos.id, e.target.value)
                                }
                                placeholder="0.0"
                                className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                              />
                              {subPos.amount0 && currentPrice && (
                                <p className="text-sm text-muted-foreground">
                                  $
                                  {(
                                    parseFloat(subPos.amount0) * currentPrice
                                  ).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                              )}
                            </div>

                            {/* USDC Input */}
                            <div
                              className={`p-4 bg-card border border-border rounded-lg space-y-2 transition-opacity ${
                                positionType === "only-eth"
                                  ? "opacity-40 pointer-events-none"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    width={24}
                                    height={24}
                                    src={usdcLogo}
                                    alt="USDC"
                                    className="rounded-full"
                                  />
                                  <span className="font-semibold">USDC</span>
                                </div>
                                {usdcBalance && (
                                  <button
                                    onClick={() =>
                                      handleAmount1Change(
                                        subPos.id,
                                        parseFloat(
                                          formatUnits(
                                            usdcBalance.value,
                                            usdcBalance.decimals
                                          )
                                        ).toFixed(2)
                                      )
                                    }
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {parseFloat(
                                      formatUnits(
                                        usdcBalance.value,
                                        usdcBalance.decimals
                                      )
                                    ).toFixed(2)}{" "}
                                    USDC
                                  </button>
                                )}
                              </div>
                              <Input
                                type="number"
                                step="0.01"
                                value={subPos.amount1}
                                onChange={(e) =>
                                  handleAmount1Change(subPos.id, e.target.value)
                                }
                                placeholder="0.0"
                                className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                              />
                              {subPos.amount1 && (
                                <p className="text-sm text-muted-foreground">
                                  $
                                  {parseFloat(subPos.amount1).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                    );
                  })}
                </div>

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
