// App settings on the device: theme and the send PIN.
// The PIN is stored as a SHA-256 hash, never in plain text.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export type ThemeChoice = 'system' | 'light' | 'dark';

const THEME_KEY = 'primeway.theme.v1';
const PIN_KEY = 'primeway.pin.v1';

export async function loadThemeChoice(): Promise<ThemeChoice> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // fall through
  }
  return 'system';
}

export async function saveThemeChoice(choice: ThemeChoice): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, choice);
}

export async function pinIsSet(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  return !!raw;
}

export async function setPin(pin: string): Promise<void> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `primeway-pin:${pin}`,
  );
  await SecureStore.setItemAsync(PIN_KEY, hash);
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `primeway-pin:${pin}`,
  );
  return hash === stored;
}

export async function removePin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}
