import { useCallback, useEffect, useState } from "react";
import { useDisconnect } from "wagmi";
import { fetchRelayHistory, fetchStatus, type HistoryEntry } from "../lib/relay";
import {
  isTerminalStatus,
  loadLocalHistory,
  mergeHistory,
  statusLabel,
  updateLocalStatus,
} from "../lib/history";
import type { Chain } from "../lib/relay";
import type { ConnectedWallet } from "../lib/wallet";

export function Activity({
  chains,
  refreshSignal,
  wallet,
}: {
  chains: Chain[];
  refreshSignal: number;
  wallet: ConnectedWallet | null;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [relayAvailable, setRelayAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const { disconnect } = useDisconnect();

  const load = useCallback(async () => {
    const local = loadLocalHistory();
    if (!wallet) {
      setEntries(local);
      setRelayAvailable(null);
      return;
    }
    setLoading(true);
    try {
      const relay = await fetchRelayHistory(wallet.address, 25);
      setRelayAvailable(true);
      setEntries(mergeHistory(relay, local));
    } catch {
      // Relay history needs the server key; local records are the
      // fallback and are still real sends from this browser.
      setRelayAvailable(false);
      setEntries(local);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Refresh the status of open entries live from Relay.
  useEffect(() => {
    const open = entries.filter((e) => !isTerminalStatus(e.status));
    if (open.length === 0) return;
    const timer = setInterval(async () => {
      let changed = false;
      for (const e of open) {
        try {
          const s = await fetchStatus(e.requestId);
          if (s.status && s.status !== e.status) {
            updateLocalStatus(e.requestId, s.status, s.txHashes || [], null);
            changed = true;
          }
        } catch {
          // Keep the last known status.
        }
      }
      if (changed) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [entries, load]);

  if (!wallet) {
    return (
      <section aria-label="Activity" className="activity-card">
        <h2>Activity</h2>
        <p>
          Connect your wallet to see bridges made through this app. Sends
          are recorded with their Relay request ID and their status is
          checked live — nothing here is invented.
        </p>
        {entries.length > 0 ? (
          <HistoryList chains={chains} entries={entries} />
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Activity" className="activity-card">
      <div className="activity-head">
        <h2>Activity</h2>
        <span>
          <button className="text-button" onClick={load} type="button">
            Refresh
          </button>{" "}
          <button className="text-button" onClick={() => disconnect()} type="button">
            Disconnect
          </button>
        </span>
      </div>
      <p className="activity-note">
        {relayAvailable === true
          ? "From Relay, for this wallet — the same record the Prime Way App sees in the Relay dashboard."
          : relayAvailable === false
            ? "Relay history is unavailable from this server right now, so this list shows sends recorded in this browser. Statuses are still checked live."
            : "Loading…"}
      </p>
      {loading && entries.length === 0 ? (
        <p className="empty-note">Loading activity…</p>
      ) : entries.length === 0 ? (
        <p className="empty-note">
          No bridges yet. Your first bridge through this app will appear
          here with its real status.
        </p>
      ) : (
        <HistoryList chains={chains} entries={entries} />
      )}
    </section>
  );
}

function HistoryList({
  chains,
  entries,
}: {
  chains: Chain[];
  entries: HistoryEntry[];
}) {
  const chainName = (id: number) =>
    chains.find((c) => c.id === id)?.displayName || `Chain ${id}`;
  const explorerFor = (id: number) =>
    chains.find((c) => c.id === id)?.explorerUrl || "";
  return (
    <ul className="history-list">
      {entries.map((e) => {
        const explorer = explorerFor(e.originChainId);
        const hash = e.txHashes[0];
        return (
          <li key={e.requestId} className="history-row">
            <div className="history-main">
              <span className="history-amount">
                {e.amountIn} {e.originSymbol} →{" "}
                {e.amountOut ? `${e.amountOut} ` : ""}
                {e.destinationSymbol}
              </span>
              <span className="history-route">
                {chainName(e.originChainId)} →{" "}
                {chainName(e.destinationChainId)}
              </span>
              <span className="history-meta">
                {new Date(e.createdAt).toLocaleString()} ·{" "}
                {hash && explorer ? (
                  <a
                    href={`${explorer.replace(/\/+$/, "")}/tx/${hash}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {hash.slice(0, 10)}…
                  </a>
                ) : (
                  <code>{e.requestId.slice(0, 10)}…</code>
                )}
              </span>
            </div>
            <span
              className={`status-pill status-${e.status}`}
            >
              {statusLabel(e.status)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
