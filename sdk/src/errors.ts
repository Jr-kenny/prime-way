// Typed errors. These are for mistakes in setup or input, and for
// backend failures. A send that goes out and then fails on-chain is
// not an error here: it comes back in the receipt's status.

export class PrimeWayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrimeWayError';
  }
}

/** The send request itself is wrong: bad amount, unknown chain or
 *  token, or a bad address. */
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
