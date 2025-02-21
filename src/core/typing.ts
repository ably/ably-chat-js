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
import { PresenceEvents, TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { ChatPresenceData, PresenceDataContribution, PresenceManager } from './presence-data-manager.js';
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
  private _presenceMessages: Ably.PresenceMessage[] = [];
  private _syncInProgressStatus = {
    current: false,
    previous: false,
  };

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | undefined;

  private _currentlyTyping: Set<string> = new Set<string>();
  private readonly _presenceDataContribution: PresenceDataContribution;
  private readonly _presenceManager: PresenceManager;

  /**
   * Constructs a new `DefaultTyping` instance.
   * @param roomId The unique identifier of the room.
   * @param options The options for typing in the room.
   * @param channelManager The channel manager for the room.
   * @param presenceManager
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    options: TypingOptions,
    channelManager: ChannelManager,
    presenceManager: PresenceManager,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._clientId = clientId;
    this._logger = logger;
    this._channel = this._makeChannel(roomId, channelManager);

    // Timeout for typing
    this._typingTimeoutMs = options.timeoutMs;
    this._presenceManager = presenceManager
    this._presenceDataContribution = presenceManager.newContributor();
    this._listenForDiscontinuities();
  }

  /**
   * Listens for discontinuities and clears the typing set when one is detected.
   */
  private _listenForDiscontinuities() {
    this.onDiscontinuity(() => {
      this._logger.warn('Typing._listenForDiscontinuities(); Discontinuity detected, clearing typers');
      this._currentlyTyping.clear();
    });
  }

  /**
   * Listens for presence set changes and processes the relevant typing data.
   */
  private _processTypingSetChange(presenceSetChange: Ably.PresenceSetChange): void {
    this._logger.trace('Typing._processTypingSetChange(); Process new set change event.');
    const { current, members, syncInProgress } = presenceSetChange;

    this._presenceMessages = members;
    // Set the sync in progress status
    this._syncInProgressStatus.previous = this._syncInProgressStatus.current;
    this._syncInProgressStatus.current = syncInProgress;

    const typer = this._currentlyTyping.has(current.clientId);
    if (typer) {
      this._handleTypingMember(current);
    } else {
      this._handleNonTypingMember(current);
    }
  }

  /**
   * Handles an update to a typer currently in the typing set.
   */
  private _handleTypingMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Typing._handleTypingMember();', { current });
    let change: { clientId: string; isTyping: boolean };

    switch (current.action) {
      // If the client has left presence, they are no longer typing
      case PresenceEvents.Leave: {
        this._logger.debug('Typing._handleTypingMember(); Client has stopped typing', { clientId: current.clientId });
        this._currentlyTyping.delete(current.clientId);
        change = {
          clientId: current.clientId,
          isTyping: false,
        };
        break;
      }
      // If the client has updated presence, they may have stopped typing
      case PresenceEvents.Update: {
        const chatPresenceData = current.data as ChatPresenceData;
        if (chatPresenceData.typing?.isTyping) {
          // Member is still typing, do nothing
          this._logger.debug('Typing._handleTypingMember(); Client is still typing', { clientId: current.clientId });
          return;
        } else {
          this._logger.debug('Typing._handleTypingMember(); Client has stopped typing', {
            clientId: current.clientId,
          });
          this._currentlyTyping.delete(current.clientId);
          change = {
            clientId: current.clientId,
            isTyping: false,
          };
          break;
        }
      }
      default: {
        this._logger.warn('Typing._handleTypingMember(); Ignoring unhandled event', { current });
        return;
      }
    }
    this._emitTypingSetChange(change);
  }

  private _handleNonTypingMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Typing._handleNonTypingMember();', { current });
    const chatPresenceData = current.data as ChatPresenceData;

    // If the client has left presence, but was not typing, ignore
    if (current.action === PresenceEvents.Leave || !chatPresenceData.typing?.isTyping) {
      this._logger.debug('Typing._handleNonTypingMember(); Client was not typing, ignoring stopped typing event', {
        current,
      });
      return;
    }

    // In all other cases, we should add the client to the typing set and emit a typingStarted event
    this._logger.debug('Typing._handleNonTypingMember(); Client has started typing', { clientId: current.clientId });
    this._currentlyTyping.add(current.clientId);
    this._emitTypingSetChange({
      clientId: current.clientId,
      isTyping: true,
    });
  }

  /**
   * Emits a typingSetChange with the current state.
   */
  private _emitTypingSetChange(change: { clientId: string; isTyping: boolean }): void {
    this._logger.trace('Typing._emitTypingSetChange();', { change });
    const setChangeEvent = {
      currentlyTyping: new Set(this._currentlyTyping),
      change: change,
      syncInProgress: this._syncInProgressStatus.current,
    };

    if (!this._syncInProgressStatus.current && this._syncInProgressStatus.previous) {
      // A sync has just completed, so we should ensure the current typers are up to date
      this._logger.warn('Typing._emitTypingSetChange(); Sync completed, updating current typers');
      this._currentlyTyping = new Set(this._presenceMessages.filter((m) => (m.data as ChatPresenceData).typing?.isTyping).map((m) => m.clientId));
      setChangeEvent.currentlyTyping = new Set(this._currentlyTyping)
    }

    this.emit(TypingEvents.Changed, setChangeEvent);
  }

  /**
   * Creates the realtime channel for typing indicators.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    // We now assume that presence and typing share a channel for this POC
    const channel = channelManager.get(DefaultTyping.channelName(roomId));
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.presence.onPresenceSetChange((presenceSetChange) => {
      this._processTypingSetChange(presenceSetChange);
    });
    return channel;
  }

  /**
   * @inheritDoc
   */
  async get(): Promise<Set<string>> {
    this._logger.trace(`DefaultTyping.get();`);
    const members = await this._presenceManager.getPresenceSet()
    return new Set<string>(
      members
        .filter((m) => (m.data ? (m.data as ChatPresenceData).typing?.isTyping : false))
        .map((m_1) => m_1.clientId),
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
