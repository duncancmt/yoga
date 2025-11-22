'use client';

import { useGetPortfolio } from '@/services/octav/loader';

interface Uniswap4PositionsProps {
  ownerAddress?: string;
}

export default function Uniswap4Positions({ ownerAddress = '0x6426af179aabebe47666f345d69fd9079673f6cd' }: Uniswap4PositionsProps) {
  const { data, isLoading, error } = useGetPortfolio({
    address: ownerAddress,
    includeImages: true,
    includeExplorerUrls: true,
    waitForSync: true,
  });

  if (isLoading) return <p>Loading...</p>;

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded-md">
        <p className="font-semibold text-red-800">Error</p>
        <p className="text-red-600">{error.message}</p>
      </div>
    );
  }
  console.log(data);
  // Wallet address with Uniswap v4 LP positions:
  //   Smaller account:
  //   0xbA85a470abAB9A283E7EfeB7BfA30ae04f6067fA
  //   Large account:
  //   0xae2Fc483527B8EF99EB5D9B44875F005ba1FaE13
  const uniswapValue = data?.assetByProtocols?.uniswap4?.value;
  const positions = data?.assetByProtocols?.uniswap4?.chains.ethereum?.protocolPositions.LIQUIDITYPOOL.protocolPositions;

  return (
    <div className="p-4 border border-gray-300 bg-gray-50 rounded-md">
      <p className="font-semibold text-gray-800">Uniswap v4 LP positions</p>
      {uniswapValue != null ? (
        <>
          <p className="text-gray-600">Total value: ${uniswapValue}</p>
          <p className="text-gray-600">Number of positions: {positions?.length ?? 0}</p>
          {positions && positions.length > 0 && (
            <div className="mt-4 space-y-2">
              {positions.map((position: any, index: number) => (
                <div key={index} className="p-2 border border-gray-200 rounded-md bg-white">
                  <p className="font-medium text-sm">Position {index + 1}</p>
                  <p className="text-xs text-gray-500">Value: ${position.value}</p>
                  {/* You can add more details here as you see fit */}
                </div>
              ))}
            </div>
          )}
        </>
      ) : <p className="text-gray-600">No Uniswap v4 positions found.</p>}
    </div>
  );
}
