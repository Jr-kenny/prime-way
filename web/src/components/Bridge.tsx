import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import {
  ZERO_ADDRESS,
  fetchChains,
  fetchQuote,
  fetchStatus,
  fetchTokens,
  formatRate,
  formatTokenAmount,
  formatUsd,
  isNativeToken,
  shortAddress,
  type Chain,
  type Quote,
  type Token,
} from "../lib/relay";
import {
  explorerTxUrl,
  getNativeBalance,
  getTokenAllowance,
  getTokenBalance,
  getTokenBalances,
  sendStepTransaction,
  switchToChain,
  waitForReceipt,
} from "../lib/wallet";
import {
  saveLocalRecord,
  updateLocalStatus,
  isTerminalStatus,
  statusLabel,
} from "../lib/history";
import { ChainModal, TokenModal } from "./SelectModal";
import type { ConnectedWallet } from "../lib/wallet";

type QuoteState = "idle" | "loading" | "ready" | "error";

interface ExecState {
  stage:
    | "switching"
    | "approving"
    | "depositing"
    | "confirming"
    | "bridging"
    | "done"
    | "failed";
  approveHash: string | null;
  depositHash: string | null;
  error: string | null;
  requestId: string | null;
  status: string | null;
}

const INITIAL_EXEC: ExecState = {
  approveHash: null,
  depositHash: null,
  error: null,
  requestId: null,
  stage: "switching",
  status: null,
};

function nativeTokenFor(chain: Chain): Token {
  return {
    address: ZERO_ADDRESS,
    decimals: chain.nativeCurrency.decimals,
    name: chain.nativeCurrency.symbol,
    symbol: chain.nativeCurrency.symbol,
  };
}

function findUsdc(tokens: Token[]): Token | undefined {
  return tokens.find((t) => t.symbol.toUpperCase() === "USDC");
}

export function Bridge({
  onSendRecorded,
  onConnect,
  wallet,
}: {
  onSendRecorded: () => void;
  onConnect: () => void;
  wallet: ConnectedWallet | null;
}) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainsError, setChainsError] = useState<string | null>(null);
  const [originChain, setOriginChain] = useState<Chain | null>(null);
  const [destChain, setDestChain] = useState<Chain | null>(null);
  const [originToken, setOriginToken] = useState<Token | null>(null);
  const [destToken, setDestToken] = useState<Token | null>(null);
  const [tokensByChain, setTokensByChain] = useState<Map<number, Token[]>>(
    new Map(),
  );
  const [tokenPicker, setTokenPicker] = useState<"dest" | "origin" | null>(
    null,
  );
  const [chainPicker, setChainPicker] = useState<"dest" | "origin" | null>(
    null,
  );
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [originBalance, setOriginBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [topupGas, setTopupGas] = useState(false);
  const [exec, setExec] = useState<ExecState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const quoteSeq = useRef(0);
  const executingRef = useRef(false);
  const { connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  // --- chains ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetchChains()
      .then((list) => {
        if (cancelled) return;
        setChains(list);
        const evm = list.filter((c) => c.evm && !c.disabled);
        const base = evm.find((c) => c.id === 8453) || evm[0];
        const arb = list.find((c) => c.id === 42161 && !c.disabled);
        setOriginChain(base || null);
        setDestChain(arb && arb.id !== base?.id ? arb : null);
        if (!arb || arb.id === base?.id) {
          setDestChain(evm.find((c) => c.id !== base?.id) || null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setChainsError(
            "Could not load networks from Relay. Check your connection and refresh.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- tokens for a chain --------------------------------------------------
  const loadTokens = useCallback(
    async (chain: Chain): Promise<Token[]> => {
      const cached = tokensByChain.get(chain.id);
      if (cached) return cached;
      const list = await fetchTokens(chain.id);
      const native = nativeTokenFor(chain);
      const withNative = list.some(
        (t) => t.address.toLowerCase() === ZERO_ADDRESS,
      )
        ? list
        : [native, ...list];
      setTokensByChain((prev) => {
        const next = new Map(prev);
        next.set(chain.id, withNative);
        return next;
      });
      return withNative;
    },
    [tokensByChain],
  );

  useEffect(() => {
    if (!originChain) return;
    loadTokens(originChain)
      .then((list) => {
        setOriginToken((prev) =>
          prev && list.some((t) => t.address === prev.address)
            ? prev
            : (findUsdc(list) || list[0] || null),
        );
      })
      .catch(() => {
        setOriginToken(nativeTokenFor(originChain));
      });
  }, [originChain, loadTokens]);

  useEffect(() => {
    if (!destChain) return;
    loadTokens(destChain)
      .then((list) => {
        setDestToken((prev) =>
          prev && list.some((t) => t.address === prev.address)
            ? prev
            : (findUsdc(list) || list[0] || null),
        );
      })
      .catch(() => {
        setDestToken(nativeTokenFor(destChain));
      });
  }, [destChain, loadTokens]);

  // --- balances ------------------------------------------------------------
  useEffect(() => {
    if (!wallet || !originChain || !originToken) {
      setOriginBalance(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const raw = isNativeToken(originToken)
          ? await getNativeBalance(originChain, wallet.address)
          : await getTokenBalance(
              originChain,
              originToken.address as Address,
              wallet.address,
            );
        if (!cancelled) setOriginBalance(raw);
      } catch {
        if (!cancelled) setOriginBalance(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [wallet, originChain, originToken, exec?.stage]);

  // Balances for the token picker (visible list, batched).
  const refreshPickerBalances = useCallback(
    async (chain: Chain, tokens: Token[]) => {
      if (!wallet) return;
      setBalancesLoading(true);
      const erc20 = tokens
        .filter((t) => !isNativeToken(t))
        .slice(0, 40)
        .map((t) => t.address as Address);
      const map = new Map<string, bigint>();
      try {
        const native = await getNativeBalance(chain, wallet.address);
        map.set(ZERO_ADDRESS, native);
      } catch {
        // Native balance stays unknown.
      }
      if (erc20.length > 0) {
        const fetched = await getTokenBalances(chain, erc20, wallet.address);
        fetched.forEach((v, k) => map.set(k, v));
      }
      setBalances(map);
      setBalancesLoading(false);
    },
    [wallet],
  );

  useEffect(() => {
    if (tokenPicker && originChain && destChain) {
      const chain = tokenPicker === "origin" ? originChain : destChain;
      const list = tokensByChain.get(chain.id) || [];
      refreshPickerBalances(chain, list);
    }
  }, [tokenPicker, originChain, destChain, tokensByChain, refreshPickerBalances]);

  // --- amount ---------------------------------------------------------------
  const amountRaw = useMemo(() => {
    if (!amount || !originToken) return null;
    try {
      const raw = parseUnits(amount, originToken.decimals);
      return raw > 0n ? raw : null;
    } catch {
      return null;
    }
  }, [amount, originToken]);

  const insufficient = useMemo(() => {
    if (amountRaw === null || originBalance === null) return false;
    return amountRaw > originBalance;
  }, [amountRaw, originBalance]);

  // --- quote ------------------------------------------------------------------
  const requestQuote = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!wallet || !originChain || !destChain || !originToken || !destToken) {
        setQuote(null);
        setQuoteState("idle");
        return null;
      }
      if (amountRaw === null) {
        setQuote(null);
        setQuoteState("idle");
        return null;
      }
      if (insufficient) {
        setQuote(null);
        setQuoteState("idle");
        return null;
      }
      const seq = ++quoteSeq.current;
      if (!opts.silent) setQuoteState("loading");
      try {
        const q = await fetchQuote({
          amount: amountRaw.toString(),
          destinationChainId: destChain.id,
          destinationCurrency: destToken.address,
          originChainId: originChain.id,
          originCurrency: originToken.address,
          recipient: wallet.address,
          user: wallet.address,
        });
        if (seq !== quoteSeq.current) return null;
        setQuote(q);
        setQuoteState("ready");
        setQuoteError(null);
        return q;
      } catch (err) {
        if (seq !== quoteSeq.current) return null;
        setQuote(null);
        setQuoteState("error");
        setQuoteError(
          err instanceof Error
            ? err.message
            : "Relay could not price this route.",
        );
        return null;
      }
    },
    [
      wallet,
      originChain,
      destChain,
      originToken,
      destToken,
      amountRaw,
      insufficient,
    ],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      requestQuote();
    }, 600);
    return () => clearTimeout(timer);
  }, [requestQuote]);

  // Refresh the quote while the review is open so execution never uses
  // a stale price.
  useEffect(() => {
    if (!reviewOpen) return;
    const timer = setInterval(() => {
      requestQuote({ silent: true });
    }, 25_000);
    return () => clearInterval(timer);
  }, [reviewOpen, requestQuote]);

  // --- status polling after a deposit -----------------------------------------
  useEffect(() => {
    if (!exec || !exec.requestId) return;
    if (exec.stage !== "bridging" && exec.stage !== "done") return;
    if (exec.status && isTerminalStatus(exec.status)) return;
    const timer = setInterval(async () => {
      try {
        const s = await fetchStatus(exec.requestId as string);
        setExec((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stage:
              s.status === "success" || s.status === "refund"
                ? "done"
                : prev.stage,
            status: s.status,
          };
        });
        updateLocalStatus(
          exec.requestId as string,
          s.status || "pending",
          s.txHashes || [],
          null,
        );
        if (s.status && isTerminalStatus(s.status)) onSendRecorded();
      } catch {
        // Keep polling; a failed poll is not a failed bridge.
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [exec, onSendRecorded]);

  // --- actions ------------------------------------------------------------------
  const setMax = () => {
    if (originBalance === null || !originToken) return;
    let raw = originBalance;
    if (isNativeToken(originToken) && raw > 0n) {
      // Keep a small reserve for gas when sending the native token.
      const reserve = parseUnits("0.001", originToken.decimals);
      raw = raw > reserve ? raw - reserve : 0n;
    }
    setAmount(formatTokenAmount(raw.toString(), originToken.decimals, 18));
  };

  const swapDirection = () => {
    if (!originChain || !destChain) return;
    setOriginChain(destChain);
    setDestChain(originChain);
    setOriginToken(null);
    setDestToken(null);
    setQuote(null);
    setQuoteState("idle");
    setTopupGas(false);
  };

  const canTopupGas =
    !!originChain &&
    !!destChain &&
    originChain.evm &&
    destChain.evm &&
    !!originToken &&
    !isNativeToken(originToken);

  const execute = async () => {
    if (executingRef.current) return;
    if (!wallet || !originChain || !destChain || !originToken || !destToken) {
      return;
    }
    if (!walletClient) {
      setNotice("The wallet is not ready yet. Reconnect and try again.");
      return;
    }
    if (!isAddress(recipient || wallet.address)) {
      setNotice("The recipient address is not valid. Check it and try again.");
      return;
    }
    executingRef.current = true;
    setNotice(null);
    setReviewOpen(false);
    setExec({ ...INITIAL_EXEC, stage: "switching" });
    try {
      // Fresh quote at confirm time, with the chosen recipient.
      const fresh = await fetchQuote({
        amount: amountRaw?.toString() || "0",
        destinationChainId: destChain.id,
        destinationCurrency: destToken.address,
        originChainId: originChain.id,
        originCurrency: originToken.address,
        recipient: (recipient || wallet.address) as Address,
        topupGas: canTopupGas && topupGas ? true : undefined,
        user: wallet.address,
      });
      if (!fresh || fresh.steps.length === 0) {
        throw new Error("Relay returned no executable steps for this quote.");
      }
      setQuote(fresh);

      if (wallet.chainId !== originChain.id) {
        try {
          await switchToChain(originChain, switchChainAsync, connector);
        } catch {
          throw new Error(
            `Switch your wallet to ${originChain.displayName} and try again. Nothing was sent.`,
          );
        }
      }

      let approveHash: string | null = null;
      let depositHash: string | null = null;

      for (const step of fresh.steps) {
        if (!step.tx) {
          throw new Error(
            `Relay returned a step (${step.id}) with no transaction to sign. Nothing was sent.`,
          );
        }
        if (step.id === "approve") {
          // Skip the approval when the allowance already covers it.
          let needsApprove = true;
          try {
            const spender = extractApproveSpender(step.tx.data);
            if (spender && !isNativeToken(originToken)) {
              const allowance = await getTokenAllowance(
                originChain,
                originToken.address as Address,
                wallet.address,
                spender,
              );
              needsApprove = allowance < (amountRaw || 0n);
            }
          } catch {
            needsApprove = true;
          }
          if (needsApprove) {
            setExec((p) => (p ? { ...p, stage: "approving" } : p));
            approveHash = await sendStepTransaction(
              originChain,
              step.tx,
              wallet.address,
              walletClient,
            );
            setExec((p) => (p ? { ...p, approveHash } : p));
            const receipt = await waitForReceipt(originChain, approveHash);
            if (receipt.status === "reverted") {
              throw new Error(
                "The approval transaction was reverted on-chain. No money moved. Check your balance and gas, then try again.",
              );
            }
          }
        } else {
          setExec((p) =>
            p
              ? {
                  ...p,
                  approveHash,
                  requestId: fresh.requestId,
                  stage: "depositing",
                }
              : p,
          );
          depositHash = await sendStepTransaction(
            originChain,
            step.tx,
            wallet.address,
            walletClient,
          );
          setExec((p) => (p ? { ...p, depositHash } : p));
          saveLocalRecord({
            amountIn: amount,
            amountOut: fresh.outputAmountFormatted,
            createdAt: new Date().toISOString(),
            destinationChainId: destChain.id,
            destinationSymbol: destToken.symbol,
            originChainId: originChain.id,
            originSymbol: originToken.symbol,
            recipient: recipient || wallet.address,
            requestId: fresh.requestId,
            source: "local",
            status: "waiting",
            txHashes: [depositHash],
            user: wallet.address,
          });
          onSendRecorded();
          setExec((p) => (p ? { ...p, stage: "confirming" } : p));
          const receipt = await waitForReceipt(originChain, depositHash);
          if (receipt.status === "reverted") {
            throw new Error(
              "The deposit transaction was reverted on-chain. No money left your wallet for the bridge. Check the transaction and try again.",
            );
          }
          setExec((p) => (p ? { ...p, stage: "bridging" } : p));
          const s = await fetchStatus(fresh.requestId);
          setExec((p) =>
            p
              ? {
                  ...p,
                  stage:
                    s.status && isTerminalStatus(s.status) ? "done" : "bridging",
                  status: s.status,
                }
              : p,
          );
          updateLocalStatus(
            fresh.requestId,
            s.status || "pending",
            s.txHashes || [],
            null,
          );
          if (s.status && isTerminalStatus(s.status)) onSendRecorded();
          setAmount("");
          setQuote(null);
          setQuoteState("idle");
          return;
        }
      }
      throw new Error("Relay returned no deposit step. Nothing was sent.");
    } catch (err) {
      const message = humanError(err);
      setExec((p) =>
        p
          ? {
              ...p,
              error: message,
              stage:
                p.depositHash && p.stage !== "failed" ? "bridging" : "failed",
            }
          : { ...INITIAL_EXEC, error: message, stage: "failed" },
      );
    } finally {
      executingRef.current = false;
    }
  };

  const rate =
    quote && amountRaw
      ? formatRate(
          amountRaw.toString(),
          originToken?.decimals || 18,
          quote.outputAmount,
          destToken?.decimals || 18,
        )
      : "—";

  const receiveDisplay =
    quote && quote.outputAmountFormatted
      ? `${quote.outputAmountFormatted} ${quote.outputCurrency}`
      : "—";

  const primaryDisabled =
    !wallet ||
    !originChain ||
    !destChain ||
    !originToken ||
    !destToken ||
    amountRaw === null ||
    insufficient ||
    quoteState === "loading" ||
    (quoteState === "idle" && amountRaw !== null);

  const primaryLabel = !wallet
    ? "Connect wallet"
    : amountRaw === null
      ? "Enter an amount"
      : insufficient
        ? "Insufficient balance"
        : quoteState === "loading"
          ? "Getting quote…"
          : quoteState === "error"
            ? "Quote failed — try again"
            : "Review bridge";

  const openReview = () => {
    if (!wallet) {
      onConnect();
      return;
    }
    if (quoteState === "error") {
      requestQuote();
      return;
    }
    if (primaryDisabled) return;
    setRecipient(wallet.address);
    setReviewOpen(true);
  };

  const originTokens = originChain ? tokensByChain.get(originChain.id) || [] : [];
  const destTokens = destChain ? tokensByChain.get(destChain.id) || [] : [];

  return (
    <section aria-label="Bridge" className="bridge-card">
      {chainsError ? (
        <div className="alert alert-error" role="alert">
          {chainsError}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-error" role="alert">
          {notice}
        </div>
      ) : null}

      {/* From */}
      <div className="field">
        <div className="field-head">
          <label htmlFor="amount-input">From</label>
          <span className="field-balance">
            {wallet && originToken
              ? `Balance: ${
                  originBalance === null
                    ? "…"
                    : formatTokenAmount(
                        originBalance.toString(),
                        originToken.decimals,
                      )
                } ${originToken.symbol}`
              : "Connect wallet to see balance"}
          </span>
        </div>
        <div className="amount-row">
          <button
            className="selector"
            onClick={() => setChainPicker("origin")}
            type="button"
            disabled={!originChain}
          >
            {originChain ? (
              <>
                <ChainGlyph chain={originChain} />
                <span>{originChain.displayName}</span>
                <Chevron />
              </>
            ) : (
              "Select network"
            )}
          </button>
          <button
            className="selector"
            onClick={() => setTokenPicker("origin")}
            type="button"
            disabled={!originToken}
          >
            {originToken ? (
              <>
                <TokenGlyph token={originToken} />
                <span>{originToken.symbol}</span>
                <Chevron />
              </>
            ) : (
              "Select token"
            )}
          </button>
        </div>
        <div className="amount-input-row">
          <input
            id="amount-input"
            inputMode="decimal"
            className="amount-input"
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              setAmount(v);
            }}
            placeholder="0.0"
            type="text"
            value={amount}
          />
          {wallet && originBalance !== null && originBalance > 0n ? (
            <button className="max-button" onClick={setMax} type="button">
              MAX
            </button>
          ) : null}
        </div>
        {insufficient ? (
          <p className="field-error">
            Amount is more than your balance of {originToken?.symbol}.
          </p>
        ) : null}
      </div>

      {/* Swap */}
      <div className="swap-row">
        <button
          aria-label="Swap direction"
          className="swap-button"
          onClick={swapDirection}
          type="button"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path
              d="M10 3v14M5 11l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* To */}
      <div className="field">
        <div className="field-head">
          <label>To</label>
          <span className="field-balance">You receive (estimated)</span>
        </div>
        <div className="amount-row">
          <button
            className="selector"
            onClick={() => setChainPicker("dest")}
            type="button"
            disabled={!destChain}
          >
            {destChain ? (
              <>
                <ChainGlyph chain={destChain} />
                <span>{destChain.displayName}</span>
                <Chevron />
              </>
            ) : (
              "Select network"
            )}
          </button>
          <button
            className="selector"
            onClick={() => setTokenPicker("dest")}
            type="button"
            disabled={!destToken}
          >
            {destToken ? (
              <>
                <TokenGlyph token={destToken} />
                <span>{destToken.symbol}</span>
                <Chevron />
              </>
            ) : (
              "Select token"
            )}
          </button>
        </div>
        <div className="receive-amount" aria-live="polite">
          {quoteState === "loading" ? "Getting quote…" : receiveDisplay}
        </div>
        {quoteState === "error" && quoteError ? (
          <p className="field-error">
            {quoteError.includes("no route") || quoteError.includes("route")
              ? "Relay found no route for this pair. Try a different token or network."
              : `Quote failed: ${quoteError} Try again or change the amount.`}
          </p>
        ) : null}
      </div>

      {/* Quote panel */}
      {quote && quoteState === "ready" && originToken && destToken ? (
        <div className="quote-panel">
          <div className="quote-row">
            <span>Rate</span>
            <span>
              1 {originToken.symbol} ≈ {rate} {destToken.symbol}
            </span>
          </div>
          {quote.fees?.find((f) => f.label === "Gas") ? (
            <div className="quote-row">
              <span>Network fee</span>
              <span>{formatUsd(quote.fees.find((f) => f.label === "Gas")?.amountUsd ?? null)}</span>
            </div>
          ) : null}
          {quote.fees?.find((f) => f.label === "Relayer") ? (
            <div className="quote-row">
              <span>Bridge fee</span>
              <span>{formatUsd(quote.fees.find((f) => f.label === "Relayer")?.amountUsd ?? null)}</span>
            </div>
          ) : null}
          <div className="quote-row">
            <span>Total fees</span>
            <span>{formatUsd(quote.feesUsd)}</span>
          </div>
          <div className="quote-row">
            <span>Estimated time</span>
            <span>
              {quote.timeEstimate !== null && quote.timeEstimate !== undefined
                ? `About ${quote.timeEstimate} min`
                : "Shown after signing"}
            </span>
          </div>
          <p className="quote-note">
            Live Relay quote · refreshes automatically · a fresh quote is
            taken when you confirm.
          </p>
        </div>
      ) : null}

      <button
        className="primary-button"
        disabled={primaryDisabled && wallet !== null}
        onClick={openReview}
        type="button"
      >
        {primaryLabel}
      </button>

      {/* Execution / tracking */}
      {exec ? <Progress exec={exec} destChain={destChain} originChain={originChain} onClose={() => setExec(null)} /> : null}

      {/* Review modal */}
      {reviewOpen && quote && wallet && originChain && destChain && originToken && destToken ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setReviewOpen(false);
          }}
          role="presentation"
        >
          <div aria-modal="true" className="modal" role="dialog" aria-label="Review bridge">
            <div className="modal-head">
              <div>
                <h2>Review bridge</h2>
                <p>Check every detail before you sign.</p>
              </div>
              <button
                aria-label="Close"
                className="icon-button"
                onClick={() => setReviewOpen(false)}
                type="button"
              >
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <dl className="review-list">
              <div>
                <dt>You send</dt>
                <dd>
                  {amount} {originToken.symbol} · {originChain.displayName}
                </dd>
              </div>
              <div>
                <dt>You receive</dt>
                <dd>
                  {receiveDisplay} · {destChain.displayName}
                </dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>
                  1 {originToken.symbol} ≈ {rate} {destToken.symbol}
                </dd>
              </div>
              <div>
                <dt>Total fees</dt>
                <dd>{formatUsd(quote.feesUsd)}</dd>
              </div>
              <div>
                <dt>Estimated time</dt>
                <dd>
                  {quote.timeEstimate !== null && quote.timeEstimate !== undefined
                    ? `About ${quote.timeEstimate} min`
                    : "Shown after signing"}
                </dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>
                  {originChain.displayName} → {destChain.displayName} via Relay
                </dd>
              </div>
            </dl>
            <label className="review-field" htmlFor="recipient-input">
              Recipient
              <input
                id="recipient-input"
                className="text-input"
                onChange={(e) => setRecipient(e.target.value)}
                type="text"
                value={recipient}
              />
            </label>
            {canTopupGas ? (
              <label className="check-row">
                <input
                  checked={topupGas}
                  onChange={(e) => setTopupGas(e.target.checked)}
                  type="checkbox"
                />
                <span>
                  Top up destination gas — send a little {destChain.nativeCurrency.symbol} so
                  the recipient can transact on {destChain.displayName} right away.
                </span>
              </label>
            ) : null}
            <p className="review-warning">
              You will sign {quote.steps.length} transaction
              {quote.steps.length === 1 ? "" : "s"} in your wallet
              {quote.steps.some((s) => s.id === "approve") ? " (approval, then deposit)" : ""}.
              Check the amounts in your wallet before you approve. A fresh
              quote is taken when you confirm.
            </p>
            <button className="primary-button" onClick={execute} type="button">
              Confirm bridge
            </button>
          </div>
        </div>
      ) : null}

      {/* Pickers */}
      {chainPicker === "origin" ? (
        <ChainModal
          chains={chains}
          evmOnly
          onClose={() => setChainPicker(null)}
          onSelect={(c) => {
            setOriginChain(c);
            setOriginToken(null);
            setChainPicker(null);
            setQuote(null);
            setQuoteState("idle");
          }}
          title="Send from"
        />
      ) : null}
      {chainPicker === "dest" ? (
        <ChainModal
          chains={chains}
          evmOnly={false}
          onClose={() => setChainPicker(null)}
          onSelect={(c) => {
            setDestChain(c);
            setDestToken(null);
            setChainPicker(null);
            setQuote(null);
            setQuoteState("idle");
          }}
          title="Send to"
        />
      ) : null}
      {tokenPicker === "origin" && originChain ? (
        <TokenModal
          balances={balances}
          balancesLoading={balancesLoading}
          chain={originChain}
          onClose={() => setTokenPicker(null)}
          onSelect={(t) => {
            setOriginToken(t);
            setTokenPicker(null);
            setQuote(null);
            setQuoteState("idle");
          }}
          tokens={originTokens}
        />
      ) : null}
      {tokenPicker === "dest" && destChain ? (
        <TokenModal
          balances={balances}
          balancesLoading={balancesLoading}
          chain={destChain}
          onClose={() => setTokenPicker(null)}
          onSelect={(t) => {
            setDestToken(t);
            setTokenPicker(null);
            setQuote(null);
            setQuoteState("idle");
          }}
          tokens={destTokens}
        />
      ) : null}
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className="chevron">
      <path
        d="M5 7l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChainGlyph({ chain }: { chain: Chain }) {
  const [failed, setFailed] = useState(false);
  if (!chain.iconUrl || failed) {
    return (
      <span className="token-fallback token-fallback-small" aria-hidden="true">
        {chain.displayName.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      alt=""
      className="token-icon token-icon-small"
      height={24}
      onError={() => setFailed(true)}
      src={chain.iconUrl}
      width={24}
    />
  );
}

function TokenGlyph({ token }: { token: Token }) {
  const [failed, setFailed] = useState(false);
  if (!token.iconUrl || failed) {
    return (
      <span className="token-fallback token-fallback-small" aria-hidden="true">
        {token.symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      alt=""
      className="token-icon token-icon-small"
      height={24}
      onError={() => setFailed(true)}
      src={token.iconUrl}
      width={24}
    />
  );
}

/** approve(address spender, uint256 amount): spender is bytes 4..36. */
function extractApproveSpender(data: string): Address | null {
  try {
    if (!data.startsWith("0x095ea7b3") || data.length < 74) return null;
    return `0x${data.slice(34, 74)}` as Address;
  } catch {
    return null;
  }
}

function humanError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("User rejected") || msg.includes("user rejected") || (err as { code?: number }).code === 4001) {
      return "You rejected the signature in your wallet. Nothing was sent. Try again when you are ready.";
    }
    if (msg.includes("insufficient funds") || msg.includes("Insufficient")) {
      return "Your wallet reported insufficient funds for this transaction, including gas. Add funds and try again. Nothing was sent.";
    }
    return msg;
  }
  return "Something went wrong. Nothing was sent unless a transaction hash is shown above.";
}

function Progress({
  destChain,
  exec,
  onClose,
  originChain,
}: {
  destChain: Chain | null;
  exec: ExecState;
  onClose: () => void;
  originChain: Chain | null;
}) {
  const failed = exec.stage === "failed";
  const done =
    exec.stage === "done" &&
    exec.status !== null &&
    isTerminalStatus(exec.status);
  const steps: { done: boolean; active: boolean; label: string }[] = [
    {
      active: exec.stage === "switching",
      done: exec.stage !== "switching",
      label: "Preparing transaction",
    },
    {
      active: exec.stage === "approving",
      done:
        exec.approveHash !== null ||
        ["depositing", "confirming", "bridging", "done"].includes(exec.stage),
      label: exec.approveHash ? "Approval signed" : "Awaiting approval signature",
    },
    {
      active: exec.stage === "depositing",
      done:
        exec.depositHash !== null ||
        ["confirming", "bridging", "done"].includes(exec.stage),
      label: "Awaiting deposit signature",
    },
    {
      active: exec.stage === "confirming",
      done: ["bridging", "done"].includes(exec.stage),
      label: "Source chain confirmation",
    },
    {
      active: exec.stage === "bridging",
      done: done,
      label: "Bridge processing",
    },
    {
      active: false,
      done: done && exec.status === "success",
      label:
        exec.status === "refund"
          ? "Refunded"
          : done
            ? "Completed"
            : "Completed",
    },
  ];
  return (
    <div className="progress" aria-live="polite">
      <div className="progress-head">
        <h3>
          {failed
            ? "Bridge failed"
            : done
              ? exec.status === "refund"
                ? "Refunded"
                : "Bridge completed"
              : "Bridge in progress"}
        </h3>
        {(failed || done) && (
          <button className="text-button" onClick={onClose} type="button">
            Dismiss
          </button>
        )}
      </div>
      {exec.error ? (
        <p className="field-error" role="alert">
          {exec.error}
        </p>
      ) : null}
      <ol className="progress-steps">
        {steps.map((s, i) => (
          <li
            key={i}
            className={s.done ? "step-done" : s.active ? "step-active" : ""}
          >
            <span className="step-dot" aria-hidden="true" />
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      {exec.status ? (
        <p className="progress-status">
          Relay status: <strong>{statusLabel(exec.status)}</strong>
        </p>
      ) : null}
      {exec.depositHash && originChain ? (
        <p className="progress-link">
          Deposit transaction:{" "}
          {explorerTxUrl(originChain, exec.depositHash) ? (
            <a
              href={explorerTxUrl(originChain, exec.depositHash)}
              rel="noreferrer"
              target="_blank"
            >
              {shortAddress(exec.depositHash)}
            </a>
          ) : (
            shortAddress(exec.depositHash)
          )}
        </p>
      ) : null}
      {exec.requestId ? (
        <p className="progress-link">
          Request ID: <code>{shortAddress(exec.requestId)}</code>
        </p>
      ) : null}
      {destChain && done && exec.status === "success" ? (
        <p className="progress-note">
          The funds should now be on {destChain.displayName}. Check the
          Activity tab for the full record.
        </p>
      ) : null}
      {!failed && !done ? (
        <p className="progress-note">
          Do not close this tab while the bridge is processing. Status is
          checked live with Relay.
        </p>
      ) : null}
    </div>
  );
}
