import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { fetchChains, fetchHealth, shortAddress, type Chain } from "./lib/relay";
import type { ConnectedWallet } from "./lib/wallet";
import { Bridge } from "./components/Bridge";
import { Activity } from "./components/Activity";
import { ConnectModal } from "./components/ConnectModal";

export function App() {
  const [view, setView] = useState<"bridge" | "activity">("bridge");
  const [connectOpen, setConnectOpen] = useState(false);
  const [chains, setChains] = useState<Chain[]>([]);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [historySignal, setHistorySignal] = useState(0);

  // wagmi owns the connection: account and chain changes re-render
  // this component automatically, no manual provider listeners.
  const { address, chainId, connector, isConnected } = useAccount();
  const wallet: ConnectedWallet | null = useMemo(
    () =>
      isConnected && address
        ? {
            address,
            chainId: chainId ?? 0,
            connectorName: connector?.name ?? "Wallet",
          }
        : null,
    [address, chainId, connector, isConnected],
  );

  useEffect(() => {
    fetchHealth().then(setApiOk);
    fetchChains()
      .then(setChains)
      .catch(() => setChains([]));
  }, []);

  const onConnect = useCallback(() => {
    setConnectOpen(true);
  }, []);

  const onSendRecorded = useCallback(() => {
    setHistorySignal((n) => n + 1);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setView("bridge"); }} aria-label="Prime Way home">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-word">PRIME</span>
              <svg viewBox="0 0 120 22" width="120" height="22" aria-hidden="true">
                <path d="M52 2 L40 20" stroke="currentColor" strokeWidth="5" />
                <path d="M68 2 L80 20" stroke="currentColor" strokeWidth="5" />
                <path
                  d="M60 4 L60 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              </svg>
            </span>
          </a>
          <nav className="nav" aria-label="Sections">
            <button
              className={view === "bridge" ? "nav-item nav-active" : "nav-item"}
              onClick={() => setView("bridge")}
              type="button"
            >
              Bridge
            </button>
            <button
              className={view === "activity" ? "nav-item nav-active" : "nav-item"}
              onClick={() => setView("activity")}
              type="button"
            >
              Activity
            </button>
          </nav>
          <div className="header-right">
            {wallet ? (
              <button
                className="wallet-button"
                onClick={() => setView("activity")}
                type="button"
                title={`${wallet.connectorName} · ${wallet.address}`}
              >
                <span className="wallet-dot" aria-hidden="true" />
                {shortAddress(wallet.address)}
              </button>
            ) : (
              <button className="connect-button" onClick={onConnect} type="button">
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        {view === "bridge" ? (
          <>
            <div className="page-head">
              <h1>Bridge</h1>
              <p>
                Move money across chains through Relay. One quote, one
                signature at a time, tracked until it lands.
              </p>
            </div>
            <Bridge
              onConnect={onConnect}
              onSendRecorded={onSendRecorded}
              wallet={wallet}
            />
          </>
        ) : (
          <Activity
            chains={chains}
            refreshSignal={historySignal}
            wallet={wallet}
          />
        )}
      </main>

      <footer className="footer">
        <span>
          <span
            className={apiOk === null ? "status-dot" : apiOk ? "status-dot status-dot-ok" : "status-dot status-dot-bad"}
            aria-hidden="true"
          />
          {apiOk === null
            ? "Checking Relay connection…"
            : apiOk
              ? `Connected to Relay · ${chains.length} networks`
              : "Relay connection unavailable — quotes will fail until it returns"}
        </span>
        <span>Powered by Relay</span>
      </footer>

      {connectOpen ? <ConnectModal onClose={() => setConnectOpen(false)} /> : null}
    </div>
  );
}
