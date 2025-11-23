'use client';

import { useGetPortfolio } from '@/services/octav/loader';
// import { getPoolId } from '../utils/getPoolId';
// import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';

export default function Portfolio({ ownerAddress = '0x6426af179aabebe47666f345d69fd9079673f6cd' }) {
  const { data, isLoading, error } = useGetPortfolio({
    // address: '0x6426af179aabebe47666f345d69fd9079673f6cd',
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

  // const chainId = ChainId.MAINNET;
  // const USDC = new Token(chainId, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin');
  // const WETH = WETH9[chainId];

  // const poolIdExample = getPoolId(WETH, USDC, 3000, 60, '0x0000000000000000000000000000000000000000');

  return (
    <div className="p-4 border border-gray-300 bg-gray-50 rounded-md">
      <p className="font-semibold text-gray-800">Net Worth for {data?.address}</p>
      <p className="text-gray-600">${data?.networth}</p>
      {/* <p className="text-gray-600">Example Pool ID: {poolIdExample}</p> */}
    </div>
  );
}
