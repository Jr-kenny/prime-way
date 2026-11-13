// Wallet layer, multi-wallet.
//
// Every wallet is one entry in a list, with an active one. Each
// wallet has an id, a label ("Account 1", "Account 2", ...), a
// source, an address, and, for imported wallets, a secret kept in
// the device's secure store under its own per-wallet key. Privy
// holds at most one wallet: the embedded wallet, which has no
// secret on this phone. Imported wallets are unlimited in practice.
//
// Sources:
//  1. Privy: email login, Privy makes the wallet. Needs a Privy App
//     ID (EXPO_PUBLIC_PRIVY_APP_ID). When it is not set, the Privy
//     screens say so and the other paths still work.
//  2. Imported key: paste a 64-hex private key.
//  3. Imported phrase: paste a 12 or 24 word recovery phrase.
//     It derives the default account, m/44'/60'/0'/0/0, and that
//     path is recorded on the wallet.
//  4. Created phrase: a fresh 12-word phrase made in the app, same
//     derivation and recorded path.
//
// A Solana address is watch-only: a public address the user pastes,
// stored in AsyncStorage (it is not a secret), used only to show
// Solana balances. Prime Way holds no Solana key.
//
// Migration: a wallet imported by an older single-wallet version
// (one SecureStore blob, primeway.importedWallet) is imported as
// Account 1 on first run and the old blob is deleted. Nothing is
// lost.
//
// The app never holds a key in plain JS memory longer than needed,
// and never writes one to a log, a file, or the network.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  createWalletClient,
  custom,
  http,
  getAddress,
  type Account,
  type WalletClient,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { PrivyProvider, useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID, PRIVY_READY } from '../config';
import { chainById } from '../lib/chains';
import { isSolanaAddress } from '../lib/solana';

export type WalletSource = 'privy' | 'imported-key' | 'imported-mnemonic';

export interface StoredWallet {
  id: string;
  label: string;
  source: WalletSource;
  address: `0x${string}`;
  /** Derivation path for phrase wallets; null otherwise. */
  hdPath: string | null;
  createdAt: number;
}

export interface WalletState {
  /** All wallets, in creation order. */
  wallets: StoredWallet[];
  /** Id of the active wallet, or null when there is none. */
  activeId: string | null;
  /** The active wallet, or null when there is none. */
  activeWallet: StoredWallet | null;
  /** The active wallet's address, or null when there is none. */
  address: `0x${string}` | null;
  source: WalletSource | null;
  /** True when Privy is configured (App ID set). */
  privyReady: boolean;
  /** True when the Privy SDK has finished starting up. */
  privyStarted: boolean;
  /** True when a Privy user is signed in. */
  privySignedIn: boolean;
  setActiveWallet: (id: string) => Promise<void>;
  renameWallet: (id: string, label: string) => Promise<void>;
  /** Save an imported key or phrase as a new wallet. Throws on bad input. */
  importWallet: (kind: 'key' | 'mnemonic', secret: string) => Promise<StoredWallet>;
  /** Delete one wallet only. Privy sign-out happens when the Privy wallet is deleted. */
  deleteWallet: (id: string) => Promise<void>;
  /** Forget the Privy session (and drop the Privy wallet). Imported wallets stay. */
  logout: () => Promise<void>;
  /** Build a viem wallet client for a chain, for the active wallet (or one given). */
  getWalletClient: (chainId: number, walletId?: string) => Promise<WalletClient | null>;
  /** The address Privy knows about, when signed in. */
  privyAddress: `0x${string}` | null;
  /** Watch-only Solana address, or null when none is set. */
  solanaAddress: string | null;
  setSolanaAddress: (address: string | null) => Promise<void>;
  /** The secret of one imported wallet, for the Export screen only. */
  getWalletSecret: (id: string) => Promise<{ kind: 'key' | 'mnemonic'; secret: string } | null>;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

export const DEFAULT_HD_PATH = "m/44'/60'/0'/0/0";

const WALLETS_KEY = 'primeway.wallets.v1';
const ACTIVE_KEY = 'primeway.activeWallet.v1';
const SOLANA_KEY = 'primeway.solanaAddress.v1';
const LEGACY_IMPORTED_KEY = 'primeway.importedWallet';

function secretKey(id: string): string {
  return `primeway.wallet.${id}.secret`;
}

export interface ImportedWallet {
  kind: 'key' | 'mnemonic';
  secret: string;
}

/** Read one imported wallet's secret, for the Export screen only. */
export async function getImportedSecret(
  id?: string | null,
): Promise<ImportedWallet | null> {
  if (!id) {
    try {
      const raw = await SecureStore.getItemAsync(LEGACY_IMPORTED_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ImportedWallet;
    } catch {
      return null;
    }
  }
  try {
    const raw = await SecureStore.getItemAsync(secretKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as ImportedWallet;
  } catch {
    return null;
  }
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

function nextLabel(wallets: StoredWallet[]): string {
  return `Account ${wallets.length + 1}`;
}

function newId(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
}

async function loadWalletList(): Promise<StoredWallet[]> {
  try {
    const raw = await AsyncStorage.getItem(WALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredWallet[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w) =>
        w &&
        typeof w.id === 'string' &&
        typeof w.address === 'string' &&
        w.address.startsWith('0x'),
    );
  } catch {
    return [];
  }
}

async function saveWalletList(list: StoredWallet[]): Promise<void> {
  await AsyncStorage.setItem(WALLETS_KEY, JSON.stringify(list));
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
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [solanaAddress, setSolanaAddressState] = useState<string | null>(null);
  const walletsRef = useRef<StoredWallet[]>([]);
  walletsRef.current = wallets;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const privyRef = useRef(privy);
  privyRef.current = privy;

  // First run: load the list, migrate the old single-wallet blob,
  // and restore the active wallet and the Solana watch address.
  useEffect(() => {
    (async () => {
      let list = await loadWalletList();
      try {
        const legacyRaw = await SecureStore.getItemAsync(LEGACY_IMPORTED_KEY);
        if (legacyRaw && list.length === 0) {
          const legacy = JSON.parse(legacyRaw) as ImportedWallet;
          if (legacy && (legacy.kind === 'key' || legacy.kind === 'mnemonic')) {
            try {
              const account = accountFromImported(legacy);
              const wallet: StoredWallet = {
                id: newId(),
                label: 'Account 1',
                source: legacy.kind === 'key' ? 'imported-key' : 'imported-mnemonic',
                address: getAddress(account.address),
                hdPath: legacy.kind === 'mnemonic' ? DEFAULT_HD_PATH : null,
                createdAt: Date.now(),
              };
              await SecureStore.setItemAsync(
                secretKey(wallet.id),
                JSON.stringify(legacy),
              );
              list = [wallet];
              await saveWalletList(list);
            } catch {
              // A corrupt legacy blob is dropped, never crash on it.
            }
          }
          await SecureStore.deleteItemAsync(LEGACY_IMPORTED_KEY);
        } else if (legacyRaw) {
          await SecureStore.deleteItemAsync(LEGACY_IMPORTED_KEY);
        }
      } catch {
        // Migration is best-effort; the list still loads.
      }
      setWallets(list);
      walletsRef.current = list;
      const savedActive = await AsyncStorage.getItem(ACTIVE_KEY);
      const active =
        savedActive && list.some((w) => w.id === savedActive)
          ? savedActive
          : (list[0]?.id ?? null);
      setActiveIdState(active);
      activeIdRef.current = active;
      const sol = await AsyncStorage.getItem(SOLANA_KEY);
      if (sol && isSolanaAddress(sol)) setSolanaAddressState(sol);
      setLoaded(true);
    })();
  }, []);

  // Keep the Privy wallet in the list while Privy is signed in.
  // It is the one wallet with no secret on this phone.
  useEffect(() => {
    if (!loaded) return;
    const embedded = privy?.embeddedAddress;
    if (!embedded) return;
    const list = walletsRef.current;
    if (list.some((w) => w.source === 'privy')) return;
    const wallet: StoredWallet = {
      id: 'privy',
      label: nextLabel(list),
      source: 'privy',
      address: getAddress(embedded),
      hdPath: null,
      createdAt: Date.now(),
    };
    const next = [...list, wallet];
    walletsRef.current = next;
    setWallets(next);
    void saveWalletList(next);
    if (!activeIdRef.current) {
      activeIdRef.current = wallet.id;
      setActiveIdState(wallet.id);
      void AsyncStorage.setItem(ACTIVE_KEY, wallet.id);
    }
  }, [privy?.embeddedAddress, loaded]);

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeId) ?? null,
    [wallets, activeId],
  );
  const address = activeWallet?.address ?? null;
  const source = activeWallet?.source ?? null;

  const setActiveWallet = useCallback(async (id: string) => {
    if (!walletsRef.current.some((w) => w.id === id)) return;
    activeIdRef.current = id;
    setActiveIdState(id);
    await AsyncStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const renameWallet = useCallback(async (id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const next = walletsRef.current.map((w) =>
      w.id === id ? { ...w, label: trimmed } : w,
    );
    walletsRef.current = next;
    setWallets(next);
    await saveWalletList(next);
  }, []);

  const importWallet = useCallback(
    async (kind: 'key' | 'mnemonic', secret: string): Promise<StoredWallet> => {
      const trimmed = secret.trim();
      if (!trimmed) throw new Error('Nothing pasted yet.');
      // Validate before saving anything.
      const account = accountFromImported({ kind, secret: trimmed });
      const wallet: StoredWallet = {
        id: newId(),
        label: nextLabel(walletsRef.current),
        source: kind === 'key' ? 'imported-key' : 'imported-mnemonic',
        address: getAddress(account.address),
        hdPath: kind === 'mnemonic' ? DEFAULT_HD_PATH : null,
        createdAt: Date.now(),
      };
      await SecureStore.setItemAsync(
        secretKey(wallet.id),
        JSON.stringify({ kind, secret: trimmed }),
      );
      const next = [...walletsRef.current, wallet];
      walletsRef.current = next;
      setWallets(next);
      await saveWalletList(next);
      await setActiveWallet(wallet.id);
      return wallet;
    },
    [setActiveWallet],
  );

  const getWalletSecret = useCallback(async (id: string) => {
    return getImportedSecret(id);
  }, []);

  const deleteWallet = useCallback(async (id: string) => {
    const wallet = walletsRef.current.find((w) => w.id === id);
    if (!wallet) return;
    if (wallet.source === 'imported-key' || wallet.source === 'imported-mnemonic') {
      await SecureStore.deleteItemAsync(secretKey(id));
    }
    if (wallet.source === 'privy' && privyRef.current) {
      try {
        await privyRef.current.logout();
      } catch {
        // Signing out failing must not block removing the wallet.
      }
    }
    const next = walletsRef.current.filter((w) => w.id !== id);
    walletsRef.current = next;
    setWallets(next);
    await saveWalletList(next);
    if (activeIdRef.current === id) {
      const nextActive = next[0]?.id ?? null;
      activeIdRef.current = nextActive;
      setActiveIdState(nextActive);
      if (nextActive) await AsyncStorage.setItem(ACTIVE_KEY, nextActive);
      else await AsyncStorage.removeItem(ACTIVE_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    const privyWallet = walletsRef.current.find((w) => w.source === 'privy');
    if (privyWallet) {
      await deleteWallet(privyWallet.id);
      return;
    }
    if (privyRef.current) {
      try {
        await privyRef.current.logout();
      } catch {
        // Nothing to sign out of.
      }
    }
  }, [deleteWallet]);

  const getWalletClient = useCallback(
    async (chainId: number, walletId?: string): Promise<WalletClient | null> => {
      const chain = chainById(chainId);
      if (!chain) return null;
      const target =
        walletsRef.current.find((w) => w.id === (walletId ?? activeIdRef.current)) ??
        null;
      if (!target) return null;
      if (target.source === 'privy') {
        if (!privyRef.current?.embeddedProvider || !privyRef.current.embeddedAddress) {
          return null;
        }
        const provider = (await privyRef.current.embeddedProvider()) as never;
        return createWalletClient({
          account: target.address,
          chain: chain.viemChain,
          transport: custom(provider),
        });
      }
      try {
        const secret = await getImportedSecret(target.id);
        if (!secret) return null;
        const account = accountFromImported(secret);
        return createWalletClient({
          account,
          chain: chain.viemChain,
          transport: http(chain.rpc),
        });
      } catch {
        return null;
      }
    },
    [],
  );

  const setSolanaAddress = useCallback(async (address: string | null) => {
    if (address !== null && !isSolanaAddress(address)) {
      throw new Error('That does not look like a Solana address.');
    }
    if (address) await AsyncStorage.setItem(SOLANA_KEY, address.trim());
    else await AsyncStorage.removeItem(SOLANA_KEY);
    setSolanaAddressState(address ? address.trim() : null);
  }, []);

  const value: WalletState = {
    wallets,
    activeId,
    activeWallet,
    address,
    source,
    privyReady: PRIVY_READY,
    privyStarted: privy ? privy.isReady : loaded,
    privySignedIn: !!privy?.user,
    setActiveWallet,
    renameWallet,
    importWallet,
    deleteWallet,
    logout,
    getWalletClient,
    privyAddress: privy?.embeddedAddress ?? null,
    solanaAddress,
    setSolanaAddress,
    getWalletSecret,
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
