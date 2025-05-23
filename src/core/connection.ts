import * as Ably from 'ably';

import { Logger } from './logger.js';
import { StatusSubscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * The different states that the connection can be in through its lifecycle.
 */
export enum ConnectionStatus {
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
  current: ConnectionStatus;

  /**
   * The previous status of the connection.
   */
  previous: ConnectionStatus;

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
 * Represents a connection to Ably.
 */
export interface Connection {
  /**
   * The current status of the connection.
   */
  get status(): ConnectionStatus;

  /**
   * The current error, if any, that caused the connection to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the connection status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onStatusChange(listener: ConnectionStatusListener): StatusSubscription;
}

type ConnectionEventsMap = Record<ConnectionStatus, ConnectionStatusChange>;

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnection implements Connection {
  private _status: ConnectionStatus = ConnectionStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _connection: Ably.Connection;
  private readonly _logger: Logger;
  private _emitter = new EventEmitter<ConnectionEventsMap>();

  /**
   * Constructs a new `DefaultConnection` instance.
   * @param ably The Ably Realtime client.
   * @param logger The logger to use.
   */
  constructor(ably: Ably.Realtime, logger: Logger) {
    this._logger = logger;

    // Set our initial status and error
    // CHA-RS5
    this._status = this._mapAblyStatusToChat(ably.connection.state);
    this._error = ably.connection.errorReason;

    // Listen for changes to the connection status
    this._connection = ably.connection;
    this._connection.on((change: Ably.ConnectionStateChange) => {
      const chatState = this._mapAblyStatusToChat(change.current);
      if (chatState === this._status) {
        return;
      }

      const stateChange: ConnectionStatusChange = {
        current: chatState,
        previous: this._status,
        error: change.reason,
        retryIn: change.retryIn,
      };

      this._applyStatusChange(stateChange);
    });
  }

  /**
   * @inheritdoc
   */
  get status(): ConnectionStatus {
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
  onStatusChange(listener: ConnectionStatusListener): StatusSubscription {
    const wrapped = wrap(listener);
    this._emitter.on(wrapped);

    return {
      off: () => {
        this._emitter.off(wrapped);
      },
    };
  }

  private _applyStatusChange(change: ConnectionStatusChange): void {
    this._status = change.current;
    this._error = change.error;
    this._logger.info(`Connection state changed`, change);
    this._emitter.emit(change.current, change);
  }

  private _mapAblyStatusToChat(status: Ably.ConnectionState): ConnectionStatus {
    switch (status) {
      case 'closing':
      case 'closed': {
        return ConnectionStatus.Failed;
      }
      default: {
        return status as ConnectionStatus;
      }
    }
  }
}
