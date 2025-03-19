import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { roomChannelName } from './channel.js';
import { ChannelManager } from './channel-manager.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { TypingEvent, TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { ephemeralMessage } from './realtime.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { TypingOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * This interface is used to interact with typing in a chat room including subscribing to typing events and
 * fetching the current set of typing clients.
 *
 * Get an instance via {@link Room.typing}.
 */
export interface Typing extends EmitsDiscontinuities {
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
   * "This will send a `typing.started` event to the server.
   * Events are throttled according to the `heartbeatThrottleMs` room option.
   * If an event has been sent within the interval, this operation is no-op."
   *
   * Calls to `start()` and `stop()` will execute serially in the order they are called,
   * resolving only when the previous call has completed.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  start(): Promise<void>;

  /**
   * This will send a `typing.stopped` event to the server.
   * If the user was not currently typing, this operation is no-op.
   *
   * Calls to `start()` and `stop()` will execute serially in the order they are called,
   * resolving only when the previous call has completed.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  stop(): Promise<void>;

  /**
   * Get the Ably realtime channel underpinning typing events.
   * @returns The Ably realtime channel.
   */
  channel: Ably.RealtimeChannel;
}

/**
 * A listener which listens for typing events.
 * @param event The typing event.
 */
export type TypingListener = (event: TypingEvent) => void;

/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
  [TypingEvents.Start]: TypingEvent;
  [TypingEvents.Stop]: TypingEvent;
}

/**
 * Represents a timer handle that can be undefined.
 */
type TypingTimerHandle = ReturnType<typeof setTimeout> | undefined;

/**
 * @inheritDoc
 */
export class DefaultTyping
  extends EventEmitter<TypingEventsMap>
  implements Typing, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _clientId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  // Throttle for the heartbeat, how often we should emit a typing event with repeated calls to start()
  // CHA-T10
  private readonly _heartbeatThrottleMs: number;

  // Grace period for inactivity before another user is considered to have stopped typing
  // CHA-T10a
  private readonly _timeoutMs = 2000;
  private _heartbeatTimerId: TypingTimerHandle;
  private readonly _currentlyTyping: Map<string, TypingTimerHandle>;

  // Mutex for controlling `start` and `stop` operations
  private readonly _mutex = new Mutex();

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param roomId The unique identifier of the room.
   * @param options The options for typing in the room.
   * @param channelManager The channel manager for the room.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    options: TypingOptions,
    channelManager: ChannelManager,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._clientId = clientId;
    this._channel = this._makeChannel(roomId, channelManager);

    // Interval for the heartbeat, how often we should emit a typing event with repeated calls to start()
    this._heartbeatThrottleMs = options.heartbeatThrottleMs;

    // Map of clientIds to their typing timers, used to track typing state
    this._currentlyTyping = new Map<string, TypingTimerHandle>();
    this._logger = logger;
  }

  /**
   * Creates the realtime channel for typing indicators.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    // CHA-T8
    const channel = channelManager.get(roomChannelName(roomId));

    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.subscribe([TypingEvents.Start, TypingEvents.Stop], this._internalSubscribeToEvents.bind(this));
    return channel;
  }

  /**
   * CHA-T9
   *
   * @inheritDoc
   */
  get(): Set<string> {
    this._logger.trace(`DefaultTyping.get();`);
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
  async start(): Promise<void> {
    this._logger.trace(`DefaultTyping.start();`);

    // Acquire a mutex
    await this._mutex.acquire();
    try {
      // CHA-T4d
      // Ensure channel is attached
      if (this.channel.state !== 'attached' && this.channel.state !== 'attaching') {
        this._logger.error(`DefaultTyping.start(); channel is not attached`, { state: this.channel.state });
        throw new Ably.ErrorInfo('cannot start typing, channel is not attached', 50000, 500);
      }

      // Check whether user is already typing before publishing again
      // CHA-T4c1, CHA-T4c2
      if (this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.start(); no-op, already typing and heartbeat timer has not expired`);
        return;
      }

      // Perform the publish
      // CHA-T4a3
      await this._channel.publish(ephemeralMessage(TypingEvents.Start));

      // Start the timer after publishing
      // CHA-T4a5
      this._startHeartbeatTimer();
      this._logger.trace(`DefaultTyping.start(); starting timers`);
    } finally {
      this._logger.trace(`DefaultTyping.start(); releasing mutex`);
      this._mutex.release();
    }
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);

    // Acquire a mutex
    await this._mutex.acquire();
    try {
      // CHA-T5c
      if (this.channel.state !== 'attached' && this.channel.state !== 'attaching') {
        this._logger.error(`DefaultTyping.stop(); channel is not attached`, { state: this.channel.state });
        throw new Ably.ErrorInfo('cannot stop typing, channel is not attached', 50000, 500);
      }

      // If the user is not typing, do nothing.
      // CHA-T5a
      if (!this._heartbeatTimerId) {
        this._logger.debug(`DefaultTyping.stop(); no-op, not currently typing`);
        return;
      }

      // CHA-T5d
      await this._channel.publish(ephemeralMessage(TypingEvents.Stop));
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
  unsubscribeAll(): void {
    this._logger.trace(`DefaultTyping.unsubscribeAll();`);
    this.off();
  }

  /**
   * Update the currently typing users. This method is called when a typing event is received.
   * It will also acquire a mutex to ensure that the currentlyTyping state is updated safely.
   * @param clientId The client ID of the user.
   * @param event The typing event.
   */
  private _updateCurrentlyTyping(clientId: string, event: TypingEvents): void {
    this._logger.trace(`DefaultTyping._updateCurrentlyTyping();`, { clientId, event });

    const existingTimeout = this._currentlyTyping.get(clientId);

    if (event === TypingEvents.Start) {
      this._handleTypingStart(clientId, existingTimeout);
    } else {
      this._handleTypingStop(clientId, existingTimeout);
    }
  }

  /**
   * Starts a new inactivity timer for the client.
   * This timer will expire after the configured timeout,
   * which is the sum of the heartbeat interval and the inactivity timeout.
   * @param clientId
   */
  private _startNewClientInactivityTimer(clientId: string): ReturnType<typeof setTimeout> {
    this._logger.trace(`DefaultTyping._startNewClientInactivityTimer(); starting new inactivity timer`, { clientId });
    // Set or reset the typing timeout for this client
    const timeoutId = setTimeout(() => {
      this._logger.trace(`DefaultTyping._startNewClientInactivityTimer(); client typing timeout expired`, { clientId });
      // Verify the timer is still valid (it might have been reset)
      if (this._currentlyTyping.get(clientId) !== timeoutId) {
        this._logger.debug(`DefaultTyping._startNewClientInactivityTimer(); timeout already cleared; ignoring`, {
          clientId,
        });
        return;
      }

      // Remove client whose timeout has expired
      this._currentlyTyping.delete(clientId);
      this.emit(TypingEvents.Stop, {
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEvents.Stop,
        },
      });
    }, this._heartbeatThrottleMs + this._timeoutMs);
    return timeoutId;
  }

  /**
   * Handles logic for TypingEvents.Start, including starting a new timeout or resetting an existing one.
   * @param clientId
   * @param existingTimeout
   */
  private _handleTypingStart(clientId: string, existingTimeout: NodeJS.Timeout | undefined): void {
    this._logger.debug(`DefaultTyping._handleTypingStart();`, { clientId });
    // Start a new timeout for the client
    const timeoutId = this._startNewClientInactivityTimer(clientId);

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
      this._logger.debug(`DefaultTyping._handleTypingStart(); new client started typing`, { clientId });
      this.emit(TypingEvents.Start, {
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        change: {
          clientId,
          type: TypingEvents.Start,
        },
      });
    }

    // Track the new timeout
    this._currentlyTyping.set(clientId, timeoutId);
  }

  // Handles logic for TypingEvents.Stop
  private _handleTypingStop(clientId: string, existingTimeout: NodeJS.Timeout | undefined): void {
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
    this.emit(TypingEvents.Stop, {
      currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
      change: {
        clientId,
        type: TypingEvents.Stop,
      },
    });
  }

  /**
   * Subscribe to internal events. This listens to events and converts them into typing updates, with validation.
   */
  private _internalSubscribeToEvents = (inbound: Ably.InboundMessage): void => {
    const { name, clientId } = inbound;
    this._logger.trace(`DefaultTyping._internalSubscribeToEvents(); received event`, { name, clientId });

    if (clientId === undefined) {
      this._logger.error(`DefaultTyping._internalSubscribeToEvents(); missing clientId in event payload`, { inbound });
      return;
    }

    if (clientId === '') {
      this._logger.error(`DefaultTyping._internalSubscribeToEvents(); empty clientId in event payload`, { inbound });
      return;
    }

    // Safety check to ensure we are handling only typing events
    if (name === TypingEvents.Start || name === TypingEvents.Stop) {
      this._updateCurrentlyTyping(clientId, name);
    } else {
      this._logger.warn(`DefaultTyping._internalSubscribeToEvents(); unrecognized event`, { name });
    }
  };

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace(`DefaultTyping.onDiscontinuity();`);
    const wrapped = wrap(listener);
    this._discontinuityEmitter.on(wrapped);

    return {
      off: () => {
        this._discontinuityEmitter.off(wrapped);
      },
    };
  }

  discontinuityDetected(reason?: Ably.ErrorInfo): void {
    this._logger.warn(`DefaultTyping.discontinuityDetected();`, { reason });
    this._discontinuityEmitter.emit('discontinuity', reason);
  }

  get heartbeatThrottleMs(): number {
    return this._heartbeatThrottleMs;
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get attachmentErrorCode(): ErrorCodes {
    return ErrorCodes.TypingAttachmentFailed;
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get detachmentErrorCode(): ErrorCodes {
    return ErrorCodes.TypingDetachmentFailed;
  }

  // Convenience getters for testing
  get heartbeatTimerId(): TypingTimerHandle {
    return this._heartbeatTimerId;
  }

  get currentlyTyping(): Map<string, TypingTimerHandle> {
    return this._currentlyTyping;
  }
}
