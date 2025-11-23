"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUniswap } from "@/providers/UniswapProvider";
import type { Position, PositionDetails } from "@/providers/UniswapProvider";
import { MultiRangePriceSelector } from "@/components/MultiRangePriceSelector";
import ethLogo from "cryptocurrency-icons/svg/color/eth.svg";
import usdcLogo from "cryptocurrency-icons/svg/color/usdc.svg";
import { ArrowLeft, Plus, Minus, Coins } from "lucide-react";
import { Pool, Position as UniPosition } from "@uniswap/v4-sdk";
import { Token, Ether, ChainId, CurrencyAmount } from "@uniswap/sdk-core";
import SubPosition from "@/components/SubPosition";
import { getPositionValue } from "@/lib/utils";

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

export default function PositionPage() {
  const params = useParams();
  const router = useRouter();
  const {
    fetchUserPositions,
    getCurrentPrice,
    tickToPrice,
    getTicks,
    getTickRangeAmounts,
    isConfirmed,
    error,
  } = useUniswap();

  const [position, setPosition] = useState<PositionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);

  // Sub-positions state
  const [subPositions, setSubPositions] = useState<Position[]>([]);

  const tokenId = params.tokenId as string;

  const fetchPosition = async () => {
    try {
      const accounts = (await (window as any).ethereum?.request({
        method: "eth_accounts",
      })) as string[];

      if (accounts && accounts[0]) {
        const positions = await fetchUserPositions(
          accounts[0] as `0x${string}`
        );
        const foundPosition = positions.find(
          (p) => p.tokenId.toString() === tokenId
        );

        setPosition(foundPosition || null);
      }
    } catch (error) {
      console.error("Error fetching position:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosition();
    // Fetch current price
    getCurrentPrice().then((price) => {
      if (price) {
        setCurrentPrice(price);
      }
    });
    getTicks(BigInt(tokenId)).then((ticks) => {
      setTicks(ticks);
    });
  }, [tokenId, getCurrentPrice, getTicks]);

  const buildSubPositions = async (positionSet: Set<[number, number]>) => {
    const subPositions: Position[] = await Promise.all(
      Array.from(positionSet).map(async ([tickLower, tickUpper]) => {
        const { amount0, amount1 } = await getTickRangeAmounts(
          BigInt(tokenId),
          tickLower,
          tickUpper
        );

        return {
          minPrice: tickToPrice(tickLower),
          maxPrice: tickToPrice(tickUpper),
          amount0: amount0.toString(),
          amount1: amount1.toString(),
          positionValue: getPositionValue(
            BigInt(amount0 * 1e18),
            BigInt(amount1 * 1e6),
            currentPrice ?? 0
          ),
          lastInputToken: "eth" as const,
        };
      })
    );
    setSubPositions(subPositions);
  };

  // Initialize sub-positions from the actual position
  useEffect(() => {
    if (ticks && currentPrice) {
      //order the ticks
      const orderedTicks = ticks.sort((a, b) => a - b);
      const positionSet = new Set<[number, number]>();

      for (let i = 0; i < orderedTicks.length; i++) {
        const tick = orderedTicks[i];
        const nextTick = orderedTicks[i + 1];
        if (nextTick) {
          positionSet.add([tick, nextTick]);
        }
      }

      buildSubPositions(positionSet);
    }
  }, [position, currentPrice, ticks]);

  // Refresh position after successful transaction
  useEffect(() => {
    if (isConfirmed) {
      setTimeout(() => {
        fetchPosition();
      }, 2000);
    }
  }, [isConfirmed]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 py-12">
          <Card>
            <CardContent className="p-12">
              <p className="text-center text-muted-foreground">
                Loading position...
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!position) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 py-12">
          <Card>
            <CardContent className="p-12">
              <p className="text-center text-muted-foreground">
                Position not found
              </p>
              <div className="flex justify-center mt-4">
                <Button onClick={() => router.push("/")} variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-12">
        {/* Back Button */}
        <Button
          onClick={() => router.push("/")}
          variant="ghost"
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Positions
        </Button>

        <div className="grid gap-6">
          {/* Position Details Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="flex items-center -space-x-2">
                  <img
                    width={48}
                    height={48}
                    src={ethLogo}
                    alt="ETH"
                    className="rounded-full border-2 border-background"
                  />
                  <img
                    width={48}
                    height={48}
                    src={usdcLogo}
                    alt="USDC"
                    className="rounded-full border-2 border-background"
                  />
                </div>
                <div>
                  <CardTitle className="text-2xl">
                    ETH / USDC Position
                  </CardTitle>
                  <CardDescription>
                    Token ID: {position.tokenId.toString()}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pool Information */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Pool Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Fee Tier</p>
                    <p className="font-medium">
                      {position.poolKey.fee / 10000}%
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Tick Spacing
                    </p>
                    <p className="font-medium">
                      {position.poolKey.tickSpacing}
                    </p>
                  </div>
                </div>
              </div>

              {/* Position Information */}
              <div>
                <h3 className="text-lg font-semibold mb-3">
                  Position Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Tick Lower</p>
                    <p className="font-medium">{position.tickLower}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Tick Upper</p>
                    <p className="font-medium">{position.tickUpper}</p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-sm text-muted-foreground">Liquidity</p>
                    <p className="font-medium text-lg">
                      {position.liquidity.toString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction Status */}
              {error && (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-sm text-destructive font-medium">
                    Error: {error.message}
                  </p>
                </div>
              )}

              {isConfirmed && (
                <div className="p-4 bg-success/10 border border-success rounded-md">
                  <p className="text-sm text-success font-medium">
                    Transaction successful! Position will update shortly...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overall Position Visualization */}
          {currentPrice && subPositions.length > 0 && (
            <div className="my-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Position Overview</CardTitle>
                    <CardDescription>
                      Your position contains {subPositions.length} contiguous
                      sub-position{subPositions.length > 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <MultiRangePriceSelector
                    currentPrice={currentPrice}
                    subPositions={subPositions.map((sp) => ({
                      minPrice: sp.minPrice,
                      maxPrice: sp.maxPrice,
                      amount0: sp.amount0,
                      amount1: sp.amount1,
                      positionValue: getPositionValue(
                        BigInt(parseFloat(sp.amount0 || "0") * 1e18),
                        BigInt(parseFloat(sp.amount1 || "0") * 1e6),
                        currentPrice ?? 0
                      ),
                      lastInputToken: "eth" as const,
                    }))}
                    ticks={ticks}
                    onRangeChange={() => {}}
                    handleAutoRebalance={() => {}}
                    tokenSymbol="ETH/USDC"
                    modifyPosition={true}
                  />
                  {/* Sub-Position Cards */}
                  {currentPrice && subPositions.length > 0 && (
                    <div className="space-y-3">
                      {subPositions.map((subPos, index) => (
                        <SubPosition
                          index={index}
                          position={subPos}
                          currentPrice={currentPrice}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
