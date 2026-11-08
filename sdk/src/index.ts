// @prime-way/sdk: send money through Prime Way, for agents.
//
// Same backend, same quotes, same routes as the human app. The human
// app stays unchanged; this layer sits behind it. Normal usage: get a
// live quote, send money through the quote's steps, check the send.
// People and agents build with it.

export { PrimeWay, isAddress } from './client.js';
export type {
  PrimeWayConfig,
  SendRequest,
  Receipt,
} from './client.js';
export type { Signer, StepTx } from './signer.js';
export { viemSigner, localWalletClient } from './viem.js';
export {
  fetchQuote,
  fetchStatus,
  quoteCanSend,
  quoteRequestFor,
  dollarsToUnits,
  formatFee,
  DEFAULT_BACKEND_URL,
} from './quote.js';
export type {
  Quote,
  QuoteStep,
  QuoteRequest,
  SendStatus,
  StatusResult,
} from './quote.js';
export {
  chainById,
  chainByName,
  tokenOn,
  SUPPORTED_CHAINS,
  RECEIVE_SYMBOLS,
  ZERO_ADDRESS,
} from './chains.js';
export type { SupportedChain, TokenInfo, ReceiveSymbol } from './chains.js';
export {
  PrimeWayError,
  InvalidSendError,
  BackendError,
  QuoteNotSendableError,
} from './errors.js';
