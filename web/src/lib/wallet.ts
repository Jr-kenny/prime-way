// Wallet reads and transaction sending.
//
// Connection itself is wagmi (see ./wagmi.ts): injected browser
// wallets and Coinbase Wallet. This module only does the on-chain
// work the bridge needs, and never touches window.ethereum directly.
//
// Balances and allowances are read through the chain's public RPC
// URL supplied by Relay (httpRpcUrl), never invented. Transactions
// are sent through the wagmi wallet client, so the user signs in
// their own wallet. Private keys and seed phrases are never asked
// for, received, or stored.

import {
  createPublicClient,
  defineChain,
  erc20Abi,
  http,
  type Address,
  type Chain as ViemChain,
  type PublicClient,
  type WalletClient,
} from "viem";
import type { Connector } from "wagmi";
import type { Chain, QuoteStepTx } from "./relay";

export interface ConnectedWallet {
  address: Address;
  chainId: number;
  connectorName: string;
}

export function toViemChain(chain: Chain): ViemChain {
  return defineChain({
    blockExplorers: chain.explorerUrl
      ? { default: { name: chain.displayName, url: chain.explorerUrl } }
      : undefined,
    id: chain.id,
    name: chain.displayName,
    nativeCurrency: {
      decimals: chain.nativeCurrency.decimals,
      name: chain.nativeCurrency.symbol,
      symbol: chain.nativeCurrency.symbol,
    },
    rpcUrls: {
      default: { http: [chain.rpcUrl || ""] },
    },
  });
}

export function getPublicClient(chain: Chain): PublicClient {
  return createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl),
  });
}

/**
 * Ask the wallet to move to `chain`. Uses wagmi's chain switch when
 * the chain is in the wagmi config; for Relay chains outside that
 * config it falls back to the wallet's own switch/add-chain prompts
 * through the active connector's provider. Throws when the user
 * rejects.
 */
export async function switchToChain(
  chain: Chain,
  switchChainAsync: (args: { chainId: number }) => Promise<unknown>,
  connector?: Connector | null,
): Promise<void> {
  try {
    await switchChainAsync({ chainId: chain.id });
    return;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name !== "ChainNotConfiguredError" || !connector) throw err;
  }
  const provider = (await connector.getProvider()) as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chain.id.toString(16)}` }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: chain.explorerUrl ? [chain.explorerUrl] : [],
          chainId: `0x${chain.id.toString(16)}`,
          chainName: chain.displayName,
          nativeCurrency: {
            decimals: chain.nativeCurrency.decimals,
            name: chain.nativeCurrency.symbol,
            symbol: chain.nativeCurrency.symbol,
          },
          rpcUrls: chain.rpcUrl ? [chain.rpcUrl] : [],
        },
      ],
    });
  }
}

export async function getNativeBalance(
  chain: Chain,
  address: Address,
): Promise<bigint> {
  const client = getPublicClient(chain);
  return client.getBalance({ address });
}

export async function getTokenBalance(
  chain: Chain,
  tokenAddress: Address,
  owner: Address,
): Promise<bigint> {
  const client = getPublicClient(chain);
  return client.readContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [owner],
    functionName: "balanceOf",
  });
}

export async function getTokenAllowance(
  chain: Chain,
  tokenAddress: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  const client = getPublicClient(chain);
  return client.readContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [owner, spender],
    functionName: "allowance",
  });
}

/** Fetch balances for several ERC20 tokens in one multicall where the
 *  chain supports it; falls back to single reads. Native balances are
 *  read individually. Returns a map token address (lowercase) -> raw. */
export async function getTokenBalances(
  chain: Chain,
  tokenAddresses: Address[],
  owner: Address,
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const client = getPublicClient(chain);
  try {
    const results = await client.multicall({
      contracts: tokenAddresses.map((address) => ({
        abi: erc20Abi,
        address,
        args: [owner],
        functionName: "balanceOf",
      })),
    });
    results.forEach((r, i) => {
      if (r.status === "success") {
        out.set(tokenAddresses[i].toLowerCase(), r.result as bigint);
      }
    });
    return out;
  } catch {
    for (const address of tokenAddresses) {
      try {
        const v = await getTokenBalance(chain, address, owner);
        out.set(address.toLowerCase(), v);
      } catch {
        // Leave unknown; the UI shows a dash rather than a wrong zero.
      }
    }
    return out;
  }
}

/** Send one Relay quote step transaction through the connected
 *  wallet (wagmi wallet client). Gas fields from the quote are
 *  passed through when present so the wallet proposes the same
 *  execution Relay priced. Returns the transaction hash. */
export async function sendStepTransaction(
  chain: Chain,
  tx: QuoteStepTx,
  account: Address,
  walletClient: WalletClient,
): Promise<string> {
  const hash = await walletClient.sendTransaction({
    account,
    chain: toViemChain(chain),
    data: tx.data as `0x${string}`,
    gas: tx.gas ? BigInt(tx.gas) : undefined,
    maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigInt(tx.maxPriorityFeePerGas)
      : undefined,
    to: tx.to as Address,
    value: BigInt(tx.value || "0"),
  });
  return hash;
}

export async function waitForReceipt(
  chain: Chain,
  hash: string,
  timeoutMs = 120_000,
): Promise<{ status: "success" | "reverted" }> {
  const client = getPublicClient(chain);
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    timeout: timeoutMs,
  });
  return { status: receipt.status };
}

export function explorerTxUrl(chain: Chain, hash: string): string {
  if (!chain.explorerUrl) return "";
  return `${chain.explorerUrl.replace(/\/+$/, "")}/tx/${hash}`;
}
