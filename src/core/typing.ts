import * as Ably from 'ably';

import { messagesChannelName } from './channel.js';
import { ChannelManager } from './channel-manager.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { ChatPresenceData, PresenceDataContribution } from './presence-data-manager.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { TypingOptions } from './room-options.js';
import EventEmitter from './utils/event-emitter.js';

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
   * Get the Ably realtime channel underpinning typing events.
   * @returns The Ably realtime channel.
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
   * Indicates which clientId changed their typing state.
   */
  change: {
    /**
     * The clientId of the user that changed their typing state.
     */
    clientId: string;

    /**
     * Whether the user started typing or stopped.
     */
    isTyping: boolean;
  };

  /**
   * Indicates whether the presence data is still syncing.
   */
  syncInProgress: boolean;
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
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | undefined;

  private _currentlyTyping: Set<string> = new Set<string>();
  private readonly _presenceDataContribution: PresenceDataContribution;

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
    presenceDataContribution: PresenceDataContribution,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._clientId = clientId;
    this._channel = this._makeChannel(roomId, channelManager);

    // Timeout for typing
    this._typingTimeoutMs = options.timeoutMs;
    this._logger = logger;
    this._presenceDataContribution = presenceDataContribution;
    this._setupListeners();
  }

  /**
   * Listen for presence set changes and process typing-presence data.
   */
  private _setupListeners(): void {
    this._logger.debug('Setting up listeners for typing events.');
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.presence.onPresenceSetChange((event) => {
      const { current, members, syncInProgress } = event;

      const typingEvent = this._typingEventFromPresenceMessage(current);

      // If not a typing event, ignore
      if (!typingEvent) {
        console.debug('DefaultTyping._setupListeners(); not a typing event, ignoring', { current });
        return;
      }

      if (syncInProgress) {
        // Handling while syncing
        this._processSyncingTypingState(members, typingEvent);
      } else {
        // Handling when already synced
        this._processSyncedTypingState(typingEvent);
      }
    });

    this._logger.debug('Typing listeners setup complete.');
  }

  /**
   * Handles processing when the presence set is fully in sync.
   */
  private _processSyncedTypingState(typingEvent: { clientId: string; isTyping: boolean }): void {
    this._logger.debug('Processing synchronized typing state.');

    // Does the client ID already exist in the currently typing set?
    const isAlreadyTyping = this._currentlyTyping.has(typingEvent.clientId);

    if (isAlreadyTyping) {
      // If the user is already in the set and is still typing, do nothing
      if (typingEvent.isTyping) {
        return;
      }

      // If the user is already in the set and is now not typing, remove them and make sure we emit an event
      this._currentlyTyping.delete(typingEvent.clientId);
    }

    // If the user is not in the set and is typing, add them
    if (!isAlreadyTyping && typingEvent.isTyping) {
      this._currentlyTyping.add(typingEvent.clientId);
    }

    // If the user is not in the set and is not typing, do nothing
    if (!isAlreadyTyping && !typingEvent.isTyping) {
      return;
    }
    this._emitTypingSetChange(false, typingEvent);

    this._logger.debug('Updated currently typing set:', this._currentlyTyping);
  }

  /**
   * Handles processing while presence is still syncing.
   * Reprocesses the whole typing state on each event during sync.
   */
  private _processSyncingTypingState(
    memebers: Ably.PresenceMessage[],
    newTypingMember: { clientId: string; isTyping: boolean },
  ): void {
    this._logger.debug('_processSyncingTypingState');
    // Clear the currentlyTyping set first
    this._currentlyTyping.clear();

    // Build a new set based on the presence messages
    memebers.map((member) => {
      const typingEvent = this._typingEventFromPresenceMessage(member);
      if (typingEvent) {
        if (typingEvent.isTyping) {
          this._currentlyTyping.add(typingEvent.clientId);
        } else {
          this._currentlyTyping.delete(typingEvent.clientId);
        }
        this._logger.debug(`Typing sync updated for ${typingEvent.clientId}`, { isTyping: typingEvent.isTyping });
      }
    });
    this._emitTypingSetChange(true, newTypingMember);
  }

  /**
   * Constructs a typing event from a presence message.
   */
  private _typingEventFromPresenceMessage(
    message: Ably.PresenceMessage,
  ): { clientId: string; isTyping: boolean } | undefined {
    const chatPresenceData = message.data as ChatPresenceData;

    if (message.action === 'leave') {
      return {
        clientId: message.clientId,
        isTyping: false, // A "leave" event indicates the user is no longer typing
      };
    }

    if (chatPresenceData.typing) {
      return {
        clientId: message.clientId,
        isTyping: chatPresenceData.typing.isTyping, // Return whether the user is typing based on the presence data
      };
    }

    // If the presence message does not contain valid typing data, return undefined
    return undefined;
  }

  /**
   * Emits a typingSetChange with the current state.
   */
  private _emitTypingSetChange(syncInProgress: boolean, change: { clientId: string; isTyping: boolean }): void {
    this.emit(TypingEvents.Changed, {
      currentlyTyping: new Set(this._currentlyTyping),
      syncInProgress: syncInProgress,
      change: change,
    });
  }

  /**
   * Creates the realtime channel for typing indicators.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    // We now assume that presence and typing share a channel for this POC
    return channelManager.get(DefaultTyping.channelName(roomId));
  }

  /**
   * @inheritDoc
   */
  async get(): Promise<Set<string>> {
    this._logger.trace(`DefaultTyping.get();`);
    const members = await this._channel.presence.get();
    return new Set<string>(
      members.filter((m) => (m.data ? (m.data as ChatPresenceData).typing?.isTyping : false)).map((m_1) => m_1.clientId),
    );
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
    await this._presenceDataContribution.set((currentPresenceData: ChatPresenceData) => ({
      ...currentPresenceData,
      typing: {
        isTyping: true,
      },
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
      return {
        ...currentPresenceData,
        typing: {
          isTyping: false,
        },
      };
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

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace(`DefaultTyping.onDiscontinuity();`);
    this._discontinuityEmitter.on(listener);

    return {
      off: () => {
        this._discontinuityEmitter.off(listener);
      },
    };
  }

  discontinuityDetected(reason?: Ably.ErrorInfo): void {
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

  static channelName(roomId: string): string {
    return messagesChannelName(roomId);
  }
}
