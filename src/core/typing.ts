import * as Ably from 'ably';
import { E_CANCELED, Mutex } from 'async-mutex';

import { ErrorCode } from './errors.js';
import { TypingEventType, TypingSetEvent, TypingSetEventType } from './events.js';
import { Logger } from './logger.js';
import { ephemeralMessage } from './realtime.js';
import { subscribe } from './realtime-subscriptions.js';
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
   * Subscribes to typing events from users in the chat room.
   *
   * Receives updates whenever a user starts or stops typing, providing real-time
   * feedback about who is currently composing messages. The subscription emits
   * events containing the current set of typing users and details about what changed.
   *
   * **Note**: The room must be attached to receive typing events.
   * @param listener - Callback invoked when the typing state changes
   * @returns Subscription object with an unsubscribe method
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, TypingSetEvent } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('team-chat');
   *
   * // Subscribe to typing events
   * const subscription = room.typing.subscribe((event: TypingSetEvent) => {
   *   const { currentlyTyping, change } = event;
   *
   *   // Display who is currently typing
   *   if (currentlyTyping.size === 0) {
   *     hideTypingIndicator();
   *   } else if (currentlyTyping.size === 1) {
   *     const [typingUser] = Array.from(currentlyTyping);
   *     showTypingIndicator(`${typingUser} is typing...`);
   *   } else if (currentlyTyping.size === 2) {
   *     const users = Array.from(currentlyTyping);
   *     showTypingIndicator(`${users[0]} and ${users[1]} are typing...`);
   *   } else {
   *     showTypingIndicator(`${currentlyTyping.size} people are typing...`);
   *   }
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Later, unsubscribe when done
   * subscription.unsubscribe();
   * ```
   */
  subscribe(listener: TypingListener): Subscription;

  /**
   * Gets the current set of users who are typing.
   *
   * Returns a Set containing the client IDs of all users currently typing in the room.
   * This provides a snapshot of the typing state at the time of the call.
   * @returns Set of client IDs currently typing
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('support-chat');
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Fetch the current cached set of typing users
   * const typingUsers = room.typing.current();
   *
   * console.log(`${typingUsers.size} users are typing`);
   *
   * if (typingUsers.has('agent-001')) {
   *   console.log('Support agent is typing a response...');
   * }
   * ```
   */
  get current(): Set<string>;

  /**
   * Sends a typing started event to notify other users that the current user is typing.
   *
   * Events are throttled according to the `heartbeatThrottleMs` room option to prevent
   * excessive network traffic. If called within the throttle interval, the operation
   * becomes a no-op. Multiple rapid calls are serialized to maintain consistency.
   *
   * **Note**:
   * - The connection must be in the `connected` state.
   * - Calls to `keystroke()` and `stop()` are serialized and resolve in order.
   * - The most recent operation always determines the final typing state.
   * - The room must be attached to send typing events.
   * @returns Promise that resolves when the typing event has been sent
   * @throws {Ably.ErrorInfo} with code 40000 if not connected
   * @throws {Ably.ErrorInfo} with code 50000 if mutex acquisition fails
   * @throws {Ably.ErrorInfo} if the operation fails to send the event
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('project-discussion');
   * await room.attach();
   *
   * try {
   *     await room.typing.keystroke();
   * } catch (error) {
   *     console.error('Typing indicator error:', error);
   *   }
   * ```
   */
  keystroke(): Promise<void>;

  /**
   * Sends a typing stopped event to notify other users that the current user has stopped typing.
   *
   * If the user is not currently typing, this operation is a no-op. Multiple rapid calls
   * are serialized to maintain consistency, with the most recent operation determining
   * the final state.
   *
   * **Note**:
   * - The connection must be in the `connected` state.
   * - Calls to `keystroke()` and `stop()` are serialized and resolve in order.
   * - The room must be attached to send typing events.
   * @returns Promise that resolves when the stop event has been sent
   * @throws {Ably.ErrorInfo} with code 40000 if not connected
   * @throws {Ably.ErrorInfo} with code 50000 if mutex acquisition fails
   * @throws {Ably.ErrorInfo} if the operation fails to send the event
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('customer-support');
   * await room.attach();
   *
   * // Start typing in the room
   * try {
   *  await room.typing.keystroke();
   *  } catch (error) {
   *  console.error('Typing indicator error:', error);
   *  }
   *
   *  // User sends a message, or deletes their draft, etc.
   *
   * // Stop typing in the room
   * try {
   * await room.typing.stop();
   * } catch (error) {
   * console.error('Failed to stop typing:', error);
   * }
   * ```
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

  // Cleanup function for the channel subscription
  private readonly _unsubscribeTypingEvents: () => void;

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param options The options for typing in the room.
   * @param connection The connection instance.
   * @param channel The channel for the room.
   * @param logger An instance of the Logger.
   */
  constructor(
    options: InternalTypingOptions,
    connection: Ably.Connection,
    channel: Ably.RealtimeChannel,
    logger: Logger,
  ) {
    super();
    this._channel = channel;
    this._connection = connection;

    // Interval for the heartbeat, how often we should emit a typing event with repeated calls to start()
    this._heartbeatThrottleMs = options.heartbeatThrottleMs;

    // Map of clientIds to their typing timers, used to track typing state
    this._currentlyTyping = new Map<string, TypingTimerHandle>();
    this._logger = logger;

    // Use subscription helper to create cleanup function
    this._unsubscribeTypingEvents = subscribe(
      this._channel,
      [TypingEventType.Started, TypingEventType.Stopped],
      this._internalSubscribeToEvents.bind(this),
    );
  }

  /**
   * Clears all typing states.
   * This includes clearing all timeouts and the currently typing map.
   */
  private _clearAllTypingStates(): void {
    this._logger.debug(`DefaultTyping._clearAllTypingStates(); clearing all typing states`);
    this._clearHeartbeatTimer();
    this._clearCurrentlyTyping();
  }

  /**
   * Clears the heartbeat timer.
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
   * @inheritDoc
   */
  get current(): Set<string> {
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
      throw new Ably.ErrorInfo(
        'unable to send keystroke event; failed to enforce sequential execution of the operation',
        ErrorCode.OperationSerializationFailed,
        500,
      );
    }
    try {
      // Check if connection is connected
      // CHA-T4e
      if (this._connection.state !== 'connected') {
        this._logger.error(`DefaultTyping.keystroke(); connection is not connected`, {
          status: this._connection.state,
        });
        throw new Ably.ErrorInfo(
          'unable to send typing keystroke event; disconnected from Ably',
          ErrorCode.Disconnected,
          400,
        );
      }

      // Check whether user is already typing before publishing again
      // CHA-T4c1, CHA-T4c2
      if (this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.keystroke(); no-op, already typing and heartbeat timer has not expired`);
        return;
      }

      // Perform the publish
      // CHA-T4a3
      await this._channel.publish(ephemeralMessage(TypingEventType.Started));

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
      throw new Ably.ErrorInfo(
        'unable to send typing stop event; failed to enforce sequential execution of the operation',
        ErrorCode.OperationSerializationFailed,
        500,
      );
    }
    try {
      // Check if connection is connected
      if (this._connection.state !== 'connected') {
        this._logger.error(`DefaultTyping.stop(); connection is not connected`, {
          status: this._connection.state,
        });
        throw new Ably.ErrorInfo(
          'unable to send typing stop event; disconnected from Ably',
          ErrorCode.Disconnected,
          400,
        );
      }

      // If the user is not typing, do nothing.
      // CHA-T5f
      if (!this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.stop(); no-op, not currently typing`);
        return;
      }

      // CHA-T5d
      await this._channel.publish(ephemeralMessage(TypingEventType.Stopped));
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
    this._unsubscribeTypingEvents();
    this.off();
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

    if (event === TypingEventType.Started) {
      this._handleTypingStart(clientId);
    } else {
      this._handleTypingStop(clientId);
    }
  }

  /**
   * Starts a new inactivity timer for the client.
   * This timer will expire after the configured timeout,
   * which is the sum of the heartbeat interval and the inactivity timeout.
   * @param clientId The client ID for which to start the timer.
   * @returns The timeout ID for the new timer.
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
          type: TypingEventType.Stopped,
        },
      });
    }, this._heartbeatThrottleMs + this._timeoutMs);
    return timeoutId;
  }

  /**
   * Handles logic for TypingEventType.Started, including starting a new timeout or resetting an existing one.
   * @param clientId The client ID that started typing.
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
          type: TypingEventType.Started,
        },
      });
    }
  }

  /**
   * Handles logic for TypingEventType.Stopped, including clearing the timeout for the client.
   * @param clientId The client ID that stopped typing.
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
        type: TypingEventType.Stopped,
      },
    });
  }

  /**
   * Subscribe to internal events. This listens to events and converts them into typing updates, with validation.
   * @param inbound The inbound message containing typing event data.
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
    if (name === TypingEventType.Started || name === TypingEventType.Stopped) {
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
