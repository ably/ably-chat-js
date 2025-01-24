import { dequal } from 'dequal';

import { TypingEvents } from './events.js';
import { Logger } from './logger.js';
import {
  ChatPresenceData,
  ChatPresenceMessage,
  PresenceDataContribution,
  PresenceManager,
} from './presence-data-manager.js';
import { TypingOptions } from './room-options.js';
import { HandlesUserStatusChange } from './user-status.js';
import EventEmitter from './utils/event-emitter.js';

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
export class DefaultTyping extends EventEmitter<TypingEventsMap> implements Typing, HandlesUserStatusChange {
  private readonly _clientId: string;
  private readonly _logger: Logger;

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | undefined;

  private readonly _presenceManger: PresenceManager;
  private readonly _presenceDataContribution: PresenceDataContribution;

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param roomId The unique identifier of the room.
   * @param options The options for typing in the room.
   * @param presenceManager
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    options: TypingOptions,
    presenceManager: PresenceManager,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._clientId = clientId;
    this._presenceManger = presenceManager;

    // Timeout for typing
    this._typingTimeoutMs = options.timeoutMs;
    this._logger = logger;

    // contribution to presence data
    this._presenceDataContribution = this._presenceManger.newContributor();
  }

  /**
   * @inheritDoc
   */
  async get(): Promise<Set<string>> {
    this._logger.trace(`DefaultTyping.get();`);
    const { latest } = await this._presenceManger.getPresenceSet();
    return new Set<string>(latest.filter((m) => m.data.typing).map((m_1) => m_1.clientId));
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
    await this._presenceDataContribution.set((currentPresenceData: ChatPresenceData) => ({
      ...currentPresenceData,
      typing: true,
    }));
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

    // When we stop typing, remove the typing flag from the presence data by deleting the typing key
    await this._presenceDataContribution.remove((currentPresenceData: ChatPresenceData) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { typing, ...rest } = currentPresenceData;
      return rest;
    });
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
   * This will listen to user status events and convert them into associated typing events.
   */
  onUserStatusChange(event: { previous: ChatPresenceMessage[]; latest: ChatPresenceMessage[] }): void {
    this._logger.trace(`DefaultTyping.onUserStatusChange();`, { event });

    const { previous, latest } = event;

    const previousTyping = new Set<string>(previous.filter((m) => m.data.typing).map((m_1) => m_1.clientId));
    const latestTyping = new Set<string>(latest.filter((m) => m.data.typing).map((m_1) => m_1.clientId));

    // If the typing set has changed, emit a typingChanged event
    if (!dequal(previousTyping, latestTyping)) {
      this._logger.debug(`DefaultTyping.onUserStatusChange(); typing set changed`, {
        previousTyping,
        latestTyping,
      });
      this.emit(TypingEvents.Changed, { currentlyTyping: latestTyping });
    }
  }
}
