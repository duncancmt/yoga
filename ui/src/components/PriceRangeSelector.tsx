"use client";

import { useState, useRef, useEffect } from "react";

interface PriceRangeSelectorProps {
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  onRangeChange: (minPrice: number, maxPrice: number) => void;
  handleAutoRebalance: () => void;
  tokenSymbol?: string;
  // Visual bounds for the chart (defaults to wider range for better UX)
  visualMinBound?: number;
  visualMaxBound?: number;
}

export function PriceRangeSelector({
  currentPrice,
  minPrice,
  maxPrice,
  onRangeChange,
  handleAutoRebalance,
  tokenSymbol = "ETH/USDC",
  visualMinBound,
  visualMaxBound,
}: PriceRangeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"min" | "max" | null>(null);

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
  const minPricePercent = priceToPercent(minPrice);
  const maxPricePercent = priceToPercent(maxPrice);

  useEffect(() => {
    if (!isDragging || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newPrice = percentToPrice(percent);

      if (isDragging === "min") {
        // Ensure min doesn't exceed max (leave small gap)
        const minGap = visualRange * 0.01;
        const newMin = Math.min(newPrice, maxPrice - minGap);
        onRangeChange(Math.max(lowerBound, newMin), maxPrice);
        handleAutoRebalance();
      } else if (isDragging === "max") {
        // Ensure max doesn't go below min (leave small gap)
        const minGap = visualRange * 0.01;
        const newMax = Math.max(newPrice, minPrice + minGap);
        onRangeChange(minPrice, Math.min(upperBound, newMax));
        handleAutoRebalance();
      }
    };

    const handleMouseUp = () => {
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
    minPrice,
    maxPrice,
    visualRange,
    lowerBound,
    upperBound,
    onRangeChange,
  ]);

  return (
    <div className="space-y-6">
      {/* Visual Range Selector */}
      <div className="relative">
        <div
          ref={containerRef}
          className="relative h-32 bg-card border border-border rounded-lg overflow-hidden"
          style={{ userSelect: "none" }}
        >
          {/* Selected Range Highlight */}
          <div
            className="absolute h-full bg-primary/10 border-l-2 border-r-2 border-primary/60 transition-all"
            style={{
              left: `${minPricePercent}%`,
              width: `${maxPricePercent - minPricePercent}%`,
            }}
          />

          {/* Current Price Line */}
          <div
            className="absolute h-full border-l-2 brightness-200 border-dashed border-muted-foreground pointer-events-none z-10"
            style={{
              left: `${currentPricePercent}%`,
            }}
          ></div>

          {/* Min Price Handle */}
          <div
            className="absolute top-0 h-full -translate-x-1/2 z-20 cursor-ew-resize group"
            style={{ left: `${minPricePercent}%` }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging("min");
            }}
          >
            <div className="h-full w-1 bg-primary group-hover:w-1.5 transition-all" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2">
              <div className="w-6 h-10 bg-primary rounded-md border-2 border-background shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center">
                <div className="flex flex-col gap-1">
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Max Price Handle */}
          <div
            className="absolute top-0 h-full -translate-x-1/2 z-20 cursor-ew-resize group"
            style={{ left: `${maxPricePercent}%` }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging("max");
            }}
          >
            <div className="h-full w-1 bg-primary group-hover:w-1.5 transition-all" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2">
              <div className="w-6 h-10 bg-primary rounded-md border-2 border-background shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center">
                <div className="flex flex-col gap-1">
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                  <div className="w-1 h-1 bg-primary-foreground/60 rounded-full" />
                </div>
              </div>
            </div>
          </div>
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
            {/* <p className="text-xs text-muted-foreground">{tokenSymbol}</p> */}
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

      {/* Selected Price Range Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Min Price</p>
          <p className="text-xl font-semibold text-foreground">
            $
            {minPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {((minPrice / currentPrice - 1) * 100).toFixed(1)}% from current
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Max Price</p>
          <p className="text-xl font-semibold text-foreground">
            $
            {maxPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            +{((maxPrice / currentPrice - 1) * 100).toFixed(1)}% from current
          </p>
        </div>
      </div>
    </div>
  );
}
