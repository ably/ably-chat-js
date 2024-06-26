import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * The different states that the connection can be in.
 */
export enum ConnectionStatus {
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
  status: ConnectionStatus;

  /**
   * An error that provides a reason why the connection has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;
}

/**
 * A function that can be called when the connection status changes.
 * @param change The change in status.
 */
export type ConnectionStatusListener = (change: ConnectionStatusChange) => void;

/**
 * The response from the `onStatusChange` method.
 */
export interface OnConnectionStatusChangeResponse {
  /**
   * Unregisters the listener that was added by the `onStatusChange` method.
   */
  off: () => void;
}

/**
 * Represents a connection to Ably.
 */
export interface Connection {
  /**
   * The current status of the connection.
   */
  get currentStatus(): ConnectionStatus;

  /**
   * The current error, if any, that caused the connection to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the connection status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onStatusChange(listener: ConnectionStatusListener): OnConnectionStatusChangeResponse;

  /**
   * Removes all listeners that were added by the `onStatusChange` method.
   */
  offAll(): void;
}

type ConnectionEventsMap = {
  [key in ConnectionStatus]: ConnectionStatusChange;
};

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnection extends EventEmitter<ConnectionEventsMap> implements Connection {
  private _status: ConnectionStatus = ConnectionStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _connection: Ably.Connection;
  private readonly _logger: Logger;

  /**
   * Constructs a new `DefaultConnection` instance.
   * @param ably The Ably Realtime client.
   * @param logger The logger to use.
   */
  constructor(ably: Ably.Realtime, logger: Logger) {
    super();
    this._logger = logger;

    // Set our initial status and error
    this._status = this.mapAblyStatusToChat(ably.connection.state);
    this._error = ably.connection.errorReason;

    // Listen for changes to the connection status
    this._connection = ably.connection;
    this._connection.on((change: Ably.ConnectionStateChange) => {
      const chatState = this.mapAblyStatusToChat(change.current);
      this._error = change.reason;
      if (chatState === this._status) {
        return;
      }

      this._status = chatState;

      const stateChange = { status: chatState, error: change.reason };
      this._logger.info(`Connection state is now ${chatState}`, change.reason ? { error: change.reason } : undefined);
      this.emit(chatState, stateChange);
    });
  }

  /**
   * @inheritdoc
   */
  get currentStatus(): ConnectionStatus {
    return this._status;
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
  onStatusChange(listener: ConnectionStatusListener): OnConnectionStatusChangeResponse {
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

  private mapAblyStatusToChat(status: Ably.ConnectionState): ConnectionStatus {
    switch (status) {
      case 'closing':
      case 'closed':
        return ConnectionStatus.Failed;
      default:
        return status as ConnectionStatus;
    }
  }
}
