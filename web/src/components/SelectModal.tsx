import { useEffect, useMemo, useRef, useState } from "react";
import type { Chain, Token } from "../lib/relay";
import { formatTokenAmount } from "../lib/relay";

function TokenIcon({
  iconUrl,
  symbol,
  size = 36,
}: {
  iconUrl?: string;
  symbol: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!iconUrl || failed) {
    return (
      <span
        className="token-fallback"
        style={{ height: size, width: size, fontSize: size * 0.42 }}
        aria-hidden="true"
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      alt=""
      className="token-icon"
      height={size}
      onError={() => setFailed(true)}
      src={iconUrl}
      width={size}
    />
  );
}

function ModalShell({
  children,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="modal"
        role="dialog"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
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
        {children}
        <span ref={inputRef} />
      </div>
    </div>
  );
}

export function ChainModal({
  chains,
  evmOnly,
  onClose,
  onSelect,
  title,
}: {
  chains: Chain[];
  evmOnly: boolean;
  onClose: () => void;
  onSelect: (chain: Chain) => void;
  title: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = chains.filter((c) => !c.disabled && (!evmOnly || c.evm));
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        String(c.id) === q,
    );
  }, [chains, evmOnly, query]);
  return (
    <ModalShell
      onClose={onClose}
      subtitle={
        evmOnly
          ? `${filtered.length} EVM networks · your wallet signs on the network you send from`
          : `${filtered.length} networks · Relay settles the destination for you`
      }
      title={title}
    >
      <input
        autoFocus
        className="search-input"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search networks"
        type="text"
        value={query}
      />
      <div className="pick-list" role="listbox" aria-label={title}>
        {filtered.length === 0 ? (
          <p className="empty-note">No network matches that search.</p>
        ) : (
          filtered.map((c) => (
            <button
              className="pick-row"
              key={c.id}
              onClick={() => onSelect(c)}
              type="button"
            >
              <TokenIcon iconUrl={c.iconUrl} symbol={c.displayName} />
              <span className="pick-main">
                <span className="pick-title">{c.displayName}</span>
                <span className="pick-sub">
                  Chain {c.id} · {c.nativeCurrency.symbol}
                </span>
              </span>
              <span className="pick-right">
                <svg
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path
                    d="M7 4l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ))
        )}
      </div>
    </ModalShell>
  );
}

export function TokenModal({
  balances,
  balancesLoading,
  chain,
  onClose,
  onSelect,
  tokens,
}: {
  balances: Map<string, bigint>;
  balancesLoading: boolean;
  chain: Chain;
  onClose: () => void;
  onSelect: (token: Token) => void;
  tokens: Token[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q),
    );
  }, [query, tokens]);
  return (
    <ModalShell
      onClose={onClose}
      subtitle={`Tokens on ${chain.displayName} · ${tokens.length} listed by Relay`}
      title="Select token"
    >
      <input
        autoFocus
        className="search-input"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, symbol or address"
        type="text"
        value={query}
      />
      {balancesLoading ? (
        <p className="list-note">Loading balances…</p>
      ) : null}
      <div className="pick-list" role="listbox" aria-label="Select token">
        {filtered.length === 0 ? (
          <p className="empty-note">No token matches that search.</p>
        ) : (
          filtered.map((t) => {
            const raw = balances.get(t.address.toLowerCase());
            return (
              <button
                className="pick-row"
                key={t.address}
                onClick={() => onSelect(t)}
                type="button"
              >
                <TokenIcon iconUrl={t.iconUrl} symbol={t.symbol} />
                <span className="pick-main">
                  <span className="pick-title">{t.symbol}</span>
                  <span className="pick-sub">{t.name || t.address}</span>
                </span>
                <span className="pick-right pick-balance">
                  {raw !== undefined
                    ? formatTokenAmount(raw.toString(), t.decimals)
                    : "—"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </ModalShell>
  );
}
