import { Label } from "@radix-ui/react-label";
import { Plus, Minus } from "lucide-react";
import React, { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";

interface SubPositionProps {
  index: number;
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
}

const SubPosition = ({
  index,
  minPrice,
  maxPrice,
  currentPrice,
}: SubPositionProps) => {
  const [editMode, setEditMode] = useState<"add" | "remove" | null>(null);
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [removePercentage, setRemovePercentage] = useState("50");
  return (
    <div>
      <Card key={index} className="border-2">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Sub-Position {index + 1}</h4>
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
              <p className="font-medium">${minPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {((minPrice / currentPrice - 1) * 100).toFixed(1)}% from current
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Max Price</p>
              <p className="font-medium">${maxPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                +{((maxPrice / currentPrice - 1) * 100).toFixed(1)}% from
                current
              </p>
            </div>
          </div>

          {/* Edit Forms */}
          {editMode === "add" && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
              <h5 className="font-medium text-sm">Add Liquidity</h5>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`edit-amount0-${index}`} className="text-xs">
                    ETH Amount
                  </Label>
                  <Input
                    id={`edit-amount0-${index}`}
                    type="number"
                    step="0.0001"
                    value={amount0}
                    onChange={(e) => setAmount0(e.target.value)}
                    placeholder="0.001"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edit-amount1-${index}`} className="text-xs">
                    USDC Amount
                  </Label>
                  <Input
                    id={`edit-amount1-${index}`}
                    type="number"
                    step="0.01"
                    value={amount1}
                    onChange={(e) => setAmount1(e.target.value)}
                    placeholder="1.0"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    // TODO: Call modify function
                    console.log("Adding liquidity to", index);
                  }}
                  disabled={!amount0 || !amount1}
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
                    // TODO: Call modify function
                    console.log("Removing liquidity from", index);
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
