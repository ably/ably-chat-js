import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { messagesChannelName } from './channel.js';
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
import { TypingEventPayload, TypingEvents } from './events.js';
import { Logger } from './logger.js';
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
   * @returns A Promise of a set of clientIds that are currently typing.
   */
  get(): Promise<Set<string>>;

  /**
   * Start indicates that the current user is typing.
   * This will emit a `typing.start` event to inform listening clients and begin a heartbeat timer,
   * which can be configured through the `heartbeatIntervalMs` parameter.
   * If the current user is already typing, this will no-op until the heartbeat timer has elapsed,
   * at which point calling `start()` will restart the timer and emit a new `typing.start` heartbeat.
   * If the `timeoutMs` parameter is defined in the supplied {@link TypingOptions},
   * then calls to `start()` will also begin a separate timer.
   * Once this timer expires, a `typing.stop` event will be emitted.
   * Further calls to `start()` will restart this timer.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  start(): Promise<void>;

  /**
   * Stop indicates that the current user has stopped typing.
   * This will emit a `typing.stop` event to inform listening clients,
   * and immediately clear any active timers.
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
export type TypingListener = (event: TypingEventPayload) => void;

/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
  [TypingEvents.Start]: TypingEventPayload;
  [TypingEvents.Stop]: TypingEventPayload;
}

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

  // Timeout for typing
  private readonly _timeoutMs: number | undefined;
  private _timeoutTimerId: ReturnType<typeof setTimeout> | undefined;
  private readonly _heartbeatIntervalMs: number;
  private _heartbeatTimerId: ReturnType<typeof setTimeout> | undefined;
  private readonly _inactivityTimeoutMs: number;

  private _opMtx: Mutex;

  private _currentlyTyping: Map<string, ReturnType<typeof setTimeout> | undefined>;

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
    // Mutex to control access to the typing state
    this._opMtx = new Mutex();
    // Timeout for pause in typing
    this._timeoutMs = options.timeoutMs;
    // Timeout for inactivity, i.e. when we have not received a heartbeat for a configured time
    this._inactivityTimeoutMs = options.inactivityTimeoutMs;
    // Interval for the heartbeat, how often we should emit a typing event with repeated calls to start()
    this._heartbeatIntervalMs = options.heartbeatIntervalMs;

    // Map of clientIds to their typing timers, used to track typing state
    this._currentlyTyping = new Map<string, ReturnType<typeof setTimeout> | undefined>();
    this._logger = logger;
  }

  /**
   * Creates the realtime channel for typing indicators.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get(messagesChannelName(roomId));
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.subscribe([TypingEvents.Start, TypingEvents.Stop], this._internalSubscribeToEvents.bind(this));
    return channel;
  }

  /**
   * @inheritDoc
   */
  async get(): Promise<Set<string>> {
    this._logger.trace(`DefaultTyping.get();`);
    return this._opMtx.runExclusive(() => {
      return new Set<string>(this._currentlyTyping.keys());
    });
  }

  /**
   * @inheritDoc
   */
  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  /**
   * Start the typing timeout timer. This will expire after the configured timeout.
   */
  private _setTimeoutTimer(): void {
    if (this._timeoutMs) {
      clearTimeout(this._timeoutTimerId);
      this._logger.trace(`DefaultTyping.startTypingTimer();`);
      this._timeoutTimerId = setTimeout(() => {
        this._logger.debug(`DefaultTyping.startTypingTimer(); timeout expired`);
        void this.stop();
      }, this._timeoutMs);
    }
  }

  /**
   * Start the heartbeat timer. This will expire after the configured interval.
   */
  private _startHeartbeatTimer(): void {
    if (!this._heartbeatTimerId) {
      this._logger.trace(`DefaultTyping.startHeartbeatTimer();`);
      this._heartbeatTimerId = setTimeout(() => {
        this._logger.debug(`DefaultTyping.startHeartbeatTimer(); heartbeat timer expired`);
      }, this._heartbeatIntervalMs);
    }
  }

  /**
   * @inheritDoc
   */
  async start(): Promise<void> {
    this._logger.trace(`DefaultTyping.start();`);

    // If the user is already typing, and the timer has not expired, do not send another heartbeat
    if (this._heartbeatTimerId) {
      this._logger.debug(`DefaultTyping.start(); no-op, already typing and heartbeat timer has not expired`);
      // Reset the timeout timer if the user is still typing
      this._setTimeoutTimer()
      return;
    }
    return this._channel.publish(TypingEvents.Start, {}).then(() => {
      this._logger.trace(`DefaultTyping.start(); starting timers`);
      // Start the heartbeat timer
      this._startHeartbeatTimer();
      // Start the timeout timer
      this._setTimeoutTimer();
    });
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);
    // If the user is not typing, do nothing.
    if (!this._heartbeatTimerId) {
      this._logger.debug(`DefaultTyping.stop(); no-op, not currently typing`);
      return;
    }
    return this._channel.publish(TypingEvents.Stop, {}).then(() => {
      this._logger.trace(`DefaultTyping.stop(); clearing timers`);
      // Clear the heartbeat timer
      if (this._heartbeatTimerId) {
        clearTimeout(this._heartbeatTimerId);
        this._heartbeatTimerId = undefined;
      }
      // Clear the timeout timer, if it exists
      if (this._timeoutTimerId) {
        clearTimeout(this._timeoutTimerId);
        this._timeoutTimerId = undefined;
      }
    });
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
  private async _updateCurrentlyTyping(clientId: string, event: TypingEvents): Promise<void> {
    // Wrap the entire logic in the mutex so we can access currentlyTyping safely
    await this._opMtx.runExclusive(() => {
      this._logger.trace(`DefaultTyping._updateCurrentlyTyping();`, { clientId, event });

      const existingTimeout = this._currentlyTyping.get(clientId);

      if (event === TypingEvents.Start) {
        this._handleTypingStart(clientId, existingTimeout);
      } else {
        this._handleTypingStop(clientId, existingTimeout);
      }
    });
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
      // Remove client as their timeout has expired
      this._opMtx
        .runExclusive(() => {
          this._currentlyTyping.delete(clientId);
          this.emit(TypingEvents.Stop, {
            clientId,
            currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
            type: TypingEvents.Stop,
          });
        })
        .catch((error: unknown) => {
          this._logger.error(
            `DefaultTyping._startNewClientInactivityTimer(); failed to update typing state in timeout`,
            {
              clientId,
              error,
            },
          );
        });
    }, this._heartbeatIntervalMs + this._inactivityTimeoutMs);
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
      this._logger.debug(`DefaultTyping._handleTypingStart(); received heartbeat for currently typing client`, { clientId });
      clearTimeout(existingTimeout);
    } else {
      // Otherwise, we need to emit a new typing event
      this._logger.debug(`DefaultTyping._handleTypingStart(); new client started typing`, { clientId });
      this.emit(TypingEvents.Start, {
        clientId,
        currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
        type: TypingEvents.Start,
      });
    }

    // Track the new timeout
    this._currentlyTyping.set(clientId, timeoutId);
  }

  // Handles logic for TypingEvents.Stop
  private _handleTypingStop(clientId: string, existingTimeout: NodeJS.Timeout | undefined): void {
    if (!existingTimeout) {
      // Stop requested for a client that isn't currently typing
      this._logger.warn(
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
      clientId,
      currentlyTyping: new Set<string>(this._currentlyTyping.keys()),
      type: TypingEvents.Stop,
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
      this._updateCurrentlyTyping(clientId, name)
        .then(() => {
          this._logger.debug(`DefaultTyping._internalSubscribeToEvents(); successfully updated typing state`, {
            name,
            clientId,
          });
        })
        .catch((error: unknown) => {
          this._logger.error(`DefaultTyping._internalSubscribeToEvents(); failed to update typing state`, {
            name,
            clientId,
            error,
          });
        });
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

  get timeoutMs(): number | undefined {
    return this._timeoutMs;
  }

  get inactivityTimeoutMs(): number {
    return this._inactivityTimeoutMs;
  }

  get heartbeatIntervalMs(): number {
    return this._heartbeatIntervalMs;
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
}
