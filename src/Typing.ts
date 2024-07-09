import * as Ably from 'ably';

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
import { addListenerToChannelPresenceWithoutAttach } from './realtimeExtensions.js';
import { ContributesToRoomLifecycle } from './RoomLifecycleManager.js';
import { TypingOptions } from './RoomOptions.js';
import EventEmitter from './utils/EventEmitter.js';

const PRESENCE_GET_RETRY_INTERVAL_MS = 1500; // base retry interval, we double it each time
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 30000; // max retry interval
const PRESENCE_GET_MAX_RETRIES = 5; // max num of retries

/**
 * Interface for Typing. This class is used to manage typing events in a chat room.
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
  channel: Ably.RealtimeChannel;
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

export class DefaultTyping
  extends EventEmitter<TypingEventsMap>
  implements Typing, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _clientId: string;
  private readonly _roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | null;

  /**
   * Create a new DefaultTyping.
   * @param roomId - The ID of the room.
   * @param options - The typing options.
   * @param realtime - The Ably Realtime instance.
   * @param clientId - The client ID.
   * @param logger - The logger.
   */
  constructor(roomId: string, options: TypingOptions, realtime: Ably.Realtime, clientId: string, logger: Logger) {
    super();
    this._roomId = roomId;
    this._clientId = clientId;
    this._channel = getChannel(`${roomId}::$chat::$typingIndicators`, realtime);
    addListenerToChannelPresenceWithoutAttach({
      listener: this._internalSubscribeToEvents.bind(this),
      channel: this._channel,
    });

    // Timeout for typing
    this._typingTimeoutMs = options.timeoutMs;
    this._timerId = null;
    this._logger = logger;
  }

  /**
   * @inheritDoc
   */
  get(): Promise<Set<string>> {
    return this._channel.presence.get().then((members) => new Set<string>(members.map((m) => m.clientId)));
  }

  /**
   * @inheritDoc
   */
  get channel(): Ably.RealtimeChannel {
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
    return this._channel.presence.enterClient(this._clientId).then();
  }

  /**
   * @inheritDoc
   */
  async stop(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);
    // Clear the timer and emit typingStopped event
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }

    // Will throw an error if the user is not typing
    return this._channel.presence.leaveClient(this._clientId);
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

  private _receivedEventNumber = 0;
  private _triggeredEventNumber = 0;
  private _currentlyTyping: Set<string> = new Set<string>();
  private _retryTimeout: NodeJS.Timeout | null = null;
  private _numRetries = 0;

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
    if (this._retryTimeout !== null) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
      this._numRetries = 0;
    }

    this.getAndEmit(this._receivedEventNumber);
  };

  private getAndEmit(eventNum: number) {
    this.get()
      .then((currentlyTyping) => {
        // successful fetch, remove retry timeout if one exists
        if (this._retryTimeout !== null) {
          clearTimeout(this._retryTimeout);
          this._retryTimeout = null;
          this._numRetries = 0;
        }

        // if we've seen the result of a newer promise, do nothing
        if (this._triggeredEventNumber >= eventNum) {
          return;
        }
        this._triggeredEventNumber = eventNum;

        // do nothing else if there's no diff between the known and found sets
        if (!this.areSetsDifferent(this._currentlyTyping, currentlyTyping)) {
          return;
        }

        this._currentlyTyping = currentlyTyping;
        this.emit(TypingEvents.Changed, {
          currentlyTyping: new Set(currentlyTyping),
        });
      })
      .catch((err: unknown) => {
        const willReattempt = this._numRetries < PRESENCE_GET_MAX_RETRIES;
        this._logger.error(`Error fetching currently typing clientIds set.`, {
          error: err,
          willReattempt: willReattempt,
        });
        if (!willReattempt) {
          return;
        }

        // already another timeout, do nothing
        if (this._retryTimeout !== null) {
          return;
        }

        const waitBeforeRetry = Math.min(
          PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
          PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, this._numRetries),
        );

        this._numRetries += 1;

        this._retryTimeout = setTimeout(() => {
          this._retryTimeout = null;
          this._receivedEventNumber++;
          this.getAndEmit(this._receivedEventNumber);
        }, waitBeforeRetry);
      });
  }

  private areSetsDifferent(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) {
      return true;
    }
    for (const val of a) {
      if (!b.has(val)) {
        return true;
      }
    }
    return false;
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
