"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import DepositTokens from "./DepositTokens";
import { getColors, getPositionType } from "@/lib/utils";
import { Position, useUniswap } from "@/providers/UniswapProvider";
import { useAccount } from "wagmi";
import { useParams } from "next/navigation";

interface MultiRangePriceSelectorProps {
  currentPrice: number;
  subPositions: Position[];
  onRangeChange: (minPrice: number, maxPrice: number) => void;
  onBulkRangeChange?: (
    updates: Array<{ minPrice: number; maxPrice: number }>
  ) => void;
  onAddSubPosition?: () => void;
  handleAutoRebalance: () => void;
  tokenSymbol?: string;
  visualMinBound?: number;
  visualMaxBound?: number;
  modifyPosition?: boolean;
  ticks: number[];
}

export function MultiRangePriceSelector({
  currentPrice,
  subPositions,
  onRangeChange,
  onBulkRangeChange,
  handleAutoRebalance,
  tokenSymbol = "ETH/USDC",
  ticks,
  visualMinBound,
  visualMaxBound,
  modifyPosition = false,
}: MultiRangePriceSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<{
    sliderIndex: number;
  } | null>(null);
  const affectedPositionIdsRef = useRef<Set<string>>(new Set());
  const { tokenId } = useParams();

  const { address } = useAccount();
  const {
    priceToTick,
    mintPosition,
    isConfirming,
    approveAllowance,
    createSubPosition,
    checkAllowance,
  } = useUniswap();

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

  const [newPosition, setNewPosition] = useState<Position>({
    minPrice: 0,
    maxPrice: 0,
    amount0: "",
    amount1: "",
    lastInputToken: "eth" as const,
    positionValue: "",
  });

  const [addSubPosition, setAddSubPosition] = useState(false);

  // Initialize new position range when adding
  useEffect(() => {
    if (currentPrice && addSubPosition) {
      if (newPositionSide === "right") {
        // Attach to the right of the rightmost position
        const rightmost = subPositions[subPositions.length - 1];
        const range = rightmost.maxPrice - rightmost.minPrice;

        setNewPosition({
          minPrice: rightmost.maxPrice,
          maxPrice: rightmost.maxPrice + range,
          amount0: "",
          amount1: "",
          positionValue: "",
          lastInputToken: "eth" as const,
        });
      } else {
        // Attach to the left of the leftmost position
        const leftmost = subPositions[0];
        const range = leftmost.maxPrice - leftmost.minPrice;
        setNewPosition({
          minPrice: leftmost.minPrice - range,
          maxPrice: leftmost.minPrice,
          amount0: "",
          amount1: "",
          positionValue: "",
          lastInputToken: "eth" as const,
        });
      }
    }
  }, [newPositionSide, currentPrice, subPositions, addSubPosition]);

  // Build array of slider positions from subPositions
  // For n positions, we need n+1 sliders
  const sliderPrices = React.useMemo(() => {
    if (subPositions.length === 0) return [];

    // Normal mode: all sliders from existing positions
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

      // Handle new position slider (sliderIdx === -1)
      if (sliderIdx === -1) {
        if (newPositionSide === "right") {
          // Adding to right: only the max price slider is draggable
          // Constrained by the fixed left boundary (rightmost existing position)
          const rightmost = subPositions[subPositions.length - 1];
          constrainedPrice = Math.max(
            rightmost.maxPrice + minGap,
            constrainedPrice
          );
          constrainedPrice = Math.min(upperBound, constrainedPrice);
          setNewPosition((prev) => ({
            ...prev,
            maxPrice: constrainedPrice as number,
          }));
        } else {
          // Adding to left: only the min price slider is draggable
          // Constrained by the fixed right boundary (leftmost existing position)
          const leftmost = subPositions[0];
          constrainedPrice = Math.max(lowerBound, constrainedPrice);
          constrainedPrice = Math.min(
            leftmost.minPrice - minGap,
            constrainedPrice
          );
          setNewPosition((prev) => ({
            ...prev,
            minPrice: constrainedPrice as number,
          }));
        }
        return;
      }

      // Normal mode: handle existing position sliders
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
        onRangeChange(constrainedPrice, firstPos.maxPrice);
      } else if (sliderIdx === sliderPrices.length - 1) {
        // Rightmost slider - only update last position's maxPrice
        const lastPos = subPositions[subPositions.length - 1];
        onRangeChange(lastPos.minPrice, constrainedPrice);
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
              minPrice: leftPos.minPrice,
              maxPrice: constrainedPrice,
            },
            {
              minPrice: constrainedPrice,
              maxPrice: rightPos.maxPrice,
            },
          ]);
        } else {
          // Update left position's maxPrice
          onRangeChange(leftPos.minPrice, constrainedPrice);
          // Update right position's minPrice
          onRangeChange(constrainedPrice, rightPos.maxPrice);
        }
      }
    };

    const handleMouseUp = () => {
      // Trigger auto-rebalance for all affected positions
      affectedPositionIdsRef.current.forEach((posId) => {
        handleAutoRebalance();
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
    onBulkRangeChange,
    handleAutoRebalance,
    percentToPrice,
    addSubPosition,
    newPositionSide,
  ]);

  const handleCreatePosition = async () => {
    if (!address || !newPosition) return;

    const amount1 = BigInt(parseFloat(newPosition.amount1 || "0") * 1e6);

    if (amount1 > BigInt(0)) {
      const hasAllowance = await checkAllowance(
        address as `0x${string}`,
        amount1
      );

      if (!hasAllowance) {
        await approveAllowance(address as `0x${string}`, amount1);
        return;
      }
    }

    // Convert prices to ticks
    const tickLower = priceToTick(newPosition.minPrice);
    const tickUpper = priceToTick(newPosition.maxPrice);

    createSubPosition({
      tokenId: BigInt(tokenId as string),
      tickLower,
      tickUpper,
      recipient: address,
      amount0Desired: BigInt(
        Math.floor(parseFloat(newPosition.amount0 || "0") * 1e18)
      ),
      amount1Desired: BigInt(
        Math.floor(parseFloat(newPosition.amount1 || "0") * 1e6)
      ),
    });
  };

  return (
    <div className="space-y-6">
      {/* Visual Range Selector */}
      <div className="relative">
        {/* Add Sub-Position Button */}
        {modifyPosition && (
          <>
            <div className="absolute -top-10 right-0 z-30">
              <div className="flex items-center gap-2">
                {addSubPosition && (
                  <>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={
                          newPositionSide === "left" ? "default" : "outline"
                        }
                        onClick={() => setNewPositionSide("left")}
                      >
                        ← Left
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          newPositionSide === "right" ? "default" : "outline"
                        }
                        onClick={() => setNewPositionSide("right")}
                      >
                        Right →
                      </Button>
                    </div>
                  </>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddSubPosition(true)}
                  className="h-8 gap-1"
                  disabled={addSubPosition}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs">Add Position</span>
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
          {/* Render each sub-position range */}
          {subPositions.map((subPos, index) => {
            const minPercent = priceToPercent(subPos.minPrice);
            const maxPercent = priceToPercent(subPos.maxPrice);
            const { colorClass } = getColors(index);

            return (
              <div key={index}>
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

          {/* Render new position when adding */}
          {addSubPosition &&
            (() => {
              // Always use the next color in sequence
              const newPositionIndex = subPositions.length;
              const { colorClass } = getColors(newPositionIndex);

              return (
                <div
                  className={`absolute h-full transition-all ${colorClass} border-dashed`}
                  style={{
                    left: `${priceToPercent(newPosition.minPrice)}%`,
                    width: `${
                      priceToPercent(newPosition.maxPrice) -
                      priceToPercent(newPosition.minPrice)
                    }%`,
                  }}
                />
              );
            })()}

          {/* Render sliders */}
          {sliderPrices.map((sliderPrice, sliderIdx) => {
            const sliderPercent = priceToPercent(sliderPrice);

            // Use color from the left position, or first color for leftmost slider
            const leftPosIdx = sliderIdx - 1;
            const { handleColor } = getColors(leftPosIdx >= 0 ? leftPosIdx : 0);

            // When adding a new position, make existing sliders read-only
            const isReadOnly = addSubPosition;

            return (
              <div
                key={sliderIdx}
                className={`absolute top-0 h-full -translate-x-1/2 z-20 ${
                  isReadOnly
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-ew-resize"
                } group`}
                style={{ left: `${sliderPercent}%` }}
                onMouseDown={(e) => {
                  if (isReadOnly) return; // Prevent dragging when read-only
                  e.preventDefault();
                  setIsDragging({ sliderIndex: sliderIdx });
                }}
              >
                <div
                  className={`h-full w-1 ${handleColor} ${
                    !isReadOnly && "group-hover:w-1.5"
                  } transition-all`}
                />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2">
                  <div
                    className={`w-6 h-10 ${handleColor} rounded-md border-2 border-background shadow-lg ${
                      !isReadOnly && "group-hover:scale-110"
                    } transition-transform flex items-center justify-center`}
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

          {/* Render new position's adjustable slider when adding */}
          {addSubPosition &&
            (() => {
              // Always use the next color in sequence
              const newPositionIndex = subPositions.length;
              const { handleColor } = getColors(newPositionIndex);

              return (
                <div
                  className="absolute top-0 h-full -translate-x-1/2 z-20 cursor-ew-resize group"
                  style={{
                    left: `${priceToPercent(
                      newPositionSide === "right"
                        ? newPosition.maxPrice
                        : newPosition.minPrice
                    )}%`,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsDragging({ sliderIndex: -1 }); // Use -1 to indicate new position slider
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
            })()}

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
          <div key={index} className="relative">
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

      {/* New Position Info */}
      {addSubPosition && (
        <div className="space-y-4 mb-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-card border border-green-500/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">
                New Position - Min Price{" "}
                {newPositionSide === "right" ? "(Fixed)" : "(Adjustable)"}
              </p>
              <p className="text-xl font-semibold text-foreground">
                $
                {newPosition.minPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {((newPosition.minPrice / currentPrice - 1) * 100).toFixed(1)}%
                from current
              </p>
            </div>
            <div className="p-4 bg-card border border-green-500/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">
                New Position - Max Price{" "}
                {newPositionSide === "left" ? "(Fixed)" : "(Adjustable)"}
              </p>
              <p className="text-xl font-semibold text-foreground">
                $
                {newPosition.maxPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                +{((newPosition.maxPrice / currentPrice - 1) * 100).toFixed(1)}%
                from current
              </p>
            </div>
          </div>

          <DepositTokens
            positionType={getPositionType(
              newPosition.minPrice,
              newPosition.maxPrice,
              currentPrice
            )}
            handleAmount0Change={(value) => {
              setNewPosition((prev) => ({ ...prev, amount0: value }));
            }}
            handleAmount1Change={(value) => {
              setNewPosition((prev) => ({ ...prev, amount1: value }));
            }}
            amount0={newPosition.amount0}
            amount1={newPosition.amount1}
            currentPrice={currentPrice}
          />

          <Button
            onClick={handleCreatePosition}
            disabled={!address || isConfirming}
            className="w-full"
          >
            {isConfirming ? "Confirming..." : "Create Sub-Position"}
          </Button>
        </div>
      )}
    </div>
  );
}
