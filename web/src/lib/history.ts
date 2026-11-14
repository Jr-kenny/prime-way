// Local transaction records.
//
// Sends made through this app are recorded locally the moment the
// deposit transaction is submitted, with their Relay requestId. Their
// status is refreshed live from Relay, never invented. Relay's own
// history (Dashboard → Requests, attributed to the Prime Way App) is
// the cross-device record; the server's /requests endpoint serves it
// when the server runs with the Relay key.

import type { HistoryEntry } from "./relay";

const KEY = "prime-way-web.history.v1";
const MAX_RECORDS = 100;

export function loadLocalHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveLocalRecord(entry: HistoryEntry): void {
  const list = loadLocalHistory().filter(
    (e) => e.requestId.toLowerCase() !== entry.requestId.toLowerCase(),
  );
  list.unshift({ ...entry, source: "local" });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
  } catch {
    // Storage full or unavailable: history is a convenience, the
    // send itself is unaffected.
  }
}

export function updateLocalStatus(
  requestId: string,
  status: string,
  txHashes: string[],
  amountOut: string | null,
): void {
  const list = loadLocalHistory();
  const found = list.find(
    (e) => e.requestId.toLowerCase() === requestId.toLowerCase(),
  );
  if (!found) return;
  found.status = status;
  if (txHashes.length > 0) {
    found.txHashes = Array.from(new Set([...found.txHashes, ...txHashes]));
  }
  if (amountOut !== null) found.amountOut = amountOut;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors.
  }
}

/** Merge Relay history (server) with local records. Relay wins on
 *  status for the same requestId; local-only records are kept. */
export function mergeHistory(
  relayEntries: HistoryEntry[],
  localEntries: HistoryEntry[],
): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of localEntries) byId.set(e.requestId.toLowerCase(), e);
  for (const e of relayEntries) {
    const key = e.requestId.toLowerCase();
    const local = byId.get(key);
    byId.set(key, local ? { ...local, ...e, source: "relay" } : e);
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export const STATUS_LABELS: Record<string, string> = {
  depositing: "Depositing",
  failure: "Failed",
  pending: "In progress",
  refund: "Refunded",
  success: "Completed",
  waiting: "Waiting for deposit",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function isTerminalStatus(status: string): boolean {
  return status === "success" || status === "refund";
}
