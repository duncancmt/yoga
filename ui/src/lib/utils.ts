import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { PositionType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Calculate position type based on current price and range
export const getPositionType = (
  minPrice: number,
  maxPrice: number,
  currentPrice: number
): PositionType => {
  if (!currentPrice || !minPrice || !maxPrice) return PositionType.UNKNOWN;

  if (minPrice > currentPrice) {
    // Entire range above current price - only ETH needed
    return PositionType.ONLY_ETH;
  } else if (maxPrice < currentPrice) {
    // Entire range below current price - only USDC needed
    return PositionType.ONLY_USDC;
  } else {
    // Price within range - both tokens needed
    return PositionType.BOTH;
  }
};
