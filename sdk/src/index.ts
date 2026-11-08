// @prime-way/sdk: send money through Prime Way, for agents.
//
// Same backend, same quotes, same routes as the human app. The human
// app stays unchanged; this layer sits behind it.
//
// Safety, enforced in code:
// - One decision = one send. A decision key never sends twice; a
//   retry returns the stored receipt.
// - Owner-set spending limits (per send, and per day). Over a limit,
//   the send waits for a human to approve it.
// - Approved recipients only. Strangers are refused.
// - Human approval is explicit: the owner re-issues the decision
//   with approved: true, or writes the key into the approvals file.

export { PrimeWay } from './client.js';
export type {
  PrimeWayConfig,
  SendRequest,
  SendOutcome,
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
  MemoryDecisionStore,
  FileDecisionStore,
  defaultStorePath,
} from './store.js';
export type {
  DecisionStore,
  DecisionRecord,
  Receipt,
  PendingDecision,
} from './store.js';
export {
  makeDecisionKey,
  recipientAllowed,
  checkLimits,
  spentInLastDay,
  readApprovals,
  writeApproval,
  defaultApprovalsPath,
  isAddress,
} from './safety.js';
export type { RecipientRule, LimitBreach } from './safety.js';
export {
  PrimeWayError,
  RecipientNotAllowedError,
  InvalidSendError,
  BackendError,
  QuoteNotSendableError,
} from './errors.js';
