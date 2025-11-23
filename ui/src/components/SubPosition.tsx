import { Label } from "@radix-ui/react-label";
import { Plus, Minus } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import DepositTokens from "./DepositTokens";
import { getPositionType } from "@/lib/utils";
import { Position, useUniswap } from "@/providers/UniswapProvider";
import { useParams } from "next/navigation";

interface SubPositionProps {
  index: number;
  position: Position;
  currentPrice: number;
}

const SubPosition = ({ index, position, currentPrice }: SubPositionProps) => {
  const [editMode, setEditMode] = useState<"add" | "remove" | null>(null);
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [removePercentage, setRemovePercentage] = useState("50");
  const { tokenId } = useParams();

  const { addLiquidity, removeLiquidity, priceToTick, isConfirmed } =
    useUniswap();

  useEffect(() => {
    if (isConfirmed) {
      setEditMode(null);
    }
  }, [isConfirmed]);

  return (
    <div>
      <Card key={index} className="border-2">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Sub-Position {index + 1}</h4>
            {/* <p className="text-sm font-medium">
              Size: {position.positionValue}
            </p> */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditMode("add");
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Liquidity
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditMode("remove");
                }}
              >
                <Minus className="h-3 w-3 mr-1" />
                Remove Liquidity
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Min Price</p>
              <p className="font-medium">${position.minPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {((position.minPrice / currentPrice - 1) * 100).toFixed(1)}%
                from current
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Max Price</p>
              <p className="font-medium">${position.maxPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                +{((position.maxPrice / currentPrice - 1) * 100).toFixed(1)}%
                from current
              </p>
            </div>
          </div>

          {/* Edit Forms */}
          {editMode === "add" && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
              <h5 className="font-medium text-sm">Add Liquidity</h5>

              <DepositTokens
                positionType={getPositionType(
                  position.minPrice,
                  position.maxPrice,
                  currentPrice ?? 0
                )}
                handleAmount0Change={(value) => setAmount0(value)}
                handleAmount1Change={(value) => setAmount1(value)}
                amount0={amount0}
                amount1={amount1}
                currentPrice={currentPrice ?? 0}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const tickLower = priceToTick(position.minPrice);
                    const tickUpper = priceToTick(position.maxPrice);

                    const amount0Desired = BigInt(
                      parseFloat(amount0 || "0") * 1e18
                    );
                    const amount1Desired = BigInt(
                      parseFloat(amount1 || "0") * 1e6
                    );
                    addLiquidity({
                      tokenId: BigInt(tokenId as string),
                      amount0Desired,
                      amount1Desired,
                      tickLower,
                      tickUpper,
                    });
                  }}
                  disabled={!amount0 && !amount1}
                  className="flex-1"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditMode(null);
                    setAmount0("");
                    setAmount1("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {editMode === "remove" && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
              <h5 className="font-medium text-sm">Remove Liquidity</h5>
              <div className="space-y-2">
                <Label
                  htmlFor={`remove-percentage-${index}`}
                  className="text-xs"
                >
                  Percentage: {removePercentage}%
                </Label>
                <Input
                  id={`remove-percentage-${index}`}
                  type="range"
                  min="1"
                  max="100"
                  value={removePercentage}
                  onChange={(e) => setRemovePercentage(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRemovePercentage("25")}
                  >
                    25%
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRemovePercentage("50")}
                  >
                    50%
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRemovePercentage("75")}
                  >
                    75%
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRemovePercentage("100")}
                  >
                    Max
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    removeLiquidity({
                      tokenId: BigInt(tokenId as string),
                      liquidityPercentage: parseFloat(removePercentage),
                      tickLower: priceToTick(position.minPrice),
                      tickUpper: priceToTick(position.maxPrice),
                    });
                  }}
                  className="flex-1"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditMode(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubPosition;
