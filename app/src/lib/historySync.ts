// History live status: keep the History feed honest.
//
// The feed is built only from the app's own send records
// (store/history.ts). Each record is checked against the backend's
// /status endpoint, which reports waiting, depositing, pending,
// success or refund. Failure is NOT final: a send can still land or
// come back after a failure, so a failed check stays Pending and
// keeps being checked.
//
// Money that arrived without going through the app is NOT in this
// feed. There is no indexer behind it, and this file does not invent
// incoming sends. Only sends the app itself made are shown.

import { fetchStatus, type SendStatus } from './relay';
import { loadHistory, updateHistoryStatus, type HistoryEntry, type HistoryStatus } from '../store/history';

export type StatusFetcher = (requestId: string) => Promise<{ status: SendStatus }>;

/** Map a backend status onto a stored history status. Null means the
 *  record stays as it is (still on its way). */
export function historyStatusFor(backend: SendStatus): HistoryStatus | null {
  if (backend === 'success') return 'sent';
  if (backend === 'refund') return 'refunded';
  return null;
}

/** One pass over every unsettled send: ask the backend, update the
 *  store, return the fresh list. Never throws, and one send failing
 *  to check never blocks the others. */
export async function syncPendingHistory(
  fetchFn: StatusFetcher = fetchStatus,
): Promise<HistoryEntry[]> {
  const entries = await loadHistory();
  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    try {
      const res = await fetchFn(entry.requestId);
      const next = historyStatusFor(res.status);
      if (next) await updateHistoryStatus(entry.requestId, next);
    } catch {
      // A failed check leaves the send Pending; next pass retries.
    }
  }
  return loadHistory();
}

/** Keep polling unsettled sends until every one is settled, the
 *  timeout is reached, or the caller cancels. Calls onUpdate with
 *  the fresh list after each pass. Resolves true when nothing is
 *  left pending, false on timeout or cancel. */
export async function pollPendingHistory(opts: {
  fetchFn?: StatusFetcher;
  intervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (entries: HistoryEntry[]) => void;
  isCancelled?: () => boolean;
} = {}): Promise<boolean> {
  const fetchFn = opts.fetchFn ?? fetchStatus;
  const intervalMs = opts.intervalMs ?? 15000;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  for (;;) {
    if (opts.isCancelled?.()) return false;
    const entries = await syncPendingHistory(fetchFn);
    opts.onUpdate?.(entries);
    if (!entries.some((e) => e.status === 'pending')) return true;
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
