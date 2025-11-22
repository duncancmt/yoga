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

interface AppStateContextType {}

const AppStateContext = createContext<AppStateContextType | undefined>(
  undefined
);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const value: AppStateContextType = {};

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error("useAppState must be used within a AppStateProvider");
  }
  return context;
}
