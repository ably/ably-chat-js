import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Default timeout for transient states before we attempt handle them as a state change.
 */
const TRANSIENT_TIMEOUT = 5000;

/**
 * The different states that the connection can be in through its lifecycle.
 */
export enum ConnectionLifecycle {
  /**
   * A temporary state for when the library is first initialized.
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
  current: ConnectionLifecycle;

  /**
   * The previous status of the connection.
   */
  previous: ConnectionLifecycle;

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
  get current(): ConnectionLifecycle;

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
  [key in ConnectionLifecycle]: ConnectionStatusChange;
};

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnectionStatus extends EventEmitter<ConnectionEventsMap> implements ConnectionStatus {
  private _state: ConnectionLifecycle = ConnectionLifecycle.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _connection: Ably.Connection;
  private readonly _logger: Logger;
  private _transientTimeout?: ReturnType<typeof setTimeout>;

  /**
   * Constructs a new `DefaultConnection` instance.
   * @param ably The Ably Realtime client.
   * @param logger The logger to use.
   */
  constructor(ably: Ably.Realtime, logger: Logger) {
    super();
    this._logger = logger;

    // Set our initial status and error
    this._state = this._mapAblyStatusToChat(ably.connection.state);
    this._error = ably.connection.errorReason;

    // Listen for changes to the connection status
    this._connection = ably.connection;
    this._connection.on((change: Ably.ConnectionStateChange) => {
      const chatState = this._mapAblyStatusToChat(change.current);
      if (chatState === this._state) {
        return;
      }

      const stateChange: ConnectionStatusChange = {
        current: chatState,
        previous: this._state,
        error: change.reason,
        retryIn: change.retryIn,
      };

      // If we're in the disconnected state, assume it's transient and set a timeout to propagate the change
      if (chatState === ConnectionLifecycle.Disconnected && !this._transientTimeout) {
        this._transientTimeout = setTimeout(() => {
          this._transientTimeout = undefined;
          this._applyStatusChange(stateChange);
        }, TRANSIENT_TIMEOUT);
        return;
      }

      // If we're in any state other than disconnected, and we have a transient timeout, clear it
      if (this._transientTimeout) {
        clearTimeout(this._transientTimeout);
        this._transientTimeout = undefined;
      }

      this._applyStatusChange(stateChange);
    });
  }

  /**
   * @inheritdoc
   */
  get current(): ConnectionLifecycle {
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

  private _applyStatusChange(change: ConnectionStatusChange): void {
    this._state = change.current;
    this._error = change.error;
    this._logger.info(`Connection state changed`, change);
    this.emit(change.current, change);
  }

  private _mapAblyStatusToChat(status: Ably.ConnectionState): ConnectionLifecycle {
    switch (status) {
      case 'closing':
      case 'closed':
        return ConnectionLifecycle.Failed;
      default:
        return status as ConnectionLifecycle;
    }
  }
}
