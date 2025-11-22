'use client';

import { useGetPortfolio } from '@/services/octav/loader';

export default function Portfolio({ ownerAddress = '0x6426af179aabebe47666f345d69fd9079673f6cd' } ) {
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

  return (
    <div className="p-4 border border-gray-300 bg-gray-50 rounded-md">
      <p className="font-semibold text-gray-800">Net Worth for {data?.address}</p>
      <p className="text-gray-600">${data?.networth}</p>
    </div>
  );
}
