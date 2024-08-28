import * as Ably from 'ably';
import { dequal } from 'dequal';

import { getChannel } from './channel.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { addListenerToChannelPresenceWithoutAttach } from './realtime-extensions.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { TypingOptions } from './room-options.js';
import EventEmitter from './utils/event-emitter.js';

const PRESENCE_GET_RETRY_INTERVAL_MS = 1500; // base retry interval, we double it each time
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 30000; // max retry interval
const PRESENCE_GET_MAX_RETRIES = 5; // max num of retries

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
  subscribe(listener: TypingListener): TypingSubscriptionResponse;

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
   * Start indicates that the current user is typing. This will emit a typingStarted event to inform listening clients and begin a timer,
   * once the timer expires, a typingStopped event will be emitted. The timeout is configurable through the typingTimeoutMs parameter.
   * If the current user is already typing, it will reset the timer and being counting down again without emitting a new event.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  start(): Promise<void>;

  /**
   * Stop indicates that the current user has stopped typing. This will emit a typingStopped event to inform listening clients,
   * and immediately clear the typing timeout timer.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  stop(): Promise<void>;

  /**
   * Get the name of the realtime channel underpinning typing events.
   * @returns The name of the realtime channel.
   */
  channel: Promise<Ably.RealtimeChannel>;
}

/**
 * Represents a typing event.
 */
export interface TypingEvent {
  /**
   * Get a set of clientIds that are currently typing.
   */
  get currentlyTyping(): Set<string>;
}

/**
 * A listener which listens for typing events.
 * @param event The typing event.
 */
export type TypingListener = (event: TypingEvent) => void;

/**
 * A response object that allows you to control the subscription to typing events.
 */
export interface TypingSubscriptionResponse {
  /**
   * Unsubscribe the listener registered with {@link Typing.subscribe} from typing events.
   */
  unsubscribe: () => void;
}

/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
  [TypingEvents.Changed]: TypingEvent;
}

/**
 * @inheritDoc
 */
export class DefaultTyping
  extends EventEmitter<TypingEventsMap>
  implements Typing, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _clientId: string;
  private readonly _channel: Promise<Ably.RealtimeChannel>;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | undefined;

  private _receivedEventNumber = 0;
  private _triggeredEventNumber = 0;
  private _currentlyTyping: Set<string> = new Set<string>();
  private _retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private _numRetries = 0;

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param roomId The unique identifier of the room.
   * @param options The options for typing in the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   * @param initAfter A promise that is awaited before creating any channels.
   */
  constructor(
    roomId: string,
    options: TypingOptions,
    realtime: Ably.Realtime,
    clientId: string,
    logger: Logger,
    initAfter: Promise<void>,
  ) {
    super();
    this._clientId = clientId;
    this._channel = initAfter.then(() => this._makeChannel(roomId, realtime));

    // Catch this so it won't send unhandledrejection global event
    this._channel.catch((error: unknown) => {
      logger.debug('Typing: channel initialization canceled', { roomId, error });
    });

    // Timeout for typing
    this._typingTimeoutMs = options.timeoutMs;
    this._logger = logger;
  }

  /**
   * Creates the realtime channel for typing indicators. Called after initAfter is resolved.
   */
  private _makeChannel(roomId: string, realtime: Ably.Realtime): Ably.RealtimeChannel {
    const channel = getChannel(`${roomId}::$chat::$typingIndicators`, realtime);
    addListenerToChannelPresenceWithoutAttach({
      listener: this._internalSubscribeToEvents.bind(this),
      channel: channel,
    });
    return channel;
  }

  /**
   * @inheritDoc
   */
  get(): Promise<Set<string>> {
    return this._channel.then((channel) =>
      channel.presence.get().then((members) => new Set<string>(members.map((m) => m.clientId))),
    );
  }

  /**
   * @inheritDoc
   */
  get channel(): Promise<Ably.RealtimeChannel> {
    return this._channel;
  }

  /**
   * Start the typing timeout timer. This will emit a typingStopped event if the timer expires.
   */
  private _startTypingTimer(): void {
    this._logger.trace(`DefaultTyping.startTypingTimer();`);
    this._timerId = setTimeout(() => {
      this._logger.debug(`DefaultTyping.startTypingTimer(); timeout expired`);
      void this.stop();
    }, this._typingTimeoutMs);
  }

  /**
   * @inheritDoc
   */
  async start(): Promise<void> {
    this._logger.trace(`DefaultTyping.start();`);
    // If the user is already typing, reset the timer
    if (this._timerId) {
      this._logger.debug(`DefaultTyping.start(); already typing, resetting timer`);
      clearTimeout(this._timerId);
      this._startTypingTimer();
      return;
    }

    // Start typing and emit typingStarted event
    this._startTypingTimer();
    const channel = await this.channel;
    return channel.presence.enterClient(this._clientId).then();
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);
    // Clear the timer and emit typingStopped event
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = undefined;
    }

    // Will throw an error if the user is not typing
    const channel = await this.channel;
    return channel.presence.leaveClient(this._clientId);
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: TypingListener): TypingSubscriptionResponse {
    this._logger.trace(`DefaultTyping.subscribe();`);
    this.on(listener);

    return {
      unsubscribe: () => {
        this._logger.trace('DefaultTyping.unsubscribe();');
        this.off(listener);
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
   * Subscribe to internal events. This will listen to presence events and convert them into associated typing events,
   * while also updating the currentlyTypingClientIds set.
   */
  private readonly _internalSubscribeToEvents = (member: Ably.PresenceMessage) => {
    if (!member.clientId) {
      this._logger.error(`unable to handle typing event; no clientId`, { member });
      return;
    }

    this._receivedEventNumber += 1;

    // received a real event, cancelling retry timeout
    if (this._retryTimeout) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = undefined;
      this._numRetries = 0;
    }

    this._getAndEmit(this._receivedEventNumber);
  };

  private _getAndEmit(eventNum: number) {
    this.get()
      .then((currentlyTyping) => {
        // successful fetch, remove retry timeout if one exists
        if (this._retryTimeout) {
          clearTimeout(this._retryTimeout);
          this._retryTimeout = undefined;
          this._numRetries = 0;
        }

        // if we've seen the result of a newer promise, do nothing
        if (this._triggeredEventNumber >= eventNum) {
          return;
        }
        this._triggeredEventNumber = eventNum;

        // if current typers haven't changed since we last emitted, do nothing
        if (dequal(this._currentlyTyping, currentlyTyping)) {
          return;
        }

        this._currentlyTyping = currentlyTyping;
        this.emit(TypingEvents.Changed, {
          currentlyTyping: new Set(currentlyTyping),
        });
      })
      .catch((error: unknown) => {
        const willReattempt = this._numRetries < PRESENCE_GET_MAX_RETRIES;
        this._logger.error(`Error fetching currently typing clientIds set.`, {
          error,
          willReattempt: willReattempt,
        });
        if (!willReattempt) {
          return;
        }

        // already another timeout, do nothing
        if (this._retryTimeout) {
          return;
        }

        const waitBeforeRetry = Math.min(
          PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
          PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, this._numRetries),
        );

        this._numRetries += 1;

        this._retryTimeout = setTimeout(() => {
          this._retryTimeout = undefined;
          this._receivedEventNumber++;
          this._getAndEmit(this._receivedEventNumber);
        }, waitBeforeRetry);
      });
  }

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace(`DefaultTyping.onDiscontinuity();`);
    this._discontinuityEmitter.on(listener);

    return {
      off: () => {
        this._discontinuityEmitter.off(listener);
      },
    };
  }

  discontinuityDetected(reason?: Ably.ErrorInfo | undefined): void {
    this._logger.warn(`DefaultTyping.discontinuityDetected();`, { reason });
    this._discontinuityEmitter.emit('discontinuity', reason);
  }

  get timeoutMs(): number {
    return this._typingTimeoutMs;
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
