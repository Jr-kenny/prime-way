// Chains and tokens Prime Way supports.
//
// Token addresses were checked against Relay's own /chains list on
// 2026-11-08. RPCs are public endpoints that need no API key. The app
// never sends a token it cannot look up here.

import { base, arbitrum, mainnet, optimism, polygon, avalanche, bsc } from 'viem/chains';
import type { Chain } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export interface TokenInfo {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  native: boolean;
  coingeckoId: string;
}

export interface SupportedChain {
  id: number;
  name: string;
  coin: string;
  color: string;
  viemChain: Chain;
  rpc: string;
  tokens: TokenInfo[];
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    id: 56,
    name: 'BNB Chain',
    coin: 'BNB',
    color: '#D9A40F',
    viemChain: bsc,
    rpc: 'https://bsc-dataseed.binance.org',
    tokens: [
      { symbol: 'BNB', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'binancecoin' },
      { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 8453,
    name: 'Base',
    coin: 'ETH',
    color: '#2E6BE6',
    viemChain: base,
    rpc: 'https://mainnet.base.org',
    tokens: [
      { symbol: 'ETH', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'ethereum' },
      { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', decimals: 6, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 42161,
    name: 'Arbitrum',
    coin: 'ETH',
    color: '#3E7CB1',
    viemChain: arbitrum,
    rpc: 'https://arb1.arbitrum.io/rpc',
    tokens: [
      { symbol: 'ETH', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'ethereum' },
      { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 1,
    name: 'Ethereum',
    coin: 'ETH',
    color: '#627EEA',
    viemChain: mainnet,
    rpc: 'https://eth.llamarpc.com',
    tokens: [
      { symbol: 'ETH', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'ethereum' },
      { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 10,
    name: 'Optimism',
    coin: 'ETH',
    color: '#E0332B',
    viemChain: optimism,
    rpc: 'https://mainnet.optimism.io',
    tokens: [
      { symbol: 'ETH', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'ethereum' },
      { symbol: 'USDC', address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 137,
    name: 'Polygon',
    coin: 'POL',
    color: '#8B5CF6',
    viemChain: polygon,
    rpc: 'https://polygon-rpc.com',
    tokens: [
      { symbol: 'POL', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'matic-network' },
      { symbol: 'USDC', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6, native: false, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6, native: false, coingeckoId: 'tether' },
    ],
  },
  {
    id: 43114,
    name: 'Avalanche',
    coin: 'AVAX',
    color: '#D64545',
    viemChain: avalanche,
    rpc: 'https://api.avax.network/ext/bc/C/rpc',
    tokens: [
      { symbol: 'AVAX', address: ZERO_ADDRESS, decimals: 18, native: true, coingeckoId: 'avalanche-2' },
      { symbol: 'USDC', address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', decimals: 6, native: false, coingeckoId: 'usd-coin' },
    ],
  },
];

export function chainById(id: number): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}

/** Where money goes when the user sends to someone. The app picks
 *  the route and never asks the user: every address works on Base,
 *  so Base is the destination for every send, to a saved person or
 *  to yourself. */
export const DEFAULT_DESTINATION_CHAIN_ID = 8453;
export const DEFAULT_DESTINATION_CHAIN_NAME = 'Base';

export function chainByName(name: string): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.name === name);
}

export function tokenOn(chainId: number, symbol: string): TokenInfo | undefined {
  return chainById(chainId)?.tokens.find((t) => t.symbol === symbol);
}

/** What someone can receive on a chain. USDC first, always. DAI is not offered. */
export const RECEIVE_SYMBOLS = ['USDC', 'USDT', 'ETH'] as const;
export type ReceiveSymbol = (typeof RECEIVE_SYMBOLS)[number];
