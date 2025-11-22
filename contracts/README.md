# YogaStudio: Improved Uniswap V4 Position Manager

## Contract Overview

YogaStudio is a custom Position Manager for Uniswap V4. It inherits from `MiniV4Manager` and `ERC721`.

This contract allows a single NFT (TokenID) to own liquidity across multiple tick ranges simultaneously. It is designed to allow users to reshape their liquidity—moving tokens from inactive ranges to new target ranges—atomically without swapping.

### Main Functions

  * **`beginPractice`**: Mints a new NFT and creates the initial liquidity position.
  * **`flow`**: The core function to modify existing positions. It removes old liquidity and adds new liquidity in a single transaction.
  * **`lookAtLimbs`**: A view function to see all active ranges ("Limbs") associated with a specific NFT.

-----

## The `flow` Function

The `flow` function allows you to modify the price ranges of your liquidity without withdrawing and redepositing manually.

### Logic

When `flow(tokenId, newRanges[])` is called, the contract performs the following steps in a single atomic callback:

1.  **Remove Inactive Ranges:** It iterates through the current ranges held by the NFT. If a range is not currently active (the price is not inside it), the liquidity is removed.
2.  **Add New Ranges:** It attempts to add the liquidity to the `newRanges` specified in the arguments.
3.  **Zero-Sum Check:** It calculates the net change in tokens. The amount of Token0 and Token1 removed must effectively match the amount added (within a small dust tolerance). If the values do not match, the transaction reverts.

### Constraints

  * **Inactive Only:** You cannot move liquidity that is currently active (i.e., the current price is within the range).
  * **No Swaps:** You cannot change the ratio of tokens. You must redeploy exactly what you withdrew.
  * **No Overlap:** New ranges cannot overlap with the current active tick.



-----
