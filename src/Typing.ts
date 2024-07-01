import * as Ably from 'ably';

import { getChannel } from './channel.js';
import { TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { addListenerToChannelPresenceWithoutAttach } from './realtimeextensions.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
  [TypingEvents.typingStarted]: TypingEvent;
  [TypingEvents.typingStopped]: TypingEvent;
}

/**
 * Interface for Typing. This class is used to manage typing events in a chat room.
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
   * Get the set of clientIds that are currently typing.
   * @returns A set of clientIds that are currently typing.
   */

  /**
   * Get the current typers, a unique set of clientIds.
   * @returns A set of clientIds that are currently typing.
   */
  get(): Set<string>;

  /**
   * Start indicates that the current user is typing. This will emit a typingStarted event to inform listening clients and begin a timer,
   * once the timer expires, a typingStopped event will be emitted. The timout is configurable through the typingTimeoutMs parameter.
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

  /**
   * The change that caused the typing event.
   */
  change: {
    /**
     * The clientId of the client whose typing state has changed.
     */
    clientId: string;

    /**
     * Whether the client is typing or not.
     */
    isTyping: boolean;
  };
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

export class DefaultTyping extends EventEmitter<TypingEventsMap> implements Typing {
  private readonly _clientId: string;
  private readonly _roomId: string;
  private readonly _currentlyTyping: Set<string>;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | null;

  /**
   * Create a new DefaultTyping.
   * @param roomId - The ID of the room.
   * @param channel - The channel to use for typing events.
   * @param clientId - The client ID.
   * @param typingTimeoutMs - The timeout for typing events, set to 3000ms by default.
   * @param logger - The logger instance.
   */
  constructor(roomId: string, realtime: Ably.Realtime, clientId: string, typingTimeoutMs: number, logger: Logger) {
    super();
    this._roomId = roomId;
    this._clientId = clientId;
    this._currentlyTyping = new Set();
    this._channel = getChannel(`${roomId}::$chat::$typingIndicators`, realtime);
    addListenerToChannelPresenceWithoutAttach({
      listener: this._internalSubscribeToEvents.bind(this),
      channel: this._channel,
    });

    // Timeout for typing
    this._typingTimeoutMs = typingTimeoutMs;
    this._timerId = null;
    this._logger = logger;
  }

  /**
   * @inheritDoc
   */
  get(): Set<string> {
    return new Set<string>(this._currentlyTyping);
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
  private startTypingTimer(): void {
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
      this.startTypingTimer();
      return;
    }

    // Start typing and emit typingStarted event
    this.startTypingTimer();
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

    switch (member.action) {
      case 'enter':
      case 'present':
      case 'update':
        if (!member.clientId) {
          this._logger.error(`unable to handle typingStarted event; no clientId`, member);
          return;
        }

        this._currentlyTyping.add(member.clientId);
        this.emit(TypingEvents.typingStarted, {
          currentlyTyping: new Set<string>(this._currentlyTyping),
          change: {
            clientId: member.clientId,
            isTyping: true,
          },
        });
        break;
      case 'leave':
        if (!member.clientId) {
          this._logger.error(`unable to handle typingStopped event; no clientId`, member);
          return;
        }

        this._currentlyTyping.delete(member.clientId);
        this.emit(TypingEvents.typingStopped, {
          currentlyTyping: new Set<string>(this._currentlyTyping),
          change: {
            clientId: member.clientId,
            isTyping: false,
          },
        });
        break;
    }
  };
}
