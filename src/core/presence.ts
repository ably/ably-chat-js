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

  /**
   * @inheritDoc
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    this._logger.trace('Presence.get()', { params });
    const userOnPresence = await this._channel.presence.get(params);
    const presentUsers = userOnPresence.filter((user) => {
      const action = (user.data as ChatPresenceData).presence?.action;
      // If the latest chat presence action is 'enter' or 'update', the user is considered present
      return action === 'enter' || action === 'update';
    });
    return presentUsers.map((user) => ({
      connectionId: user.connectionId,
      clientId: user.clientId,
      action: 'present' as PresenceEvents,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data: user.data?.presence.userCustomData as PresenceData,
      updatedAt: user.timestamp,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extras: user.extras,
    }));
  }

  /**
   * @inheritDoc
   */
  async isUserPresent(clientId: string): Promise<boolean> {
    const presenceSet = await this._channel.presence.get({ clientId: clientId });
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
    const chatPresenceData = presenceMessage.data as ChatPresenceData;
    return {
      connectionId: presenceMessage.connectionId,
      clientId: presenceMessage.clientId,
      action: 'present' as PresenceEvents,
      data: chatPresenceData.presence?.userCustomData,
      updatedAt: presenceMessage.timestamp,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extras: presenceMessage.extras,
    };
  }

  private _chatPresenceEventFromPresenceMessage(presenceMessage: Ably.PresenceMessage): PresenceEvent | undefined {
    const realtimeMessageAction = presenceMessage.action as PresenceEvents;
    const presenceData = presenceMessage.data as ChatPresenceData;
    const eventType = presenceData.type;
    const chatPresenceData = presenceData.presence;

    // If the base realtime action is `leave`, the chat action should also be `leave`
    // In the case of a synthetic leave event, we cannot rely on the chatPresenceData to determine the chat action
    if (realtimeMessageAction === PresenceEvents.Leave) {
      return {
        action: 'leave' as PresenceEvents,
        clientId: presenceMessage.clientId,
        timestamp: presenceMessage.timestamp,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        data: presenceMessage.data?.presence.userCustomData as PresenceData,
      };
    }

    // If the event type is not a chat presence event, we can ignore this presence message
    if (eventType !== 'chat.presence') {
      return;
    }

    // We should have chat presence data at this stage as we have already checked the event type
    if (!chatPresenceData) {
      throw new Ably.ErrorInfo('chat presence data is missing', 40000, 400);
    }

    // If this is a `present` event, we can return the current data
    if (realtimeMessageAction === PresenceEvents.Present) {
      return {
        action: 'present' as PresenceEvents,
        clientId: presenceMessage.clientId,
        timestamp: presenceMessage.timestamp,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        data: presenceMessage.data?.presence.userCustomData as PresenceData,
      };
    }

    return {
      action: chatPresenceData.action as PresenceEvents,
      clientId: presenceMessage.clientId,
      timestamp: presenceMessage.timestamp,
      data: chatPresenceData.userCustomData,
    };
  }

  private _processPresenceSetChange(presenceSetChange: Ably.PresenceSetChange): void {
    const { members, current, previous, syncInProgress } = presenceSetChange;
    this._logger.debug('Processing presence set change', { current, syncInProgress});

    const chatCurrentEvent = this._chatPresenceEventFromPresenceMessage(current);
    // If the current event is not a chat presence event, we should ignore this presence set change
    if (!chatCurrentEvent) {
      return;
    }

    // Build the previous event, it may be undefined if this is the first presence set change
    const chatPreviousEvent = previous ? this._chatPresenceEventFromPresenceMessage(previous) : undefined;

    // Sync in progress: Reprocess the entire set of members till we are synced
    if (syncInProgress) {
      this._presenceMembers = members.map((member) => this._presenceMessageToPresenceMember(member));
      this._logger.debug('Sync in progress, replacing members list with new set');
      this._onPresenceSetChangeEmitter.emit('presenceSetChange', {
        members: [...this._presenceMembers],
        current: chatCurrentEvent,
        previous: chatPreviousEvent,
        syncInProgress,
      });
      return;
    }

    // Now we are synced, we can begin to process individual presence events.
    // First, check if we have a member that matches the current presence event
    const presentMember = this._presenceMembers.find(
      (member) => member.clientId === current.clientId && member.connectionId === current.connectionId,
    );

    // Handle case where member already exists in the list
    if (presentMember) {
      switch (chatCurrentEvent.action) {
        case PresenceEvents.Leave: {
          // Remove the member from the list
          this._presenceMembers = this._presenceMembers.filter(
            (member) => member.clientId !== current.clientId || member.connectionId !== current.connectionId,
          );
          break;
        }
        case PresenceEvents.Enter:
        case PresenceEvents.Present:
        case PresenceEvents.Update: {
          // Update the member in the list
          this._presenceMembers = this._presenceMembers.map((member) => {
            if (member.clientId === current.clientId && member.connectionId === current.connectionId) {
              return this._presenceMessageToPresenceMember(current);
            }
            return member;
          });
        }
      }
    } else {
      switch (chatCurrentEvent.action) {
        case PresenceEvents.Leave: {
          // Possible if some other client leaves before this client joins and we get a synthetic leave event
          this._logger.debug('Presence member not found in list, expected leave event', { current });
          break;
        }
        case PresenceEvents.Enter:
        case PresenceEvents.Update:
        case PresenceEvents.Present: {
          // When joining presence, we should get `present` messages for members already in the room, after which
          // we should get `enter` messages for new members joining the room
          this._presenceMembers.push(this._presenceMessageToPresenceMember(current));
        }
      }
    }
    console.log('New presence member set', this._presenceMembers );
    this._onPresenceSetChangeEmitter.emit('presenceSetChange', {
      members: [...this._presenceMembers],
      current: chatCurrentEvent,
      previous: chatPreviousEvent,
      syncInProgress,
    })
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
