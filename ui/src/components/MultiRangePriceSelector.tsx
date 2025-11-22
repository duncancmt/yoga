"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "@radix-ui/react-label";
import ethLogo from "cryptocurrency-icons/svg/color/eth.svg";
import usdcLogo from "cryptocurrency-icons/svg/color/usdc.svg";
import { useAccount, useBalance } from "wagmi";
import DepositTokens from "./DepositTokens";
import { useUniswap } from "@/providers/UniswapProvider";
import { getPositionType } from "@/lib/utils";

interface SubPositionRange {
  id: string;
  minPrice: number;
  maxPrice: number;
}

interface MultiRangePriceSelectorProps {
  currentPrice: number;
  subPositions: SubPositionRange[];
  onRangeChange: (id: string, minPrice: number, maxPrice: number) => void;
  onBulkRangeChange?: (
    updates: Array<{ id: string; minPrice: number; maxPrice: number }>
  ) => void;
  onAddSubPosition?: () => void;
  onRemoveSubPosition: (id: string) => void;
  handleAutoRebalance: (id: string) => void;
  tokenSymbol?: string;
  visualMinBound?: number;
  visualMaxBound?: number;
  modifyPosition?: boolean;
}

export function MultiRangePriceSelector({
  currentPrice,
  subPositions,
  onRangeChange,
  onBulkRangeChange,
  handleAutoRebalance,
  tokenSymbol = "ETH/USDC",
  visualMinBound,
  visualMaxBound,
  modifyPosition = false,
}: MultiRangePriceSelectorProps) {
  // const {getCurrentPrice} = useUniswap();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<{
    sliderIndex: number;
  } | null>(null);
  const affectedPositionIdsRef = useRef<Set<string>>(new Set());

  const { address, isConnected } = useAccount();

  // Fetch wallet balances
  const { data: ethBalance } = useBalance({
    address: address,
  });

  const { data: usdcBalance } = useBalance({
    address: address,
    token: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as `0x${string}`, // USDC on Unichain
  });

  // Calculate visual bounds (50% below to 50% above current price if not provided)
  const lowerBound = visualMinBound ?? currentPrice * 0.5;
  const upperBound = visualMaxBound ?? currentPrice * 1.5;
  const visualRange = upperBound - lowerBound;

  // Convert price to percentage position within bounds
  const priceToPercent = (price: number) => {
    const clamped = Math.max(lowerBound, Math.min(upperBound, price));
    return ((clamped - lowerBound) / visualRange) * 100;
  };

  // Convert percentage position to price
  const percentToPrice = (percent: number) => {
    return lowerBound + (visualRange * percent) / 100;
  };

  const currentPricePercent = priceToPercent(currentPrice);

  // Add new position state
  const [newPositionSide, setNewPositionSide] = useState<"left" | "right">(
    "right"
  );
  const [newPositionMinPrice, setNewPositionMinPrice] = useState<number>(0);
  const [newPositionMaxPrice, setNewPositionMaxPrice] = useState<number>(0);
  const [newPositionAmount0, setNewPositionAmount0] = useState("");
  const [newPositionAmount1, setNewPositionAmount1] = useState("");

  const [addSubPosition, setAddSubPosition] = useState(false);

  // Initialize new position range when adding
  useEffect(() => {
    if (currentPrice && addSubPosition) {
      if (newPositionSide === "right") {
        // Attach to the right of the rightmost position
        const rightmost = subPositions[subPositions.length - 1];
        const range = rightmost.maxPrice - rightmost.minPrice;

        setNewPositionMinPrice(rightmost.maxPrice); // Fixed boundary
        setNewPositionMaxPrice(rightmost.maxPrice + range);
      } else {
        // Attach to the left of the leftmost position
        const leftmost = subPositions[0];
        const range = leftmost.maxPrice - leftmost.minPrice;
        setNewPositionMaxPrice(leftmost.minPrice); // Fixed boundary
        setNewPositionMinPrice(leftmost.minPrice - range);
      }
    }
  }, [newPositionSide, currentPrice, subPositions, addSubPosition]);

  // Build array of slider positions from subPositions
  // For n positions, we need n+1 sliders
  const sliderPrices = React.useMemo(() => {
    if (subPositions.length === 0) return [];

    const sliders: number[] = [subPositions[0].minPrice];
    subPositions.forEach((sp) => {
      sliders.push(sp.maxPrice);
    });

    return sliders;
  }, [subPositions]);

  useEffect(() => {
    if (!isDragging || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newPrice = percentToPrice(percent);

      const sliderIdx = isDragging.sliderIndex;
      const minGap = visualRange * 0.01;

      // Constrain slider movement
      let constrainedPrice = newPrice;

      // Left boundary (lower bound or previous slider)
      if (sliderIdx === 0) {
        constrainedPrice = Math.max(lowerBound, constrainedPrice);
      } else {
        const prevSliderPrice = sliderPrices[sliderIdx - 1];
        constrainedPrice = Math.max(prevSliderPrice + minGap, constrainedPrice);
      }

      // Right boundary (upper bound or next slider)
      if (sliderIdx === sliderPrices.length - 1) {
        constrainedPrice = Math.min(upperBound, constrainedPrice);
      } else {
        const nextSliderPrice = sliderPrices[sliderIdx + 1];
        constrainedPrice = Math.min(nextSliderPrice - minGap, constrainedPrice);
      }

      // Update affected positions
      // Leftmost slider: only affects first position's minPrice
      // Rightmost slider: only affects last position's maxPrice
      // Middle sliders: affect both adjacent positions (left's maxPrice, right's minPrice)

      if (sliderIdx === 0) {
        // Leftmost slider - only update first position's minPrice
        const firstPos = subPositions[0];
        onRangeChange(firstPos.id, constrainedPrice, firstPos.maxPrice);
        affectedPositionIdsRef.current.add(firstPos.id);
      } else if (sliderIdx === sliderPrices.length - 1) {
        // Rightmost slider - only update last position's maxPrice
        const lastPos = subPositions[subPositions.length - 1];
        onRangeChange(lastPos.id, lastPos.minPrice, constrainedPrice);
        affectedPositionIdsRef.current.add(lastPos.id);
      } else {
        // Middle slider - update both adjacent positions
        const leftPosIdx = sliderIdx - 1;
        const rightPosIdx = sliderIdx;
        const leftPos = subPositions[leftPosIdx];
        const rightPos = subPositions[rightPosIdx];

        // Use bulk update if available, otherwise fall back to individual updates
        if (onBulkRangeChange) {
          onBulkRangeChange([
            {
              id: leftPos.id,
              minPrice: leftPos.minPrice,
              maxPrice: constrainedPrice,
            },
            {
              id: rightPos.id,
              minPrice: constrainedPrice,
              maxPrice: rightPos.maxPrice,
            },
          ]);
          affectedPositionIdsRef.current.add(leftPos.id);
          affectedPositionIdsRef.current.add(rightPos.id);
        } else {
          // Update left position's maxPrice
          onRangeChange(leftPos.id, leftPos.minPrice, constrainedPrice);
          // Update right position's minPrice
          onRangeChange(rightPos.id, constrainedPrice, rightPos.maxPrice);
          affectedPositionIdsRef.current.add(leftPos.id);
          affectedPositionIdsRef.current.add(rightPos.id);
        }
      }
    };

    const handleMouseUp = () => {
      // Trigger auto-rebalance for all affected positions
      affectedPositionIdsRef.current.forEach((posId) => {
        handleAutoRebalance(posId);
      });
      affectedPositionIdsRef.current.clear();
      setIsDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    subPositions,
    sliderPrices,
    visualRange,
    lowerBound,
    upperBound,
    onRangeChange,
    handleAutoRebalance,
    percentToPrice,
  ]);

  return (
    <div className="space-y-6">
      {/* Visual Range Selector */}
      <div className="relative">
        {/* Add Sub-Position Button */}
        {modifyPosition && (
          <div className="absolute -top-10 right-0 z-30">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddSubPosition(true)}
              className="h-8 gap-1"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs">Add Position</span>
            </Button>
          </div>
        )}

        {addSubPosition && (
          <>
            {/* Side Toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-sm">Attach to:</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={newPositionSide === "left" ? "default" : "outline"}
                  onClick={() => setNewPositionSide("left")}
                >
                  ← Left Side
                </Button>
                <Button
                  size="sm"
                  variant={newPositionSide === "right" ? "default" : "outline"}
                  onClick={() => setNewPositionSide("right")}
                >
                  Right Side →
                </Button>
              </div>
            </div>
          </>
        )}

        <div
          ref={containerRef}
          className="relative h-32 bg-card border border-border rounded-lg overflow-hidden"
          style={{ userSelect: "none" }}
        >
          {addSubPosition && <></>}

          {/* Render each sub-position range */}
          {subPositions.map((subPos, index) => {
            const minPercent = priceToPercent(subPos.minPrice);
            const maxPercent = priceToPercent(subPos.maxPrice);

            // Different colors for each sub-position
            const colors = [
              "bg-primary/10 border-l-2 border-r-2 border-primary/60",
              "bg-blue-500/10 border-l-2 border-r-2 border-blue-500/60",
              "bg-purple-500/10 border-l-2 border-r-2 border-purple-500/60",
              "bg-amber-500/10 border-l-2 border-r-2 border-amber-500/60",
            ];
            const colorClass = colors[index % colors.length];

            return (
              <div key={subPos.id}>
                {/* Selected Range Highlight */}
                <div
                  className={`absolute h-full transition-all ${colorClass}`}
                  style={{
                    left: `${minPercent}%`,
                    width: `${maxPercent - minPercent}%`,
                  }}
                />
              </div>
            );
          })}

          {/* Render sliders */}
          {sliderPrices.map((sliderPrice, sliderIdx) => {
            const sliderPercent = priceToPercent(sliderPrice);

            // Determine slider color based on adjacent positions
            const handleColors = [
              "bg-primary",
              "bg-blue-500",
              "bg-purple-500",
              "bg-amber-500",
            ];

            // Use color from the left position, or first color for leftmost slider
            const leftPosIdx = sliderIdx - 1;
            const handleColor =
              leftPosIdx >= 0
                ? handleColors[leftPosIdx % handleColors.length]
                : handleColors[0];

            return (
              <div
                key={sliderIdx}
                className="absolute top-0 h-full -translate-x-1/2 z-20 cursor-ew-resize group"
                style={{ left: `${sliderPercent}%` }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsDragging({ sliderIndex: sliderIdx });
                }}
              >
                <div
                  className={`h-full w-1 ${handleColor} group-hover:w-1.5 transition-all`}
                />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2">
                  <div
                    className={`w-6 h-10 ${handleColor} rounded-md border-2 border-background shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                      <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                      <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Current Price Line */}
          <div
            className="absolute h-full border-l-2 brightness-200 border-dashed border-muted-foreground pointer-events-none z-10"
            style={{
              left: `${currentPricePercent}%`,
            }}
          ></div>
        </div>

        {/* Bound Price Labels */}
        <div className="flex justify-between mt-2 px-1">
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Lower Bound</p>
            <p className="text-sm font-medium">
              $
              {lowerBound.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          {/* Current Price Display */}
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">Current Price</p>
            <p className="text-xl font-semibold">
              $
              {currentPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Upper Bound</p>
            <p className="text-sm font-medium">
              $
              {upperBound.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Selected Price Ranges Info */}
      <div className="space-y-3">
        {subPositions.map((subPos, index) => (
          <div key={subPos.id} className="relative">
            {!modifyPosition && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-card border border-border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    Position {index + 1} - Min Price
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    $
                    {subPos.minPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((subPos.minPrice / currentPrice - 1) * 100).toFixed(1)}%
                    from current
                  </p>
                </div>
                <div className="p-4 bg-card border border-border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    Position {index + 1} - Max Price
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    $
                    {subPos.maxPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    +{((subPos.maxPrice / currentPrice - 1) * 100).toFixed(1)}%
                    from current
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New Position Range Selector */}

      {addSubPosition && (
        <DepositTokens
          positionType={getPositionType(
            newPositionMinPrice,
            newPositionMaxPrice,
            currentPrice
          )}
          handleAmount0Change={() => {}}
          handleAmount1Change={() => {}}
          amount0={newPositionAmount0}
          amount1={newPositionAmount1}
          currentPrice={currentPrice}
        />
      )}
    </div>
  );
}
