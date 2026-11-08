// A signer built on viem, the same stack the Prime Way app uses.
//
// This module is optional: viem is a peer dependency. Import it only
// when you already use viem. The SDK core never imports viem.

import {
  createWalletClient,
  http,
  type Account,
  type Chain,
  type WalletClient,
} from 'viem';
import { arbitrum, base, bsc, mainnet, optimism, polygon, avalanche } from 'viem/chains';
import { chainById } from './chains.js';
import type { Signer, StepTx } from './signer.js';

const VIEM_CHAINS: Record<number, Chain> = {
  56: bsc,
  8453: base,
  42161: arbitrum,
  1: mainnet,
  10: optimism,
  137: polygon,
  43114: avalanche,
};

/** Build a signer around a viem wallet client for one account. The
 *  client signs with a local key; the RPC URL comes from the chain
 *  map, so no extra config is needed. */
export function viemSigner(
  client: WalletClient,
  account: Account | `0x${string}`,
): Signer {
  const address =
    typeof account === 'string' ? account : account.address;
  return {
    address,
    async sendTransaction(tx: StepTx): Promise<`0x${string}`> {
      const viemChain = VIEM_CHAINS[tx.chainId];
      if (!viemChain) throw new Error(`unsupported chain ${tx.chainId}`);
      return client.sendTransaction({
        account: account as never,
        chain: viemChain,
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value || '0'),
      } as never);
    },
  };
}

/** A viem wallet client for an account that signs with a local key.
 *  One client per chain: pass the chain the steps run on. */
export function localWalletClient(
  account: Account,
  chainId: number,
): WalletClient {
  const chain = chainById(chainId);
  const viemChain = VIEM_CHAINS[chainId];
  if (!chain || !viemChain) throw new Error(`unsupported chain ${chainId}`);
  return createWalletClient({
    account,
    chain: viemChain,
    transport: http(chain.rpc),
  });
}
