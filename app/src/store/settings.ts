// App settings on the device: theme and the send PIN.
// The PIN is stored as a SHA-256 hash, never in plain text, one
// hash per wallet. A PIN saved before per-wallet PINs existed lives
// under the old single key; it is honoured as that wallet's PIN
// until the wallet gets its own, so nobody is locked out by the
// upgrade.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export type ThemeChoice = 'system' | 'light' | 'dark' | 'charcoal';

const THEME_KEY = 'primeway.theme.v1';
const PIN_KEY = 'primeway.pin.v1';

function pinKey(walletId?: string | null): string {
  return walletId ? `primeway.pin.${walletId}` : PIN_KEY;
}

export async function loadThemeChoice(): Promise<ThemeChoice> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'charcoal' || raw === 'system') return raw;
  } catch {
    // fall through
  }
  return 'system';
}

export async function saveThemeChoice(choice: ThemeChoice): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, choice);
}

export async function pinIsSet(walletId?: string | null): Promise<boolean> {
  const own = await SecureStore.getItemAsync(pinKey(walletId));
  if (own) return true;
  if (walletId) {
    const legacy = await SecureStore.getItemAsync(PIN_KEY);
    return !!legacy;
  }
  return false;
}

export async function setPin(pin: string, walletId?: string | null): Promise<void> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `primeway-pin:${pin}`,
  );
  await SecureStore.setItemAsync(pinKey(walletId), hash);
}

export async function checkPin(pin: string, walletId?: string | null): Promise<boolean> {
  const stored =
    (await SecureStore.getItemAsync(pinKey(walletId))) ??
    (walletId ? await SecureStore.getItemAsync(PIN_KEY) : null);
  if (!stored) return false;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `primeway-pin:${pin}`,
  );
  return hash === stored;
}

export async function removePin(walletId?: string | null): Promise<void> {
  await SecureStore.deleteItemAsync(pinKey(walletId));
  if (walletId) await SecureStore.deleteItemAsync(PIN_KEY);
}
