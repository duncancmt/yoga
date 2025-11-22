import Portfolio from '@/components/example/portfolio';
import Uniswap4PositionsWidget from '@/components/example/uniswap4-positions-widget';
import { generateMetadata } from '@/lib/metadata';

export const metadata = generateMetadata({
  title: 'Yoga',
  description: 'Flexible liquidity',
});

export default function Page() {
  // const ownerAddress = '0x6426af179aabebe47666f345d69fd9079673f6cd';

  // Account with Uniswap v4 Positions: 0xbA85a470abAB9A283E7EfeB7BfA30ae04f6067fA
  const ownerAddress = '0xbA85a470abAB9A283E7EfeB7BfA30ae04f6067fA';

  return (
    <div className="flex flex-col gap-4">
      {/* <p>Example widget</p>
      <Portfolio ownerAddress={ownerAddress} /> */}
      <h1 className="text-2xl font-bold">Uniswap v4 LP positions widget</h1>
      <Uniswap4PositionsWidget initialAddress={ownerAddress} />
    </div>
  );
}
