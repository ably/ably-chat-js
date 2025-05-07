import * as Ably from 'ably';
import { E_CANCELED, Mutex } from 'async-mutex';

import { TypingEventTypes, TypingSetEvent, TypingSetEventTypes } from './events.js';
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
   * Unsubscribe all listeners from receiving typing events.
   */
  unsubscribeAll(): void;

  /**
   * Get the current typers, a set of clientIds.
   * @returns The set of clientIds that are currently typing.
   */
  get(): Set<string>;

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
   * @throws If the `RoomStatus` is not either `Attached` or `Attaching`.
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
   * @throws If the `RoomStatus` is not either `Attached` or `Attaching`.
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
  [TypingSetEventTypes.SetChanged]: TypingSetEvent;
}

/**
 * Represents a timer handle that can be undefined.
 */
type TypingTimerHandle = ReturnType<typeof setTimeout> | undefined;

/**
 * @inheritDoc
 */
export class DefaultTyping extends EventEmitter<TypingEventsMap> implements Typing {
  private readonly _roomId: string;
  private readonly _clientId: string;
  private readonly _channel: Ably.RealtimeChannel;
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
   * @param roomId The unique identifier of the room.
   * @param options The options for typing in the room.
   * @param channel The channel for the room.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    options: InternalTypingOptions,
    channel: Ably.RealtimeChannel,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._roomId = roomId;
    this._clientId = clientId;
    this._channel = channel;

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
      [TypingEventTypes.Start, TypingEventTypes.Stop],
      this._internalSubscribeToEvents.bind(this),
    );
  }

  /**
   * CHA-T9
   *
   * @inheritDoc
   */
  get(): Set<string> {
    this._logger.trace(`DefaultTyping.get();`, { roomId: this._roomId });
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
      this._logger.trace(`DefaultTyping.startHeartbeatTimer();`, { roomId: this._roomId });
      const timer = (this._heartbeatTimerId = setTimeout(() => {
        this._logger.debug(`DefaultTyping.startHeartbeatTimer(); heartbeat timer expired`, { roomId: this._roomId });
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
    this._logger.trace(`DefaultTyping.keystroke();`, { roomId: this._roomId });
    this._mutex.cancel();

    // Acquire a mutex
    await this._mutex.acquire().catch((error: unknown) => {
      if (error === E_CANCELED) {
        this._logger.debug(`DefaultTyping.keystroke(); mutex was canceled by a later operation`, {
          roomId: this._roomId,
        });
        return;
      }
      throw new Ably.ErrorInfo('mutex acquisition failed', 50000, 500);
    });
    try {
      // CHA-T4d
      // Ensure room is attached
      if (this.channel.state !== 'attached' && this.channel.state !== 'attaching') {
        this._logger.error(`DefaultTyping.keystroke(); room is not in the correct state `, {
          roomId: this._roomId,
          state: this.channel.state,
        });
        throw new Ably.ErrorInfo('cannot type, room is not in the correct state', 50000, 500);
      }

      // Check whether user is already typing before publishing again
      // CHA-T4c1, CHA-T4c2
      if (this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.keystroke(); no-op, already typing and heartbeat timer has not expired`, {
          roomId: this._roomId,
        });
        return;
      }

      // Perform the publish
      // CHA-T4a3
      await this._channel.publish(ephemeralMessage(TypingEventTypes.Start));

      // Start the timer after publishing
      // CHA-T4a5
      this._startHeartbeatTimer();
      this._logger.trace(`DefaultTyping.keystroke(); starting timers`, { roomId: this._roomId });
    } finally {
      this._logger.trace(`DefaultTyping.keystroke(); releasing mutex`, { roomId: this._roomId });
      this._mutex.release();
    }
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`, { roomId: this._roomId });

    this._mutex.cancel();
    // Acquire a mutex
    await this._mutex.acquire().catch((error: unknown) => {
      if (error === E_CANCELED) {
        this._logger.debug(`DefaultTyping.stop(); mutex was canceled by a later operation`, { roomId: this._roomId });
        return;
      }
      throw new Ably.ErrorInfo('mutex acquisition failed', 50000, 500);
    });
    try {
      // CHA-T5c
      if (this.channel.state !== 'attached' && this.channel.state !== 'attaching') {
        this._logger.error(`DefaultTyping.stop(); room is not in the correct state `, {
          roomId: this._roomId,
          state: this.channel.state,
        });
        throw new Ably.ErrorInfo('cannot stop typing, room is not in the correct state', 50000, 500);
      }

      // If the user is not typing, do nothing.
      // CHA-T5a
      if (!this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.stop(); no-op, not currently typing`, { roomId: this._roomId });
        return;
      }

      // CHA-T5d
      await this._channel.publish(ephemeralMessage(TypingEventTypes.Stop));
      this._logger.trace(`DefaultTyping.stop(); clearing timers`, { roomId: this._roomId });

      // CHA-T5e
      // Clear the heartbeat timer
      clearTimeout(this._heartbeatTimerId);
      this._heartbeatTimerId = undefined;
    } finally {
      this._logger.trace(`DefaultTyping.stop(); releasing mutex`, { roomId: this._roomId });
      this._mutex.release();
    }
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: TypingListener): Subscription {
    this._logger.trace(`DefaultTyping.subscribe();`, { roomId: this._roomId });
    const wrapped = wrap(listener);
    this.on(wrapped);

    return {
      unsubscribe: () => {
        this._logger.trace('DefaultTyping.unsubscribe();', { roomId: this._roomId });
        this.off(wrapped);
      },
    };
  }

  /**
   * @inheritDoc
   */
  unsubscribeAll(): void {
    this._logger.trace(`DefaultTyping.unsubscribeAll();`, { roomId: this._roomId });
    this.off();
  }

  /**
   * Update the currently typing users. This method is called when a typing event is received.
   * It will also acquire a mutex to ensure that the currentlyTyping state is updated safely.
   * @param clientId The client ID of the user.
   * @param event The typing event.
   */
  private _updateCurrentlyTyping(clientId: string, event: TypingEventTypes): void {
    this._logger.trace(`DefaultTyping._updateCurrentlyTyping();`, { roomId: this._roomId, clientId, event });

    if (event === TypingEventTypes.Start) {
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
      roomId: this._roomId,
      clientId,
    });
    // Set or reset the typing timeout for this client
    const timeoutId = setTimeout(() => {
      this._logger.trace(`DefaultTyping._startNewClientInactivityTimer(); client typing timeout expired`, {
        roomId: this._roomId,
        clientId,
      });
      // Verify the timer is still valid (it might have been reset)
      if (this._currentlyTyping.get(clientId) !== timeoutId) {
        this._logger.debug(`DefaultTyping._startNewClientInactivityTimer(); timeout already cleared; ignoring`, {
          roomId: this._roomId,
          clientId,
        });
        return;
      }

      // Remove client whose timeout has expired
      this._currentlyTyping.delete(clientId);
      this.emit(TypingSetEventTypes.SetChanged, {
        type: TypingSetEventTypes.SetChanged,
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEventTypes.Stop,
        },
      });
    }, this._heartbeatThrottleMs + this._timeoutMs);
    return timeoutId;
  }

  /**
   * Handles logic for TypingEventTypes.Start, including starting a new timeout or resetting an existing one.
   * @param clientId
   */
  private _handleTypingStart(clientId: string): void {
    this._logger.debug(`DefaultTyping._handleTypingStart();`, { roomId: this._roomId, clientId });
    // Start a new timeout for the client
    const timeoutId = this._startNewClientInactivityTimer(clientId);

    const existingTimeout = this._currentlyTyping.get(clientId);

    // Set the new timeout for the client
    this._currentlyTyping.set(clientId, timeoutId);

    if (existingTimeout) {
      // Heartbeat - User is already typing, we just need to clear the existing timeout
      this._logger.debug(`DefaultTyping._handleTypingStart(); received heartbeat for currently typing client`, {
        roomId: this._roomId,
        clientId,
      });
      clearTimeout(existingTimeout);
    } else {
      // Otherwise, we need to emit a new typing event
      this._logger.debug(`DefaultTyping._handleTypingStart(); new client started typing`, {
        roomId: this._roomId,
        clientId,
      });
      this.emit(TypingSetEventTypes.SetChanged, {
        type: TypingSetEventTypes.SetChanged,
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEventTypes.Start,
        },
      });
    }
  }

  /**
   * Handles logic for TypingEventTypes.Stop, including clearing the timeout for the client.
   * @param clientId
   * @private
   */
  private _handleTypingStop(clientId: string): void {
    const existingTimeout = this._currentlyTyping.get(clientId);
    if (!existingTimeout) {
      // Stop requested for a client that isn't currently typing
      this._logger.trace(
        `DefaultTyping._handleTypingStop(); received "Stop" event for client not in currentlyTyping list`,
        { roomId: this._roomId, clientId },
      );
      return;
    }

    // Stop typing: clear their timeout and remove from the currently typing set
    this._logger.debug(`DefaultTyping._handleTypingStop(); client stopped typing`, { roomId: this._roomId, clientId });
    clearTimeout(existingTimeout);
    this._currentlyTyping.delete(clientId);
    // Emit stop event only when the client is removed
    this.emit(TypingSetEventTypes.SetChanged, {
      type: TypingSetEventTypes.SetChanged,
      currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
      change: {
        clientId,
        type: TypingEventTypes.Stop,
      },
    });
  }

  /**
   * Subscribe to internal events. This listens to events and converts them into typing updates, with validation.
   */
  private _internalSubscribeToEvents = (inbound: Ably.InboundMessage): void => {
    const { name, clientId } = inbound;
    this._logger.trace(`DefaultTyping._internalSubscribeToEvents(); received event`, {
      roomId: this._roomId,
      name,
      clientId,
    });

    if (!clientId) {
      this._logger.error(`DefaultTyping._internalSubscribeToEvents(); invalid clientId in received event`, {
        roomId: this._roomId,
        inbound,
      });
      return;
    }

    // Safety check to ensure we are handling only typing events
    if (name === TypingEventTypes.Start || name === TypingEventTypes.Stop) {
      this._updateCurrentlyTyping(clientId, name);
    } else {
      this._logger.warn(`DefaultTyping._internalSubscribeToEvents(); unrecognized event`, {
        roomId: this._roomId,
        name,
      });
    }
  };

  get heartbeatThrottleMs(): number {
    return this._heartbeatThrottleMs;
  }
}
