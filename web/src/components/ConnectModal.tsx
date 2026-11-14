// Wallet picker: the wagmi connectors (browser wallet, Coinbase
// Wallet). No WalletConnect/Reown here — that needs a Reown Cloud
// project id, which does not exist for this app.

import { useConnect, type Connector } from "wagmi";

function connectorLabel(connector: Connector): {
  name: string;
  desc: string;
} {
  if (connector.id === "injected") {
    return {
      desc: "MetaMask, Rabby, Brave and other wallets installed in this browser.",
      name: "Browser wallet",
    };
  }
  if (connector.id === "coinbaseWalletSDK") {
    return {
      desc: "Connect with the Coinbase Wallet app or extension.",
      name: "Coinbase Wallet",
    };
  }
  return { desc: "", name: connector.name };
}

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connectAsync, connectors, error, isPending } = useConnect();

  const onPick = async (connector: Connector) => {
    try {
      await connectAsync({ connector });
      onClose();
    } catch {
      // The error is shown below; the modal stays open so the user
      // can try the other option.
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-label="Connect wallet"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-head">
          <div>
            <h2>Connect wallet</h2>
            <p>Choose how to connect. You sign everything in your wallet.</p>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="connector-list">
          {connectors.map((connector) => {
            const label = connectorLabel(connector);
            return (
              <button
                className="connector-button"
                disabled={isPending}
                key={connector.uid}
                onClick={() => onPick(connector)}
                type="button"
              >
                <span className="connector-name">{label.name}</span>
                {label.desc ? (
                  <span className="connector-desc">{label.desc}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error.message.includes("not found") ||
            error.message.includes("No provider") ||
            error.message.includes("Connector not found")
              ? "No wallet was found in this browser. Install MetaMask or Rabby, then try again."
              : error.message}
          </p>
        ) : (
          <p className="connector-note">
            No wallet installed? Get MetaMask or Rabby in this browser, then
            come back and connect.
          </p>
        )}
      </div>
    </div>
  );
}
