// Typed errors. A refused send is not an error: send() returns a
// SendOutcome for those (see client.ts). These are for mistakes in
// setup or input, and for backend failures.

export class PrimeWayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrimeWayError';
  }
}

/** The recipient is not on the owner's approved list. Fail closed:
 *  nothing was quoted for sending, nothing was sent. */
export class RecipientNotAllowedError extends PrimeWayError {
  readonly recipient: string;
  readonly destinationChainId: number;
  constructor(recipient: string, destinationChainId: number) {
    super(
      `recipient ${recipient} is not on the approved list for chain ${destinationChainId}`,
    );
    this.name = 'RecipientNotAllowedError';
    this.recipient = recipient;
    this.destinationChainId = destinationChainId;
  }
}

/** The send request itself is wrong: bad amount, unknown chain or
 *  token, bad address, or no decision key and no nonce. */
export class InvalidSendError extends PrimeWayError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSendError';
  }
}

/** The backend answered with an error, or could not be reached. */
export class BackendError extends PrimeWayError {
  constructor(message: string) {
    super(message);
    this.name = 'BackendError';
  }
}

/** The quote came back without the transaction data the send needs.
 *  Nothing was sent. */
export class QuoteNotSendableError extends PrimeWayError {
  constructor() {
    super('quote has no send details');
    this.name = 'QuoteNotSendableError';
  }
}
