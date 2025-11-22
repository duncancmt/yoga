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
import { PriceRangeSelector } from "@/components/PriceRangeSelector";
import ethLogo from "cryptocurrency-icons/svg/color/eth.svg";
import usdcLogo from "cryptocurrency-icons/svg/color/usdc.svg";
import { Pool, Position } from "@uniswap/v4-sdk";
import { Token, Ether, ChainId, CurrencyAmount } from "@uniswap/sdk-core";
import { nearestUsableTick } from "@uniswap/v3-sdk";

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

  // Price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState<number>(2000); // Default min price
  const [maxPrice, setMaxPrice] = useState<number>(3500); // Default max price
  const [amount0Max, setAmount0Max] = useState<string>("");
  const [amount1Max, setAmount1Max] = useState<string>("");
  const [lastInputToken, setLastInputToken] = useState<"eth" | "usdc" | null>(
    null
  );

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
        setMinPrice(price * 0.75);
        setMaxPrice(price * 1.25);
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
          setPositions(openPositions);
        });
      }, 2000);
    }
  }, [isConfirmed, address, fetchUserPositions]);

  const handleCreatePosition = () => {
    if (!address) return;

    // Convert prices to ticks
    const tickLower = priceToTick(minPrice);
    const tickUpper = priceToTick(maxPrice);

    mintPosition({
      tickLower,
      tickUpper,
      amount0Desired: BigInt(Math.floor(parseFloat(amount0Max) * 1e18)),
      amount1Desired: BigInt(Math.floor(parseFloat(amount1Max) * 1e6)),
      recipient: address,
    });
  };

  const handlePositionClick = (tokenId: bigint) => {
    router.push(`/position/${tokenId}`);
  };

  // Calculate position type based on current price and range
  const getPositionType = (): "both" | "only-eth" | "only-usdc" | "unknown" => {
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
  const handleAmount0Change = async (value: string) => {
    setAmount0Max(value);
    setLastInputToken("eth"); // Mark ETH as the last input

    if (!value || !currentPrice || !minPrice || !maxPrice) {
      setAmount1Max("");
      return;
    }

    const positionType = getPositionType();
    if (positionType === "only-eth") {
      // Single-sided ETH only
      setAmount1Max("");
      return;
    }

    if (positionType === "only-usdc") {
      // Single-sided USDC only - shouldn't provide ETH
      setAmount0Max("");
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

      const tickLower = priceToTick(minPrice);
      const tickUpper = priceToTick(maxPrice);

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
      setAmount1Max(usdcAmount.toFixed(2));
    } catch (err) {
      console.error("Error calculating amount1:", err);
    }
  };

  const handleAmount1Change = async (value: string) => {
    setAmount1Max(value);
    setLastInputToken("usdc"); // Mark USDC as the last input

    if (!value || !currentPrice || !minPrice || !maxPrice) {
      setAmount0Max("");
      return;
    }

    const positionType = getPositionType();
    if (positionType === "only-usdc") {
      // Single-sided USDC only
      setAmount0Max("");
      return;
    }

    if (positionType === "only-eth") {
      // Single-sided ETH only - shouldn't provide USDC
      setAmount1Max("");
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

      const tickLower = priceToTick(minPrice);
      const tickUpper = priceToTick(maxPrice);

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
      setAmount0Max(ethAmount.toFixed(6));
    } catch (err) {
      console.error("Error calculating amount0:", err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center font-sans">
      {/* Main Content */}
      {isConnected && (
        <div className="max-w-2xl mx-auto">
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
                  <PriceRangeSelector
                    currentPrice={currentPrice}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    onRangeChange={(min, max) => {
                      setMinPrice(min);
                      setMaxPrice(max);
                    }}
                    handleAutoRebalance={() => {
                      // Recalculate based on the last input token (the anchor)
                      if (lastInputToken === "eth" && amount0Max) {
                        // ETH is anchored, recalculate USDC
                        handleAmount0Change(amount0Max);
                      } else if (lastInputToken === "usdc" && amount1Max) {
                        // USDC is anchored, recalculate ETH
                        handleAmount1Change(amount1Max);
                      } else if (amount0Max) {
                        // No anchor set, default to ETH
                        handleAmount0Change(amount0Max);
                      }
                    }}
                    tokenSymbol="ETH/USDC"
                  />
                )}

                {/* Token Deposit Inputs */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">
                      Deposit Tokens
                    </Label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* ETH Input */}
                    <div
                      className={`p-4 bg-card border border-border rounded-lg space-y-2 transition-opacity ${
                        getPositionType() === "only-usdc"
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
                              formatUnits(ethBalance.value, ethBalance.decimals)
                            ).toFixed(4)}{" "}
                            ETH
                          </button>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="0.000001"
                        value={amount0Max}
                        onChange={(e) => handleAmount0Change(e.target.value)}
                        placeholder="0.0"
                        className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                      />
                      {amount0Max && currentPrice && (
                        <p className="text-sm text-muted-foreground">
                          $
                          {(
                            parseFloat(amount0Max) * currentPrice
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
                        getPositionType() === "only-eth"
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
                        value={amount1Max}
                        onChange={(e) => handleAmount1Change(e.target.value)}
                        placeholder="0.0"
                        className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                      />
                      {amount1Max && (
                        <p className="text-sm text-muted-foreground">
                          $
                          {parseFloat(amount1Max).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
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
