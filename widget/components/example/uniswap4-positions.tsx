'use client';

import { ProtocolPosition } from '@/types/portfolio';
import { useGetPortfolio } from '@/services/octav/loader';
import PositionCard from './PositionCard';

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

  const uniswapValue = data?.assetByProtocols?.uniswap4?.value;
  const positions = data?.assetByProtocols?.uniswap4?.chains.ethereum?.protocolPositions.LIQUIDITYPOOL.protocolPositions;

  const chains = data?.assetByProtocols?.uniswap4?.chains;

  const renderPositionsByChain = () => {
    if (!chains) {
      return null;
    }

    return Object.keys(chains).map((chainKey) => {
      const chainData = chains[chainKey];
      const positions = chainData.protocolPositions?.LIQUIDITYPOOL?.protocolPositions;
      const numOfPositions = chainData.protocolPositions?.LIQUIDITYPOOL?.protocolPositions?.length;

      if (!positions || positions.length === 0) {
        return null;
      }

      return (
        <div key={chainKey} className="mt-4">
          <h3 className="text-md font-semibold capitalize mb-2">{chainKey}</h3>
          <p className="text-gray-600">Number of positions: {numOfPositions ?? 0}</p>
          <div className="space-y-2">
            {positions.map((position: ProtocolPosition, index: number) => {
              const chainId = Number(data?.chains?.[chainKey]?.chainId);
              return (
                <PositionCard
                  key={index}
                  position={position}
                  index={index}
                  chainKey={chainKey}
                  chainId={chainId}
                />
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="p-4 border border-gray-300 bg-gray-50 rounded-md">
      <p className="font-semibold text-gray-800">Uniswap v4 LP positions</p>
      {uniswapValue != null ? (
        <>
          <p className="text-gray-600">Total value: ${uniswapValue}</p>
          {renderPositionsByChain()}
        </>
      ) : <p className="text-gray-600">No Uniswap v4 positions found.</p>}
    </div>
  );
}
