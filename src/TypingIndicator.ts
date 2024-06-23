import * as Ably from 'ably';

import { TypingIndicatorEvents } from './events.js';
import { Logger } from './logger.js';
import { DefaultFeature, Feature } from './status.js';
import { DefaultSubscriptionManager, SubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

/**
 * Represents the typing indicator events mapped to their respective event payloads.
 */
interface TypingIndicatorEventsMap {
  [TypingIndicatorEvents.typingStarted]: TypingIndicatorEvent;
  [TypingIndicatorEvents.typingStopped]: TypingIndicatorEvent;
}

/**
 * Interface for TypingIndicators. This class is used to manage typing indicators in a chat room.
 */
export interface TypingIndicators {
  /**
   * Subscribe a given listener to all typing indicator events from users in the chat room. This will implicitly attach the underlying channel
   * and enable typingIndicators events.
   *
   * @param listener A listener to be called when the typing state of a user in the room changes.
   * @returns A promise that resolves void when attach succeeds or rejects with an error if the attach fails.
   */
  subscribe(listener: TypingListener): Promise<void>;

  /**
   * Unsubscribe a given listener from all typing indicator events from users in the chat room. Will detached from the underlying
   * channel if there are no more listeners.
   *
   * @param listener A listener to be unsubscribed from typing state changes the chat room.
   * @returns A promise that resolves when the implicit channel detach operation completes, or immediately if there
   * are still other listeners.
   */
  unsubscribe(listener: TypingListener): Promise<void>;

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
   * StartTyping indicates that the current user is typing. This will emit a typingStarted event to inform listening clients and begin a timer,
   * once the timer expires, a typingStopped event will be emitted. The timout is configurable through the typingTimeoutMs parameter.
   * If the current user is already typing, it will reset the timer and being counting down again without emitting a new event.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  startTyping(): Promise<void>;

  /**
   * StopTyping indicates that the current user has stopped typing. This will emit a typingStopped event to inform listening clients,
   * and immediately clear the typing timeout timer.
   *
   * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
   */

  stopTyping(): Promise<void>;

  /**
   * Get the name of the realtime channel underpinning typing indicators.
   * @returns The name of the realtime channel.
   */
  channel: Ably.RealtimeChannel;

  /**
   * Get the current status of the feature.
   *
   * @returns an observable that emits the current status of the feature.
   */
  get status(): Feature;
}

/**
 * Represents a typing indicator event.
 */
export type TypingIndicatorEvent = {
  /**
   * A set of clientIds that are currently typing.
   */
  currentlyTypingClientIds: Set<string>;

  /**
   * The change that caused the typing indicator event.
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
};

/**
 * A listener which listens for typing indicator events.
 * @param event The typing indicator event.
 */
export type TypingListener = (event: TypingIndicatorEvent) => void;

export class DefaultTypingIndicator extends EventEmitter<TypingIndicatorEventsMap> implements TypingIndicators {
  private readonly _clientId: string;
  private readonly _roomId: string;
  private readonly _currentlyTypingClientIds: Set<string>;
  private readonly _typingIndicatorsChannelName: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly _logger: Logger;
  private readonly _status: Feature;

  // Timeout for typing indicator
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | null;

  /**
   * Create a new TypingIndicator.
   * @param roomId - The ID of the room.
   * @param realtime - The Ably Realtime instance.
   * @param clientId - The client ID.
   * @param typingTimeoutMs - The timeout for the typing indicator, set to 3000ms by default.
   */
  constructor(roomId: string, realtime: Ably.Realtime, clientId: string, typingTimeoutMs: number, logger: Logger) {
    super();
    this._roomId = roomId;
    this._clientId = clientId;
    this._currentlyTypingClientIds = new Set();
    this._typingIndicatorsChannelName = `${this._roomId}::$chat::$typingIndicators`;
    this._managedChannel = new DefaultSubscriptionManager(
      realtime.channels.get(this._typingIndicatorsChannelName, DEFAULT_CHANNEL_OPTIONS),
      logger,
    );

    // Timeout for typing indicator
    this._typingTimeoutMs = typingTimeoutMs;
    this._timerId = null;
    this._logger = logger;
    this._status = new DefaultFeature(this._managedChannel.channel, 'TypingIndicators', logger);
  }

  /**
   * @inheritDoc
   */
  get(): Set<string> {
    return new Set<string>(this._currentlyTypingClientIds);
  }

  /**
   * @inheritDoc
   */
  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }

  /**
   * @inheritDoc
   */
  get status(): Feature {
    return this._status;
  }

  /**
   * Start the typing timeout timer. This will emit a typingStopped event if the timer expires.
   */
  private startTypingTimer(): void {
    this._logger.trace(`TypingIndicator.startTypingTimer();`);
    this._timerId = setTimeout(async () => {
      this._logger.debug(`TypingIndicator.startTypingTimer(); timeout expired`);
      await this.stopTyping();
    }, this._typingTimeoutMs);
  }

  /**
   * @inheritDoc
   */
  async startTyping(): Promise<void> {
    this._logger.trace(`TypingIndicator.startTyping();`);
    // If the user is already typing, reset the timer
    if (this._timerId) {
      this._logger.debug(`TypingIndicator.startTyping(); already typing, resetting timer`);
      clearTimeout(this._timerId);
      this.startTypingTimer();
      return;
    }
    // Start typing and emit typingStarted event
    this.startTypingTimer();
    return this._managedChannel.presenceEnterClient(this._clientId).then();
  }

  /**
   * @inheritDoc
   */
  async stopTyping(): Promise<void> {
    this._logger.trace(`TypingIndicator.stopTyping();`);
    // Clear the timer and emit typingStopped event
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    // Will throw an error if the user is not typing
    return this._managedChannel.presenceLeaveClient(this._clientId);
  }

  /**
   * @inheritDoc
   */
  async subscribe(listener: TypingListener): Promise<void> {
    this._logger.trace(`TypingIndicator.subscribe();`);
    const hasListeners = this.hasListeners();
    this.on(listener);
    if (!hasListeners) {
      this._logger.debug('TypingIndicator.subscribe(); adding internal listener');
      return this._managedChannel.presenceSubscribe(this._internalSubscribeToEvents);
    }
    return Promise.resolve();
  }

  /**
   * @inheritDoc
   */
  async unsubscribe(listener: TypingListener): Promise<void> {
    this._logger.trace(`TypingIndicator.unsubscribe();`);
    this.off(listener);
    if (!this.hasListeners()) {
      this._logger.debug('TypingIndicator.unsubscribe(); removing internal listener');
      return this._managedChannel.presenceUnsubscribe(this._internalSubscribeToEvents);
    }
    return Promise.resolve();
  }

  /**
   * Subscribe to internal events. This will listen to presence events and convert them into associated typing events,
   * while also updating the currentlyTypingClientIds set.
   */
  private readonly _internalSubscribeToEvents = (member: Ably.PresenceMessage) => {
    if (!member.clientId) {
      this._logger.error(`unable to handle typingIndicator event; no clientId`, { member });
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

        this._currentlyTypingClientIds.add(member.clientId);
        this.emit(TypingIndicatorEvents.typingStarted, {
          currentlyTypingClientIds: new Set<string>(this._currentlyTypingClientIds),
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

        this._currentlyTypingClientIds.delete(member.clientId);
        this.emit(TypingIndicatorEvents.typingStopped, {
          currentlyTypingClientIds: new Set<string>(this._currentlyTypingClientIds),
          change: {
            clientId: member.clientId,
            isTyping: false,
          },
        });
        break;
    }
  };
}
