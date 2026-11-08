// Wallet layer.
//
// Two ways to have a wallet in Prime Way:
//  1. Privy: Google login, Privy makes the wallet. Needs a Privy App ID
//     (EXPO_PUBLIC_PRIVY_APP_ID). When it is not set, the Privy screens
//     say so and the imported-wallet path still works.
//  2. Imported: paste a private key or a seed phrase. It is kept in the
//     device's secure store and never leaves the phone.
//
// The app never holds a key in plain JS memory longer than needed, and
// never writes one to a log, a file, or the network.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  createWalletClient,
  custom,
  http,
  type Account,
  type WalletClient,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { PrivyProvider, useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID, PRIVY_READY } from '../config';
import { chainById } from '../lib/chains';

export type WalletSource = 'privy' | 'imported';

export interface WalletState {
  /** The connected address, or null when there is no wallet yet. */
  address: `0x${string}` | null;
  source: WalletSource | null;
  /** True when Privy is configured (App ID set). */
  privyReady: boolean;
  /** True when the Privy SDK has finished starting up. */
  privyStarted: boolean;
  /** True when a Privy user is signed in. */
  privySignedIn: boolean;
  /** Build a viem wallet client for a chain, or null when no wallet. */
  getWalletClient: (chainId: number) => Promise<WalletClient | null>;
  /** Forget the current wallet (Privy sign out, or clear the import). */
  logout: () => Promise<void>;
  /** Save an imported key or phrase as the wallet. Throws on bad input. */
  importWallet: (kind: 'key' | 'mnemonic', secret: string) => Promise<void>;
  /** The address Privy knows about, when signed in. */
  privyAddress: `0x${string}` | null;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

const IMPORTED_KEY = 'primeway.importedWallet';

export interface ImportedWallet {
  kind: 'key' | 'mnemonic';
  secret: string;
}

/** Read the imported wallet's secret, for the Export screen only. */
export async function getImportedSecret(): Promise<ImportedWallet | null> {
  return loadImported();
}

function accountFromImported(w: ImportedWallet): Account {
  if (w.kind === 'key') {
    const key = w.secret.startsWith('0x')
      ? (w.secret as `0x${string}`)
      : (`0x${w.secret}` as `0x${string}`);
    return privateKeyToAccount(key);
  }
  return mnemonicToAccount(w.secret.trim().toLowerCase());
}

async function loadImported(): Promise<ImportedWallet | null> {
  try {
    const raw = await SecureStore.getItemAsync(IMPORTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportedWallet;
    if (!parsed || (parsed.kind !== 'key' && parsed.kind !== 'mnemonic')) return null;
    if (typeof parsed.secret !== 'string' || !parsed.secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Inner provider used when Privy is not configured, or as the child
 *  of PrivyProvider when it is. `privy` carries the live Privy state
 *  when available, or nulls when Privy is off. */
function WalletInner({
  children,
  privy,
}: {
  children: React.ReactNode;
  privy: {
    user: unknown;
    isReady: boolean;
    logout: () => Promise<void>;
    embeddedAddress: `0x${string}` | null;
    embeddedProvider: (() => Promise<unknown>) | null;
  } | null;
}) {
  const [imported, setImported] = useState<ImportedWallet | null>(null);
  const [importedLoaded, setImportedLoaded] = useState(false);
  const importedRef = useRef<ImportedWallet | null>(null);
  importedRef.current = imported;

  useEffect(() => {
    loadImported().then((w) => {
      setImported(w);
      setImportedLoaded(true);
    });
  }, []);

  const importedAddress = useMemo(() => {
    if (!imported) return null;
    try {
      return accountFromImported(imported).address;
    } catch {
      return null;
    }
  }, [imported]);

  // The imported wallet wins when both exist; Privy is the fallback.
  const address = importedAddress ?? privy?.embeddedAddress ?? null;
  const source: WalletSource | null = importedAddress
    ? 'imported'
    : privy?.embeddedAddress
      ? 'privy'
      : null;

  const getWalletClient = useCallback(
    async (chainId: number): Promise<WalletClient | null> => {
      const chain = chainById(chainId);
      if (!chain) return null;
      if (importedRef.current) {
        try {
          const account = accountFromImported(importedRef.current);
          return createWalletClient({
            account,
            chain: chain.viemChain,
            transport: http(chain.rpc),
          });
        } catch {
          return null;
        }
      }
      if (privy?.embeddedProvider && privy.embeddedAddress) {
        const provider = (await privy.embeddedProvider()) as never;
        return createWalletClient({
          account: privy.embeddedAddress,
          chain: chain.viemChain,
          transport: custom(provider),
        });
      }
      return null;
    },
    [privy],
  );

  const logout = useCallback(async () => {
    if (importedRef.current) {
      await SecureStore.deleteItemAsync(IMPORTED_KEY);
      setImported(null);
    }
    if (privy) await privy.logout();
  }, [privy]);

  const importWallet = useCallback(
    async (kind: 'key' | 'mnemonic', secret: string) => {
      const trimmed = secret.trim();
      if (!trimmed) throw new Error('Nothing pasted yet.');
      // Validate before saving anything.
      accountFromImported({ kind, secret: trimmed });
      const wallet: ImportedWallet = { kind, secret: trimmed };
      await SecureStore.setItemAsync(IMPORTED_KEY, JSON.stringify(wallet));
      setImported(wallet);
    },
    [],
  );

  const value: WalletState = {
    address,
    source,
    privyReady: PRIVY_READY,
    privyStarted: privy ? privy.isReady : importedLoaded,
    privySignedIn: !!privy?.user,
    getWalletClient,
    logout,
    importWallet,
    privyAddress: privy?.embeddedAddress ?? null,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** Reads the Privy embedded wallet and hands its live state to WalletInner. */
function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { user, isReady, logout } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
  const embedded = wallets[0] ?? null;
  const privy = useMemo(
    () => ({
      user,
      isReady,
      logout,
      embeddedAddress: (embedded?.address ?? null) as `0x${string}` | null,
      embeddedProvider: embedded ? () => embedded.getProvider() : null,
    }),
    [user, isReady, logout, embedded],
  );
  return <WalletInner privy={privy}>{children}</WalletInner>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!PRIVY_READY) {
    return <WalletInner privy={null}>{children}</WalletInner>;
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
