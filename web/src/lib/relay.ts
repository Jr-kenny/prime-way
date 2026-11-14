// Relay API client for Prime Way Web.
//
// Every call goes through the Prime Way backend, never to Relay
// directly from the browser, so the Relay API key stays server-side.
// The backend is either the local proxy server (same origin / dev
// proxy) or the live Prime Way backend on Render, which already holds
// the Prime Way App key. Attribution to the Prime Way App comes from
// that key (x-api-key header, server-side); the optional `referrer`
// string on quotes is a surface tag for filtering in the dashboard.

import { formatUnits } from "viem";

const LIVE_BACKEND = "https://prime-way-backend.onrender.com";

function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env !== undefined) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      // Served by the Vite dev server: the API is proxied at /api.
      // Served by the Prime Way Web server (or any local static host
      // with the server behind it): the API is same-origin at root,
      // so the browser never needs to reach the Render backend
      // directly — the server calls Relay itself.
      if (port === "5173") return "/api";
      return "";
    }
  }
  return LIVE_BACKEND;
}

export const API_BASE = apiBase();

export interface Chain {
  id: number;
  name: string;
  displayName: string;
  nativeCurrency: { symbol: string; decimals: number };
  evm: boolean;
  disabled: boolean;
  explorerUrl?: string;
  iconUrl?: string;
  rpcUrl?: string;
}

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  iconUrl?: string;
}

export interface QuoteStepTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface QuoteStep {
  id: string;
  action: string;
  description: string;
  tx: QuoteStepTx | null;
}

export interface FeeLine {
  label: string;
  amountUsd: number;
  symbol?: string;
}

export interface Quote {
  requestId: string;
  outputAmount: string | null;
  outputAmountFormatted: string | null;
  outputCurrency: string;
  feesUsd: number;
  fees?: FeeLine[];
  steps: QuoteStep[];
  timeEstimate: number | null;
}

export interface QuoteRequest {
  user: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  topupGas?: boolean;
}

export interface TxStatus {
  requestId: string;
  status: string | null;
  txHashes: string[];
}

export interface HistoryEntry {
  requestId: string;
  status: string;
  user: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originSymbol: string;
  destinationSymbol: string;
  amountIn: string;
  amountOut: string | null;
  createdAt: string;
  txHashes: string[];
  source: "relay" | "local";
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchChains(): Promise<Chain[]> {
  const data = await getJson<{ chains: Chain[] }>("/chains");
  return data.chains;
}

export async function fetchTokens(chainId: number): Promise<Token[]> {
  const data = await getJson<{ chainId: number; currencies: Token[] }>(
    `/currencies?chainId=${chainId}`,
  );
  return data.currencies;
}

export async function fetchQuote(req: QuoteRequest): Promise<Quote> {
  // The web client marks its quotes so the server tags them with
  // referrer "prime-way-web" for Relay dashboard filtering. The
  // mobile app sends no source, so its quotes stay untagged.
  return postJson<Quote>("/quote", { ...req, source: "web" });
}

export async function fetchStatus(requestId: string): Promise<TxStatus> {
  return getJson<TxStatus>(
    `/status?requestId=${encodeURIComponent(requestId)}`,
  );
}

export async function fetchRelayHistory(
  user: string,
  limit = 25,
): Promise<HistoryEntry[]> {
  const data = await getJson<{ entries: HistoryEntry[] }>(
    `/requests?user=${encodeURIComponent(user)}&limit=${limit}`,
  );
  return (data.entries || []).map((e) => ({ ...e, source: "relay" as const }));
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// --- formatting helpers -------------------------------------------------

export function shortAddress(address: string): string {
  if (address.length < 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTokenAmount(
  raw: string | null | undefined,
  decimals: number,
  maxDp = 6,
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  try {
    const full = formatUnits(BigInt(raw), decimals);
    const [head, tail = ""] = full.split(".");
    const trimmed = tail.replace(/0+$/, "").slice(0, maxDp);
    return trimmed ? `${head}.${trimmed}` : head;
  } catch {
    return "—";
  }
}

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function formatRate(
  inputRaw: string,
  inputDecimals: number,
  outputRaw: string | null,
  outputDecimals: number,
): string {
  if (!outputRaw) return "—";
  try {
    const input = Number(formatUnits(BigInt(inputRaw), inputDecimals));
    const output = Number(formatUnits(BigInt(outputRaw), outputDecimals));
    if (!input || !output) return "—";
    const rate = output / input;
    return rate >= 1000
      ? rate.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") || "0";
  } catch {
    return "—";
  }
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isNativeToken(token: Token): boolean {
  return token.address.toLowerCase() === ZERO_ADDRESS;
}
