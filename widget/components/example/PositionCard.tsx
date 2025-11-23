'use client';

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Token, Ether, Price } from '@uniswap/sdk-core';
import { tickToPrice } from '@uniswap/v4-sdk';
import { ProtocolPosition } from '@/types/portfolio';
import { getPoolId } from '../utils/getPoolId';

interface PositionCardProps {
    position: ProtocolPosition;
    index: number;
    chainKey: string;
    chainId: number;
}

const POSITION_MANAGER_ADDRESS = '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.ankr.com/eth';

// Updated ABI to match the packed return data for info
const ABI = [
    'function getPoolAndPositionInfo(uint256 tokenId) external view returns (tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bytes32 positionInfo)',
    'function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'
];

export default function PositionCard({ position, index, chainKey, chainId }: PositionCardProps) {
    const [poolId, setPoolId] = useState<string>('Loading...');
    const [ticks, setTicks] = useState<{ lower: number; upper: number } | null>(null);
    const [prices, setPrices] = useState<{ lower: string; upper: string } | null>(null);
    const [currentPrice, setCurrentPrice] = useState<string | null>(null);
    const [currentTick, setCurrentTick] = useState<number | null>(null);
    const [inRange, setInRange] = useState<boolean | null>(null);

    useEffect(() => {
        async function fetchPositionData() {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const v4Position = position as any;
                // Assuming the position name contains the tokenId, e.g., "#123"
                const tokenId = v4Position.name.replace('#', '');

                if (!tokenId || isNaN(Number(tokenId))) {
                    setPoolId('Invalid Token ID');
                    return;
                }

                const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
                const contract = new ethers.Contract(POSITION_MANAGER_ADDRESS, ABI, provider);

                const result = await contract.getPoolAndPositionInfo(tokenId);
                const poolKey = result.poolKey;
                const positionInfo = ethers.BigNumber.from(result.positionInfo);
                console.log('Debug PositionInfo:', {
                    hex: positionInfo.toHexString(),
                    tickLower24: positionInfo.shr(128).mask(24).toNumber(),
                    tickUpper24: positionInfo.shr(152).mask(24).toNumber()
                });

                // Unpack PositionInfo
                // Layout: liquidity (128 bits), tickLower (24 bits), tickUpper (24 bits)
                // Note: This layout is an assumption based on common packing.
                // We might need to adjust if the values look wrong.

                const tickLower24 = positionInfo.shr(128).mask(24).toNumber();
                const tickUpper24 = positionInfo.shr(152).mask(24).toNumber();

                // Convert to signed 24-bit integers
                const parseTick = (tick: number) => {
                    if (tick & 0x800000) {
                        return tick - 0x1000000;
                    }
                    return tick;
                };

                const tickLower = parseTick(tickLower24);
                const tickUpper = parseTick(tickUpper24);

                console.log('Debug Ticks:', { tickLower, tickUpper });

                if (v4Position.assets && v4Position.assets.length >= 2 && chainId) {
                    const getCurrency = (address: string, asset: any) => {
                        if (address === '0x0000000000000000000000000000000000000000') {
                            return Ether.onChain(chainId);
                        }
                        return new Token(
                            chainId,
                            address,
                            parseInt(asset.decimal),
                            asset.symbol,
                            asset.name
                        );
                    };

                    const token0 = getCurrency(poolKey.currency0, v4Position.assets[0]);
                    const token1 = getCurrency(poolKey.currency1, v4Position.assets[1]);

                    console.log('Debug Pool Data:', {
                        token0: { address: token0.isNative ? 'NATIVE' : token0.address, decimals: token0.decimals, symbol: token0.symbol },
                        token1: { address: token1.isNative ? 'NATIVE' : token1.address, decimals: token1.decimals, symbol: token1.symbol },
                        fee: poolKey.fee,
                        tickSpacing: poolKey.tickSpacing,
                        hooks: poolKey.hooks
                    });

                    const calculatedPoolId = getPoolId(
                        token0,
                        token1,
                        Number(poolKey.fee),
                        Number(poolKey.tickSpacing),
                        poolKey.hooks
                    );
                    console.log('Debug Calculated PoolID:', calculatedPoolId);

                    setPoolId(calculatedPoolId);
                    setTicks({ lower: tickLower, upper: tickUpper });

                    // Calculate Price Range
                    let priceLowerVal = 0;
                    let priceUpperVal = 0;
                    try {
                        const priceLower = tickToPrice(token0, token1, tickLower);
                        const priceUpper = tickToPrice(token0, token1, tickUpper);
                        priceLowerVal = parseFloat(priceLower.toSignificant(6));
                        priceUpperVal = parseFloat(priceUpper.toSignificant(6));

                        setPrices({
                            lower: priceLower.toSignificant(6),
                            upper: priceUpper.toSignificant(6)
                        });
                    } catch (priceError) {
                        console.warn('Failed to calculate price range:', priceError);
                        setPrices(null);
                    }

                    // Calculate Current Price from Assets
                    if (v4Position.assets && v4Position.assets.length >= 2) {
                        const price0 = parseFloat(v4Position.assets[0].price);
                        const price1 = parseFloat(v4Position.assets[1].price);

                        if (price1 > 0) {
                            const currentPriceVal = price0 / price1;
                            setCurrentPrice(currentPriceVal.toPrecision(6));

                            // Calculate current tick
                            // tick = floor(log(price) / log(1.0001))
                            const currentTickVal = Math.floor(Math.log(currentPriceVal) / Math.log(1.0001));
                            setCurrentTick(currentTickVal);

                            // Check if in range using ticks
                            setInRange(currentTickVal >= tickLower && currentTickVal < tickUpper);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching position data:', error);
                setPoolId('Error');
            }
        }

        fetchPositionData();
    }, [position, chainId]);

    return (
        <div className="p-2 border border-gray-200 rounded-md bg-white">
            <p className="font-medium text-sm">Position {index + 1}: {position.assets?.[0].symbol}/{position.assets?.[1].symbol}</p>
            <p className="text-xs text-gray-500">Value: ${position.value}</p>

            <p className="font-medium text-sm truncate">
                NFT:{" "}
                <a
                    href={`https://opensea.io/item/${chainKey}/${position.poolAddress}/${position.name.replace('#', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                >{`${position.poolAddress}/${position.name.replace('#', '')}`}</a>
            </p>

            <p className="text-xs text-gray-500">
                Pool ID:{" "}
                <a
                    href={`https://app.uniswap.org/explore/pools/${chainKey}/${poolId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                >
                    {poolId}
                </a>
            </p>

            {ticks && (
                <p className="text-xs text-gray-500">
                    Tick range: ({ticks.lower}, {ticks.upper})
                </p>
            )}
            {prices && (
                <p className="text-xs text-gray-500">
                    Price range: ({prices.lower}, {prices.upper}) {position.assets?.[1].symbol} per {position.assets?.[0].symbol}
                </p>
            )}
            {currentPrice && (
                <div className="text-xs text-gray-500">
                    <p>Current Price: {currentPrice} {position.assets?.[1].symbol} per {position.assets?.[0].symbol}</p>

                    {currentTick !== null && ticks && (
                        <div className="mt-2">
                            <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`absolute top-0 bottom-0 w-2 rounded-full ${inRange ? 'bg-green-500' : 'bg-red-500'}`}
                                    style={{
                                        left: `${Math.max(0, Math.min(100, ((currentTick - ticks.lower) / (ticks.upper - ticks.lower)) * 100))}%`,
                                        transform: 'translateX(-50%)'
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                <span>{prices?.lower}</span>
                                <span>{prices?.upper}</span>
                            </div>
                        </div>
                    )}

                    <p className={`mt-1 ${inRange ? "text-green-600 font-medium" : "text-red-600 font-medium"}`}>
                        {inRange ? "✅ In Range" : "🚨 Out of Range"}
                    </p>
                </div>
            )}
        </div>
    );
}
