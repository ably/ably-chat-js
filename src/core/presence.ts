import * as Ably from 'ably';

import { messagesChannelName } from './channel.js';
import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { PresenceEvents } from './events.js';
import { Logger } from './logger.js';
import { ChatPresenceData, PresenceDataContribution } from './presence-data-manager.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { RoomOptions } from './room-options.js';
import EventEmitter from './utils/event-emitter.js';

/**
 * Interface for PresenceEventsMap
 */
interface PresenceEventsMap {
  [PresenceEvents.Enter]: PresenceEvent;
  [PresenceEvents.Leave]: PresenceEvent;
  [PresenceEvents.Update]: PresenceEvent;
  [PresenceEvents.Present]: PresenceEvent;
}

/**
 * Type for PresenceData. Any JSON serializable data type.
 */
export type PresenceData = unknown;

interface PresenceSetChangeEventMap {
  ['presenceSetChange']: PresenceSetChangeEvent;
}

export interface PresenceSetChangeEvent {
  members: PresenceMember[];
  current: PresenceEvent;
  previous?: PresenceEvent;
  syncInProgress: boolean;
}

/**
 * Type for PresenceEvent
 */
export interface PresenceEvent {
  /**
   * The type of the presence event.
   */
  action: PresenceEvents;

  /**
   * The clientId of the client that triggered the presence event.
   */
  clientId: string;

  /**
   * The timestamp of the presence event.
   */
  timestamp: number;

  /**
   * The data associated with the presence event.
   */
  data: PresenceData;
}

/**
 * Type for PresenceMember
 */
export interface PresenceMember {
  /**
   * The connectionId of the presence member.
   */
  connectionId: string;

  /**
   * The clientId of the presence member.
   */
  clientId: string;

  /**
   * The data associated with the presence member.
   */
  data: PresenceData;

  /**
   * The current state of the presence member.
   */
  action: 'present' | 'enter' | 'leave' | 'update';

  /**
   * The extras associated with the presence member.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extras: any;

  /**
   * The timestamp of when the last change in state occurred for this presence member.
   */
  updatedAt: number;
}

/**
 * Type for PresenceListener
 * @param event The presence event that was received.
 */
export type PresenceListener = (event: PresenceEvent) => void;

/**
 * A response object that allows you to control a presence subscription.
 */
export interface PresenceSubscriptionResponse {
  /**
   * Unsubscribe the listener registered with {@link Presence.subscribe} from all presence events.
   */
  unsubscribe: () => void;
}

/**
 * This interface is used to interact with presence in a chat room: subscribing to presence events,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via {@link Room.presence}.
 */
export interface Presence extends EmitsDiscontinuities {
  /**
   * Method to get list of the current online users and returns the latest presence messages associated to it.
   * @param {Ably.RealtimePresenceParams} params - Parameters that control how the presence set is retrieved.
   * @returns {Promise<PresenceMessage[]>} or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;

  /**
   * Method to check if user with supplied clientId is online
   * @param {string} clientId - The client ID to check if it is present in the room.
   * @returns {Promise<{boolean}>} or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  isUserPresent(clientId: string): Promise<boolean>;

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  enter(data?: PresenceData): Promise<void>;

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  update(data?: PresenceData): Promise<void>;

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  leave(data?: PresenceData): Promise<void>;

  /**
   * Subscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   */
  subscribe(
    eventOrEvents: PresenceEvents | PresenceEvents[],
    listener?: PresenceListener,
  ): PresenceSubscriptionResponse;

  /**
   * Subscribe the given listener to all presence events.
   * @param listener listener to subscribe
   */
  subscribe(listener?: PresenceListener): PresenceSubscriptionResponse;

  /**
   * Unsubscribe all listeners from all presence events.
   */
  unsubscribeAll(): void;

  onPresenceSetChange(listener: (presenceSetChangeEvent: PresenceSetChangeEvent) => void): { off: () => void };

  /**
   * Get the underlying Ably realtime channel used for presence in this chat room.
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * @inheritDoc
 */
export class DefaultPresence
  extends EventEmitter<PresenceEventsMap>
  implements Presence, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _clientId: string;
  private _presenceMembers: PresenceMember[];
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
  private readonly _onPresenceSetChangeEmitter = new EventEmitter<PresenceSetChangeEventMap>();
  private readonly _presenceDataContribution: PresenceDataContribution;

  /**
   * Constructs a new `DefaultPresence` instance.
   * @param roomId The unique identifier of the room.
   * @param channelManager The channel manager to use for creating the presence channel.
   * @param clientId The client ID, attached to presences messages as an identifier of the sender.
   * A channel can have multiple connections using the same clientId.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    channelManager: ChannelManager,
    presenceDataContribution: PresenceDataContribution,
    clientId: string,
    logger: Logger,
  ) {
    super();
    this._presenceMembers = [];
    this._channel = this._makeChannel(roomId, channelManager);
    this._clientId = clientId;
    this._logger = logger;
    this._presenceDataContribution = presenceDataContribution;
  }

  /**
   * Creates the realtime channel for presence.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get(DefaultPresence.channelName(roomId));

    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.presence.subscribe(this.subscribeToEvents.bind(this));

    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.presence.onPresenceSetChange((event) => {
      this._processPresenceSetChange(event);
    });

    return channel;
  }

  /**
   * Get the underlying Ably realtime channel used for presence in this chat room.
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    this._logger.trace('Presence.get()', { params });
    // Fetch the list of presence messages from the channel
    const presenceMessages = await this._channel.presence.get(params);
    // Filter valid presence actions (e.g., 'enter' or 'update') and transform data
    return presenceMessages
      .filter((message) => {
        const presenceAction = (message.data as ChatPresenceData).presence?.action;
        return presenceAction === 'enter' || presenceAction === 'update' || presenceAction === 'present';
      })
      .map((filteredMessage) => this._presenceMessageToPresenceMember(filteredMessage));
  }

  /**
   * @inheritDoc
   */
  async isUserPresent(clientId: string): Promise<boolean> {
    const presenceSet = await this.get({ clientId });
    return presenceSet.length > 0;
  }

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async enter(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.enter()`, { data });

    await this._presenceDataContribution.set((current: ChatPresenceData) => ({
      ...current,
      presence: {
        // If the user is not already present, we should treat this as an enter event
        action: current.presence ? 'update' : 'enter',
        userCustomData: data,
      },
      type: 'chat.presence',
    }));
  }

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async update(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.update()`, { data });
    await this._presenceDataContribution.set((current: ChatPresenceData) => ({
      ...current,
      presence: {
        // If the user is not already present, we should treat this as an enter event
        action: current.presence ? 'update' : 'enter',
        userCustomData: data,
      },
      type: 'chat.presence',
    }));
  }

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    await this._presenceDataContribution.remove((current: ChatPresenceData) => {
      if (!current.presence || current.presence.action === 'leave') {
        // We should no op as we are not present
        return current;
      }
      return {
        ...current,
        presence: {
          action: 'leave',
          userCustomData: data,
        },
        type: 'chat.presence',
      };
    });
  }

  /**
   * Subscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   */
  subscribe(
    eventOrEvents: PresenceEvents | PresenceEvents[],
    listener?: PresenceListener,
  ): PresenceSubscriptionResponse;
  /**
   * Subscribe the given listener to all presence events.
   * @param listener listener to subscribe
   */
  subscribe(listener?: PresenceListener): PresenceSubscriptionResponse;
  subscribe(
    listenerOrEvents?: PresenceEvents | PresenceEvents[] | PresenceListener,
    listener?: PresenceListener,
  ): PresenceSubscriptionResponse {
    this._logger.trace('Presence.subscribe(); listenerOrEvents', { listenerOrEvents });
    if (!listenerOrEvents && !listener) {
      this._logger.error('could not subscribe to presence; invalid arguments');
      throw new Ably.ErrorInfo('could not subscribe listener: invalid arguments', 40000, 400);
    }

    // Add listener to all events
    if (listener) {
      this.on(listenerOrEvents as PresenceEvents, listener);
      return {
        unsubscribe: () => {
          this._logger.trace('Presence.unsubscribe();', { events: listenerOrEvents });
          this.off(listener);
        },
      };
    } else {
      this.on(listenerOrEvents as PresenceListener);
      return {
        unsubscribe: () => {
          this._logger.trace('Presence.unsubscribe();');
          this.off(listenerOrEvents as PresenceListener);
        },
      };
    }
  }

  /**
   * Unsubscribe all listeners from all presence events.
   */
  unsubscribeAll(): void {
    this._logger.trace('Presence.unsubscribeAll()');
    this.off();
  }

  /**
   * Method to handle and emit presence events
   * @param member - PresenceMessage ably-js object
   * @returns void - Emits a transformed event to all subscribers, or upon failure,
   * the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  subscribeToEvents = (member: Ably.PresenceMessage) => {
    this._logger.trace('Presence.subscribeToEvents();', { member });
    try {
      // Ably-js never emits the 'absent' event, so we can safely ignore it here.
      this.emit(member.action as PresenceEvents, {
        action: member.action as PresenceEvents,
        clientId: member.clientId,
        timestamp: member.timestamp,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        data: member.data?.userCustomData as PresenceData,
      });
    } catch (error) {
      this._logger.error(`unable to handle presence event: not a valid presence event`, { action: member.action });
      throw new Ably.ErrorInfo(
        `unable to handle ${member.action} presence event: not a valid presence event`,
        50000,
        500,
        (error as Error).message,
      );
    }
  };

  private _presenceMessageToPresenceMember(presenceMessage: Ably.PresenceMessage): PresenceMember {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { connectionId, clientId, timestamp, extras, data } = presenceMessage;
    const chatPresenceData = data as ChatPresenceData;
    return {
      connectionId,
      clientId,
      action: 'present' as PresenceEvents,
      data: chatPresenceData.presence?.userCustomData,
      updatedAt: timestamp,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extras: extras,
    };
  }

  private _chatPresenceEventFromPresenceMessage(presenceMessage: Ably.PresenceMessage): PresenceEvent | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { action, clientId, timestamp, data } = presenceMessage;
    const presenceData = data as ChatPresenceData;

    // If the presence data or its type is not valid, ignore this message
    if (!presenceData.presence || presenceData.type !== 'chat.presence') {
      this._logger.debug('Skipping non-chat presence event', { action });
      return;
    }

    // Map Ably action "leave" directly to a chat leave event
    if (action === PresenceEvents.Leave) {
      return {
        action: PresenceEvents.Leave,
        clientId,
        timestamp,
        data: presenceData.presence.userCustomData,
      };
    }

    // Map other valid actions like "enter", "update", and "present"
    return {
      action: presenceData.presence.action as PresenceEvents,
      clientId,
      timestamp,
      data: presenceData.presence.userCustomData,
    };
  }

  private _processPresenceSetChange(presenceSetChange: Ably.PresenceSetChange): void {
    const { members, current, previous, syncInProgress } = presenceSetChange;
    this._logger.debug('Processing presence set change', { current, syncInProgress });

    const chatCurrentEvent = this._chatPresenceEventFromPresenceMessage(current);

    // If we are not dealing with a valid chat presence event, ignore this message
    if (!chatCurrentEvent) {
      this._logger.debug('Skipping non-chat presence event', { current });
      return;
    }

    if (syncInProgress) {
      // We can't rely on individual presence messages during sync, so we replace the list
      // as a whole until the sync is complete
      this._handleSyncInProgress(members);
    } else {
      // We can now manually update the presence set based on the current event as
      // we are no longer in a sync state
      this._handleSyncComplete(current, chatCurrentEvent);
    }

    // Build the previous event if it exists
    const chatPreviousEvent = previous
      ? this._chatPresenceEventFromPresenceMessage(previous)
      : undefined;

    // Emit the presence set change event
    this._emitPresenceSetChange(chatCurrentEvent, chatPreviousEvent, syncInProgress);
  }


  private _handleSyncInProgress(members: Ably.PresenceMessage[]): void {
    this._presenceMembers = members.map((member) =>
      this._presenceMessageToPresenceMember(member),
    );
    this._logger.debug('Sync in progress, replacing members list with new set.');
  }

  private _handleSyncComplete(
    current: Ably.PresenceMessage,
    chatCurrentEvent: PresenceEvent,
  ): void {
    const presentMember = this._findPresenceMember(current);

    if (presentMember) {
      this._updateOrRemoveMember(current, chatCurrentEvent);
    } else {
      this._addNewMember(current, chatCurrentEvent);
    }
  }

  /**
   * Finds a presence member by matching `clientId` and `connectionId`.
   */
  private _findPresenceMember(current: Ably.PresenceMessage): PresenceMember | undefined {
    return this._presenceMembers.find(
      (member) => member.clientId === current.clientId && member.connectionId === current.connectionId,
    );
  }

  /**
   * Updates or removes a presence member based on the current event's action.
   */
  private _updateOrRemoveMember(current: Ably.PresenceMessage, chatCurrentEvent: PresenceEvent): void {
    switch (chatCurrentEvent.action) {
      case PresenceEvents.Leave: {
        this._presenceMembers = this._presenceMembers.filter(
          (member) => member.clientId !== current.clientId || member.connectionId !== current.connectionId,
        );
        break;
      }
      case PresenceEvents.Enter:
      case PresenceEvents.Present:
      case PresenceEvents.Update: {
        this._presenceMembers = this._presenceMembers.map((member) =>
          member.clientId === current.clientId && member.connectionId === current.connectionId
            ? this._presenceMessageToPresenceMember(current)
            : member,
        );
        break;
      }
    }
  }

  /**
   * Adds a new presence member to the list if they are not already present.
   */
  private _addNewMember(current: Ably.PresenceMessage, chatCurrentEvent: PresenceEvent): void {
    this._logger.debug('_addNewMember()', { current });
    if (
      chatCurrentEvent.action === PresenceEvents.Enter ||
      chatCurrentEvent.action === PresenceEvents.Update ||
      chatCurrentEvent.action === PresenceEvents.Present
    ) {
      this._presenceMembers.push(this._presenceMessageToPresenceMember(current));
    } else {
      this._logger.debug('Presence member not found in list, expected leave event', { current });
    }
  }

  private _emitPresenceSetChange(
    current: PresenceEvent,
    previous: PresenceEvent | undefined,
    syncInProgress: boolean,
  ): void {
    this._onPresenceSetChangeEmitter.emit('presenceSetChange', {
      members: [...this._presenceMembers],
      current,
      previous,
      syncInProgress,
    });
  }

  onPresenceSetChange(listener: (presenceSetChangeEvent: PresenceSetChangeEvent) => void): { off: () => void } {
    this._logger.trace('Presence.onPresenceSetChange();');
    this._onPresenceSetChangeEmitter.on(listener);

    return {
      off: () => {
        this._onPresenceSetChangeEmitter.off(listener);
      },
    };
  }

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace('Presence.onDiscontinuity();');
    this._discontinuityEmitter.on(listener);

    return {
      off: () => {
        this._discontinuityEmitter.off(listener);
      },
    };
  }

  discontinuityDetected(reason?: Ably.ErrorInfo): void {
    this._logger.warn('Presence.discontinuityDetected();', { reason });
    this._discontinuityEmitter.emit('discontinuity', reason);
  }

  /**
   * @inheritDoc ContributesToRoomLifecycle
   */
  get attachmentErrorCode(): ErrorCodes {
    return ErrorCodes.PresenceAttachmentFailed;
  }

  /**
   * @inheritDoc
   */
  get detachmentErrorCode(): ErrorCodes {
    return ErrorCodes.PresenceDetachmentFailed;
  }

  /**
   * Merges the channel options for the room with the ones required for presence.
   *
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(roomOptions: RoomOptions): ChannelOptionsMerger {
    return (options) => {
      const channelModes = ['PUBLISH', 'SUBSCRIBE'] as Ably.ChannelMode[];
      if (roomOptions.presence?.enter === undefined || roomOptions.presence.enter) {
        channelModes.push('PRESENCE');
      }

      if (roomOptions.presence?.subscribe === undefined || roomOptions.presence.subscribe) {
        channelModes.push('PRESENCE_SUBSCRIBE');
      }

      return { ...options, modes: channelModes };
    };
  }

  /**
   * Returns the channel name for the presence channel.
   *
   * @param roomId The unique identifier of the room.
   * @returns The channel name for the presence channel.
   */
  static channelName(roomId: string): string {
    return messagesChannelName(roomId);
  }
}
