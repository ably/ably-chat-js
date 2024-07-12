import { ConnectionStatus } from './ConnectionStatus.js';

/**
 * Represents a connection to Ably.
 */
export interface Connection {
  /**
   * The current status of the connection.
   */
  status: ConnectionStatus;
}

/**
 * A default implementation of the `Connection` interface.
 */
export class DefaultConnection implements Connection {
  constructor(private readonly _status: ConnectionStatus) {}

  get status(): ConnectionStatus {
    return this._status;
  }
}
