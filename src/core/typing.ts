import * as Ably from 'ably';
import { E_CANCELED, Mutex } from 'async-mutex';

import { TypingEventType, TypingSetEvent, TypingSetEventType } from './events.js';
import { Logger } from './logger.js';
import { ephemeralMessage } from './realtime.js';
import { InternalTypingOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * This interface is used to interact with typing in a chat room including subscribing to typing events and
 * fetching the current set of typing clients.
 *
 * Get an instance via {@link Room.typing}.
 */
export interface Typing {
  /**
   * Subscribe a given listener to all typing events from users in the chat room.
   *
   * @param listener A listener to be called when the typing state of a user in the room changes.
   * @returns A response object that allows you to control the subscription to typing events.
   */
  subscribe(listener: TypingListener): Subscription;

  /**
   * Get the current typers, a set of clientIds.
   * @returns The set of clientIds that are currently typing.
   */
  current(): Set<string>;

  /**
   * This will send a `typing.started` event to the server.
   * Events are throttled according to the `heartbeatThrottleMs` room option.
   * If an event has been sent within the interval, this operation is no-op.
   *
   *
   * Calls to `keystroke()` and `stop()` are serialized and will always resolve in the correct order.
   * - For example, if multiple `keystroke()` calls are made in quick succession before the first `keystroke()` call has
   *   sent a `typing.started` event to the server, followed by one `stop()` call, the `stop()` call will execute
   *   as soon as the first `keystroke()` call completes.
   *   All intermediate `keystroke()` calls will be treated as no-ops.
   * - The most recent operation (`keystroke()` or `stop()`) will always determine the final state, ensuring operations
   *   resolve to a consistent and correct state.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an {@link Ably.ErrorInfo} object upon its failure.
   * @throws If the `Connection` is not in the `Connected` state.
   * @throws If the operation fails to send the event to the server.
   * @throws If there is a problem acquiring the mutex that controls serialization.
   */
  keystroke(): Promise<void>;

  /**
   * This will send a `typing.stopped` event to the server.
   * If the user was not currently typing, this operation is no-op.
   *
   * Calls to `keystroke()` and `stop()` are serialized and will always resolve in the correct order.
   * - For example, if multiple `keystroke()` calls are made in quick succession before the first `keystroke()` call has
   *   sent a `typing.started` event to the server, followed by one `stop()` call, the `stop()` call will execute
   *   as soon as the first `keystroke()` call completes.
   *   All intermediate `keystroke()` calls will be treated as no-ops.
   * - The most recent operation (`keystroke()` or `stop()`) will always determine the final state, ensuring operations
   *   resolve to a consistent and correct state.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an {@link Ably.ErrorInfo} object upon its failure.
   * @throws If the `Connection` is not in the `Connected` state.
   * @throws If the operation fails to send the event to the server.
   * @throws If there is a problem acquiring the mutex that controls serialization.
   */
  stop(): Promise<void>;
}

/**
 * A listener which listens for typing events.
 * @param event The typing event.
 */
export type TypingListener = (event: TypingSetEvent) => void;

/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
  [TypingSetEventType.SetChanged]: TypingSetEvent;
}

/**
 * Represents a timer handle that can be undefined.
 */
type TypingTimerHandle = ReturnType<typeof setTimeout> | undefined;

/**
 * @inheritDoc
 */
export class DefaultTyping extends EventEmitter<TypingEventsMap> implements Typing {
  private readonly _clientId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _connection: Ably.Connection;
  private readonly _logger: Logger;

  // Throttle for the heartbeat, how often we should emit a typing event with repeated calls to keystroke()
  // CHA-T10
  private readonly _heartbeatThrottleMs: number;

  // Grace period for inactivity before another user is considered to have stopped typing
  // CHA-T10a
  private readonly _timeoutMs = 2000;
  private _heartbeatTimerId: TypingTimerHandle;
  private readonly _currentlyTyping: Map<string, TypingTimerHandle>;

  // Mutex for controlling `keystroke` and `stop` operations
  private readonly _mutex = new Mutex();

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param options The options for typing in the room.
   * @param connection The connection instance.
   * @param channel The channel for the room.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    options: InternalTypingOptions,
    connection: Ably.Connection,
    channel: Ably.RealtimeChannel,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._clientId = clientId;
    this._channel = channel;
    this._connection = connection;

    // Interval for the heartbeat, how often we should emit a typing event with repeated calls to start()
    this._heartbeatThrottleMs = options.heartbeatThrottleMs;

    // Map of clientIds to their typing timers, used to track typing state
    this._currentlyTyping = new Map<string, TypingTimerHandle>();
    this._logger = logger;

    this._applyChannelSubscriptions();
  }

  /**
   * Sets up channel subscriptions for typing indicators.
   */
  private _applyChannelSubscriptions(): void {
    // CHA-T8
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.subscribe(
      [TypingEventType.Start, TypingEventType.Stop],
      this._internalSubscribeToEvents.bind(this),
    );
  }

  /**
   * Clears all typing states.
   * This includes clearing all timeouts and the currently typing map.
   * @private
   */
  private _clearAllTypingStates(): void {
    this._logger.debug(`DefaultTyping._clearAllTypingStates(); clearing all typing states`);
    this._clearHeartbeatTimer();
    this._clearCurrentlyTyping();
  }

  /**
   * Clears the heartbeat timer.
   * @private
   */
  private _clearHeartbeatTimer(): void {
    this._logger.trace(`DefaultTyping._clearHeartbeatTimer(); clearing heartbeat timer`);
    if (this._heartbeatTimerId) {
      clearTimeout(this._heartbeatTimerId);
      this._heartbeatTimerId = undefined;
    }
  }

  /**
   * Clears the currently typing store and removes all timeouts for associated clients.
   * @private
   */
  private _clearCurrentlyTyping(): void {
    this._logger.trace('DefaultTyping._clearCurrentlyTyping(); clearing current store and timeouts');
    // Clear all client typing timeouts
    for (const [, timeoutId] of this._currentlyTyping.entries()) {
      clearTimeout(timeoutId);
    }
    // Clear the currently typing map
    this._currentlyTyping.clear();
  }

  /**
   * CHA-T16
   *
   * @inheritDoc
   */
  current(): Set<string> {
    this._logger.trace(`DefaultTyping.current();`);
    return new Set<string>(this._currentlyTyping.keys());
  }

  /**
   * @inheritDoc
   */
  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  /**
   * Start the heartbeat timer. This will expire after the configured interval.
   */
  private _startHeartbeatTimer(): void {
    if (!this._heartbeatTimerId) {
      this._logger.trace(`DefaultTyping.startHeartbeatTimer();`);
      const timer = (this._heartbeatTimerId = setTimeout(() => {
        this._logger.debug(`DefaultTyping.startHeartbeatTimer(); heartbeat timer expired`);
        // CHA-T2a
        if (timer === this._heartbeatTimerId) {
          this._heartbeatTimerId = undefined;
        }
      }, this._heartbeatThrottleMs));
    }
  }

  /**
   * @inheritDoc
   */
  async keystroke(): Promise<void> {
    this._logger.trace(`DefaultTyping.keystroke();`);
    this._mutex.cancel();

    // Acquire a mutex
    try {
      await this._mutex.acquire();
    } catch (error: unknown) {
      if (error === E_CANCELED) {
        this._logger.debug(`DefaultTyping.keystroke(); mutex was canceled by a later operation`);
        return;
      }
      throw new Ably.ErrorInfo('mutex acquisition failed', 50000, 500);
    }
    try {
      // Check if connection is connected
      // CHA-T4e
      if (this._connection.state !== 'connected') {
        this._logger.error(`DefaultTyping.keystroke(); connection is not connected`, {
          status: this._connection.state,
        });
        throw new Ably.ErrorInfo('cannot type, connection is not connected', 40000, 400);
      }

      // Check whether user is already typing before publishing again
      // CHA-T4c1, CHA-T4c2
      if (this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.keystroke(); no-op, already typing and heartbeat timer has not expired`);
        return;
      }

      // Perform the publish
      // CHA-T4a3
      await this._channel.publish(ephemeralMessage(TypingEventType.Start));

      // Start the timer after publishing
      // CHA-T4a5
      this._startHeartbeatTimer();
      this._logger.trace(`DefaultTyping.keystroke(); starting timers`);
    } finally {
      this._logger.trace(`DefaultTyping.keystroke(); releasing mutex`);
      this._mutex.release();
    }
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);

    this._mutex.cancel();
    // Acquire a mutex
    try {
      await this._mutex.acquire();
    } catch (error: unknown) {
      if (error === E_CANCELED) {
        this._logger.debug(`DefaultTyping.stop(); mutex was canceled by a later operation`);
        return;
      }
      throw new Ably.ErrorInfo('mutex acquisition failed', 50000, 500);
    }
    try {
      // Check if connection is connected
      if (this._connection.state !== 'connected') {
        this._logger.error(`DefaultTyping.stop(); connection is not connected`, {
          status: this._connection.state,
        });
        throw new Ably.ErrorInfo('cannot stop typing, connection is not connected', 40000, 400);
      }

      // If the user is not typing, do nothing.
      // CHA-T5f
      if (!this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.stop(); no-op, not currently typing`);
        return;
      }

      // CHA-T5d
      await this._channel.publish(ephemeralMessage(TypingEventType.Stop));
      this._logger.trace(`DefaultTyping.stop(); clearing timers`);

      // CHA-T5e
      // Clear the heartbeat timer
      clearTimeout(this._heartbeatTimerId);
      this._heartbeatTimerId = undefined;
    } finally {
      this._logger.trace(`DefaultTyping.stop(); releasing mutex`);
      this._mutex.release();
    }
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: TypingListener): Subscription {
    this._logger.trace(`DefaultTyping.subscribe();`);
    const wrapped = wrap(listener);
    this.on(wrapped);

    return {
      unsubscribe: () => {
        this._logger.trace('DefaultTyping.unsubscribe();');
        this.off(wrapped);
      },
    };
  }

  /**
   * @inheritDoc
   */
  // CHA-RL3h
  async dispose(): Promise<void> {
    this._logger.trace(`DefaultTyping.dispose();`);

    // Keep trying to acquire the mutex; wait 200 ms between attempts.
    for (;;) {
      try {
        this._mutex.cancel();
        await this._mutex.acquire();
        break; // success – exit the loop
      } catch (error: unknown) {
        if (error === E_CANCELED) {
          // In this case, the mutex was canceled by a later operation,
          // but we are trying to release, so we should always take precedence here.
          // Let's continue trying to acquire it until we win the acquisition lock.
          this._logger.debug(`DefaultTyping.dispose(); mutex was canceled`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          this._logger.debug(`DefaultTyping.dispose(); retrying mutex acquisition`);
        } else {
          // If we encounter any other error, we log it and exit the loop.
          // This is to ensure that we don't get stuck in an infinite loop
          // if the mutex acquisition fails for some other non-retryable reason.
          this._logger.error(`DefaultTyping.dispose(); failed to acquire mutex; could not complete resource disposal`, {
            error,
          });
          return;
        }
      }
    }
    this._clearAllTypingStates();
    this._mutex.release();
  }

  /**
   * Update the currently typing users. This method is called when a typing event is received.
   * It will also acquire a mutex to ensure that the currentlyTyping state is updated safely.
   * @param clientId The client ID of the user.
   * @param event The typing event.
   */
  private _updateCurrentlyTyping(clientId: string, event: TypingEventType): void {
    this._logger.trace(`DefaultTyping._updateCurrentlyTyping();`, { clientId, event });

    if (event === TypingEventType.Start) {
      this._handleTypingStart(clientId);
    } else {
      this._handleTypingStop(clientId);
    }
  }

  /**
   * Starts a new inactivity timer for the client.
   * This timer will expire after the configured timeout,
   * which is the sum of the heartbeat interval and the inactivity timeout.
   * @param clientId
   */
  private _startNewClientInactivityTimer(clientId: string): ReturnType<typeof setTimeout> {
    this._logger.trace(`DefaultTyping._startNewClientInactivityTimer(); starting new inactivity timer`, {
      clientId,
    });
    // Set or reset the typing timeout for this client
    const timeoutId = setTimeout(() => {
      this._logger.trace(`DefaultTyping._startNewClientInactivityTimer(); client typing timeout expired`, {
        clientId,
      });
      // Verify the timer is still valid (it might have been reset)
      if (this._currentlyTyping.get(clientId) !== timeoutId) {
        this._logger.debug(`DefaultTyping._startNewClientInactivityTimer(); timeout already cleared; ignoring`, {
          clientId,
        });
        return;
      }

      // Remove client whose timeout has expired
      this._currentlyTyping.delete(clientId);
      this.emit(TypingSetEventType.SetChanged, {
        type: TypingSetEventType.SetChanged,
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEventType.Stop,
        },
      });
    }, this._heartbeatThrottleMs + this._timeoutMs);
    return timeoutId;
  }

  /**
   * Handles logic for TypingEventType.Start, including starting a new timeout or resetting an existing one.
   * @param clientId
   */
  private _handleTypingStart(clientId: string): void {
    this._logger.debug(`DefaultTyping._handleTypingStart();`, { clientId });
    // Start a new timeout for the client
    const timeoutId = this._startNewClientInactivityTimer(clientId);

    const existingTimeout = this._currentlyTyping.get(clientId);

    // Set the new timeout for the client
    this._currentlyTyping.set(clientId, timeoutId);

    if (existingTimeout) {
      // Heartbeat - User is already typing, we just need to clear the existing timeout
      this._logger.debug(`DefaultTyping._handleTypingStart(); received heartbeat for currently typing client`, {
        clientId,
      });
      clearTimeout(existingTimeout);
    } else {
      // Otherwise, we need to emit a new typing event
      this._logger.debug(`DefaultTyping._handleTypingStart(); new client started typing`, {
        clientId,
      });
      this.emit(TypingSetEventType.SetChanged, {
        type: TypingSetEventType.SetChanged,
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEventType.Start,
        },
      });
    }
  }

  /**
   * Handles logic for TypingEventType.Stop, including clearing the timeout for the client.
   * @param clientId
   * @private
   */
  private _handleTypingStop(clientId: string): void {
    const existingTimeout = this._currentlyTyping.get(clientId);
    if (!existingTimeout) {
      // Stop requested for a client that isn't currently typing
      this._logger.trace(
        `DefaultTyping._handleTypingStop(); received "Stop" event for client not in currentlyTyping list`,
        { clientId },
      );
      return;
    }

    // Stop typing: clear their timeout and remove from the currently typing set
    this._logger.debug(`DefaultTyping._handleTypingStop(); client stopped typing`, { clientId });
    clearTimeout(existingTimeout);
    this._currentlyTyping.delete(clientId);
    // Emit stop event only when the client is removed
    this.emit(TypingSetEventType.SetChanged, {
      type: TypingSetEventType.SetChanged,
      currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
      change: {
        clientId,
        type: TypingEventType.Stop,
      },
    });
  }

  /**
   * Subscribe to internal events. This listens to events and converts them into typing updates, with validation.
   */
  private _internalSubscribeToEvents = (inbound: Ably.InboundMessage): void => {
    const { name, clientId } = inbound;
    this._logger.trace(`DefaultTyping._internalSubscribeToEvents(); received event`, {
      name,
      clientId,
    });

    if (!clientId) {
      this._logger.error(`DefaultTyping._internalSubscribeToEvents(); invalid clientId in received event`, {
        inbound,
      });
      return;
    }

    // Safety check to ensure we are handling only typing events
    if (name === TypingEventType.Start || name === TypingEventType.Stop) {
      this._updateCurrentlyTyping(clientId, name);
    } else {
      this._logger.warn(`DefaultTyping._internalSubscribeToEvents(); unrecognized event`, {
        name,
      });
    }
  };

  get heartbeatThrottleMs(): number {
    return this._heartbeatThrottleMs;
  }

  get hasHeartbeatTimer(): boolean {
    return !!this._heartbeatTimerId;
  }
}
