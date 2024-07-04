import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * The different states that the connection can be in.
 */
export enum ConnectionState {
  /**
   * A temporary state for when the library is first initialised.
   */
  Initialized = 'initialized',

  /**
   * The library is currently connecting to Ably.
   */
  Connecting = 'connecting',

  /**
   * The library is currently connected to Ably.
   */
  Connected = 'connected',

  /**
   * The library is currently disconnected from Ably, but will attempt to reconnect.
   */
  Disconnected = 'disconnected',

  /**
   * The library is in an extended state of disconnection, but will attempt to reconnect.
   */
  Suspended = 'suspended',

  /**
   * The library is currently disconnected from Ably and will not attempt to reconnect.
   */
  Failed = 'failed',
}

/**
 * Represents a change in the status of the connection.
 */
export interface ConnectionStatusChange {
  /**
   * The new status of the connection.
   */
  state: ConnectionState;

  /**
   * An error that provides a reason why the connection has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;

  /**
   * The time in milliseconds that the client will wait before attempting to reconnect.
   */
  retryIn?: number;
}

/**
 * A function that can be called when the connection status changes.
 * @param change The change in status.
 */
export type ConnectionStatusListener = (change: ConnectionStatusChange) => void;

/**
 * The response from the `onChange` method.
 */
export interface OnConnectionStatusChangeResponse {
  /**
   * Unregisters the listener that was added by the `onChange` method.
   */
  off: () => void;
}

/**
 * Represents a connection to Ably.
 */
export interface ConnectionStatus {
  /**
   * The current status of the connection.
   */
  get current(): ConnectionState;

  /**
   * The current error, if any, that caused the connection to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the connection status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onChange(listener: ConnectionStatusListener): OnConnectionStatusChangeResponse;

  /**
   * Removes all listeners that were added by the `onChange` method.
   */
  offAll(): void;
}

type ConnectionEventsMap = {
  [key in ConnectionState]: ConnectionStatusChange;
};

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnectionStatus extends EventEmitter<ConnectionEventsMap> implements ConnectionStatus {
  private _state: ConnectionState = ConnectionState.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _connection: Ably.Connection;
  private readonly _logger: Logger;
  private _transientTimeout?: ReturnType<typeof setTimeout>;
  private readonly TRANSIENT_TIMEOUT = 5000;

  /**
   * Constructs a new `DefaultConnection` instance.
   * @param ably The Ably Realtime client.
   * @param logger The logger to use.
   */
  constructor(ably: Ably.Realtime, logger: Logger) {
    super();
    this._logger = logger;

    // Set our initial status and error
    this._state = this.mapAblyStatusToChat(ably.connection.state);
    this._error = ably.connection.errorReason;

    // Listen for changes to the connection status
    this._connection = ably.connection;
    this._connection.on((change: Ably.ConnectionStateChange) => {
      const chatState = this.mapAblyStatusToChat(change.current);
      if (chatState === this._state) {
        return;
      }

      const stateChange = { state: chatState, error: change.reason, retryIn: change.retryIn };

      // If we're in the disconnected state, assume it's transient and set a timeout to propagate the change
      if (chatState === ConnectionState.Disconnected && !this._transientTimeout) {
        this._transientTimeout = setTimeout(() => {
          this._transientTimeout = undefined;
          this.applyStatusChange(stateChange);
        }, this.TRANSIENT_TIMEOUT);
        return;
      }

      // If we're in any state other than disconnected, and we have a transient timeout, clear it
      if (this._transientTimeout) {
        clearTimeout(this._transientTimeout);
        this._transientTimeout = undefined;
      }

      this.applyStatusChange(stateChange);
    });
  }

  /**
   * @inheritdoc
   */
  get current(): ConnectionState {
    return this._state;
  }

  /**
   * @inheritdoc
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._error;
  }

  /**
   * @inheritdoc
   */
  onChange(listener: ConnectionStatusListener): OnConnectionStatusChangeResponse {
    this.on(listener);

    return {
      off: () => {
        this.off(listener);
      },
    };
  }

  /**
   * @inheritdoc
   */
  offAll(): void {
    this.off();
  }

  private applyStatusChange(change: ConnectionStatusChange): void {
    this._state = change.state;
    this._error = change.error;
    this._logger.info(`Connection state is now ${change.state}`, { error: change.error, retryIn: change.retryIn });
    this.emit(change.state, change);
  }

  private mapAblyStatusToChat(status: Ably.ConnectionState): ConnectionState {
    switch (status) {
      case 'closing':
      case 'closed':
        return ConnectionState.Failed;
      default:
        return status as ConnectionState;
    }
  }
}
