import * as Ably from 'ably';

import { Logger } from './logger.js';
import { on } from './realtime-subscriptions.js';
import { StatusSubscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

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

  /**
   * An explicit request by the developer to close the connection has been sent to the Ably service.
   * If a reply is not received from Ably within a short period of time, the connection is forcibly
   * terminated and the connection status becomes Closed.
   */
  Closing = 'closing',

  /**
   * The connection has been explicitly closed by the client. In the closed state, no reconnection
   * attempts are made automatically. No connection state is preserved by the service or the library.
   */
  Closed = 'closed',
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
   * @returns The current ConnectionStatus value
   * @example
   * ```typescript
   * import { ChatClient, ConnectionStatus } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Check connection status
   * if (chatClient.connection.status === ConnectionStatus.Connected) {
   *   console.log('Connected to Ably');
   * } else if (chatClient.connection.status === ConnectionStatus.Failed) {
   *   console.error('Connection failed');
   * }
   *
   * // Use status for conditional logic
   * function canAttachToRoom(): boolean {
   *   return chatClient.connection.status === ConnectionStatus.Connected;
   * }
   * ```
   */
  get status(): ConnectionStatus;

  /**
   * The error that caused the connection to enter its current status, if any.
   * @returns ErrorInfo if an error caused the current status, undefined otherwise
   * @example
   * ```typescript
   * import { ChatClient, ConnectionStatus } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Check for connection errors
   * if (chatClient.connection.error) {
   *   console.error('Connection error:', chatClient.connection.error.message);
   *   console.error('Error code:', chatClient.connection.error.code);
   * }
   * // Monitor for errors during status changes
   * chatClient.connection.onStatusChange((change) => {
   *   if (change.error) {
   *     reportErrorToMonitoring(change.error);
   *   }
   * });
   * ```
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener to be notified of connection status changes.
   *
   * Status changes indicate the connection lifecycle, including connecting,
   * connected, disconnected, suspended, and failed states. Use this to monitor
   * connection health and handle network issues.
   * @param listener - Callback invoked when the connection status changes
   * @returns Subscription object with an off method to unregister
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, ConnectionStatus } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Monitor connection status changes
   * const { off } = chatClient.connection.onStatusChange((change) => {
   *   console.log(`Connection: ${change.previous} -> ${change.current}`);
   *
   *   // Handle different connection states..
   *   switch (change.current) {
   *     case ConnectionStatus.Connected:
   *       console.log('✅ Connected to Ably');
   *       enableChatFeatures();
   *       hideConnectionWarning();
   *       break;
   *
   *     case ConnectionStatus.Failed:
   *       console.error('❌ Connection failed permanently');
   *       if (change.error) {
   *         console.error('Failure reason:', change.error.message);
   *         showErrorMessage(`Connection failed: ${change.error.message}`);
   *       }
   *       requireManualReconnection();
   *       break;
   *
   *     // Other states: Connecting, Disconnected, Suspended
   *   }
   * });
   *
   * // Clean up when done
   * off();
   * ```
   */
  onStatusChange(listener: ConnectionStatusListener): StatusSubscription;
}

/**
 * An internal interface for the connection with additional methods.
 */
export interface InternalConnection extends Connection {
  /**
   * Disposes of the connection instance, cleaning up any registered listeners.
   * This method should be called when the connection is no longer needed.
   * @internal
   */
  dispose(): void;
}

type ConnectionEventsMap = Record<ConnectionStatus, ConnectionStatusChange>;

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnection implements InternalConnection {
  private _status: ConnectionStatus = ConnectionStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _logger: Logger;
  private _emitter = new EventEmitter<ConnectionEventsMap>();
  private readonly _clearAblyConnectionListener: () => void;

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

    // Store the listener function so we can dispose of it later
    const connectionListener = (change: Ably.ConnectionStateChange) => {
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
    };

    // Use subscription helper to create cleanup function
    this._clearAblyConnectionListener = on(ably.connection, connectionListener);
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

  /**
   * @inheritdoc
   */
  dispose(): void {
    this._logger.trace('DefaultConnection.dispose();');
    // Remove the connection state listener from the Ably connection
    this._clearAblyConnectionListener();
    // Clear all listeners from the internal emitter
    this._emitter.off();
  }

  /**
   * Checks if there are any listeners registered on the connection.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._emitter);
  }

  private _applyStatusChange(change: ConnectionStatusChange): void {
    this._status = change.current;
    this._error = change.error;
    this._logger.info(`Connection state changed`, change);
    this._emitter.emit(change.current, change);
  }

  /**
   * Maps an Ably connection state to a connection status.
   * @param status The Ably connection state to map.
   * @returns The corresponding connection status.
   */
  private _mapAblyStatusToChat(status: Ably.ConnectionState): ConnectionStatus {
    switch (status) {
      case 'initialized': {
        return ConnectionStatus.Initialized;
      }
      case 'connecting': {
        return ConnectionStatus.Connecting;
      }
      case 'connected': {
        return ConnectionStatus.Connected;
      }
      case 'disconnected': {
        return ConnectionStatus.Disconnected;
      }
      case 'suspended': {
        return ConnectionStatus.Suspended;
      }
      case 'closing': {
        return ConnectionStatus.Closing;
      }
      case 'closed': {
        return ConnectionStatus.Closed;
      }
      case 'failed': {
        return ConnectionStatus.Failed;
      }
      default: {
        this._logger.error('DefaultConnection._mapAblyStatusToChat(); unknown connection state', {
          status,
        });
        return ConnectionStatus.Failed;
      }
    }
  }
}
