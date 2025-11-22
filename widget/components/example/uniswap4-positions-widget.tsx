"use client";

import { useState } from 'react';
import Uniswap4Positions from './uniswap4-positions';
import Portfolio from './portfolio';

type Props = {
  initialAddress?: string;
};

export default function Uniswap4PositionsWidget({ initialAddress = '0xbA85a470abAB9A283E7EfeB7BfA30ae04f6067fA' }: Props) {
  const [ownerAddress, setOwnerAddress] = useState(initialAddress);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Owner address</span>
        <input
          value={ownerAddress}
          onChange={(e) => setOwnerAddress(e.target.value)}
          placeholder="0x..."
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
        />
      </label>

      <Portfolio ownerAddress={ownerAddress} />
      <Uniswap4Positions ownerAddress={ownerAddress} />
    </div>
  );
}
