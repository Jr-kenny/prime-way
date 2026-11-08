// The signer: the one thing the SDK asks the developer to supply.
//
// The SDK never holds a private key and never signs on its own. The
// developer passes an object that can send one transaction described
// by a quote step and return its hash. Anything that can do that
// works: a viem wallet client (see viem.ts), a hardware wallet
// wrapper, or a test double.

export interface StepTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
}

export interface Signer {
  /** The address that sends the step transactions. */
  address: `0x${string}`;
  /** Send one step transaction. Returns its hash. */
  sendTransaction(tx: StepTx): Promise<`0x${string}`>;
}
