// Send history, kept on the device. Only real sends are recorded:
// a send is added when its deposit goes out, then its status is
// updated as the backend reports it.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type HistoryStatus = 'pending' | 'sent' | 'refunded' | 'failed';

export interface HistoryEntry {
  requestId: string;
  toName: string;
  toNetwork: string;
  /** Recipient address, recorded from 2026-11-08 so Confirm can tell
   *  whether an address has been sent to before. Older entries do
   *  not have it. Never logged anywhere else. */
  toAddress?: `0x${string}`;
  usd: number;
  received: string;
  receiveSymbol: string;
  status: HistoryStatus;
  date: number;
  depositTx?: string;
  /** Approval tx hash, kept when a send stopped after its approval
   *  went out: the approval is still open, and this is the record
   *  of it. */
  approveTx?: string;
}

const KEY = 'primeway.history.v1';

let cache: HistoryEntry[] | null = null;

export async function loadHistory(): Promise<HistoryEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const list = await loadHistory();
  cache = [entry, ...list.filter((e) => e.requestId !== entry.requestId)];
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
}

export async function updateHistoryStatus(
  requestId: string,
  status: HistoryStatus,
  received?: string,
): Promise<void> {
  const list = await loadHistory();
  cache = list.map((e) =>
    e.requestId === requestId
      ? { ...e, status, received: received ?? e.received }
      : e,
  );
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
}
