import { Label } from "@radix-ui/react-label";
import React from "react";
import { formatUnits } from "viem";
import { Input } from "./ui/input";
import ethLogo from "cryptocurrency-icons/svg/color/eth.svg";
import usdcLogo from "cryptocurrency-icons/svg/color/usdc.svg";
import { useAccount, useBalance } from "wagmi";
import { PositionType } from "@/lib/types";

interface DepositTokensProps {
  positionType: PositionType;
  handleAmount0Change: (value: string) => void;
  handleAmount1Change: (value: string) => void;
  amount0: string;
  amount1: string;
  currentPrice: number;
}

const DepositTokens = ({
  positionType,
  handleAmount0Change,
  handleAmount1Change,
  amount0,
  amount1,
  currentPrice,
}: DepositTokensProps) => {
  const { address } = useAccount();

  // Fetch wallet balances
  const { data: ethBalance } = useBalance({
    address: address,
  });

  const { data: usdcBalance } = useBalance({
    address: address,
    token: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as `0x${string}`, // USDC on Unichain
  });

  return (
    <>
      {/* Token Deposit Inputs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Deposit Tokens</Label>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {/* ETH Input */}
            <div
              className={`p-4 bg-card border border-border rounded-lg space-y-2 transition-opacity ${
                positionType === PositionType.ONLY_USDC
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
                          formatUnits(ethBalance.value, ethBalance.decimals)
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
                value={amount0}
                onChange={(e) => handleAmount0Change(e.target.value)}
                placeholder="0.0"
                className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
              />
              {amount0 && currentPrice && (
                <p className="text-sm text-muted-foreground">
                  $
                  {(parseFloat(amount0) * currentPrice).toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </p>
              )}
            </div>

            {/* USDC Input */}
            <div
              className={`p-4 bg-card border border-border rounded-lg space-y-2 transition-opacity ${
                positionType === PositionType.ONLY_ETH
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
                          formatUnits(usdcBalance.value, usdcBalance.decimals)
                        ).toFixed(2)
                      )
                    }
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {parseFloat(
                      formatUnits(usdcBalance.value, usdcBalance.decimals)
                    ).toFixed(2)}{" "}
                    USDC
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                value={amount1}
                onChange={(e) => handleAmount1Change(e.target.value)}
                placeholder="0.0"
                className="text-2xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
              />
              {amount1 && (
                <p className="text-sm text-muted-foreground">
                  $
                  {parseFloat(amount1).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DepositTokens;
