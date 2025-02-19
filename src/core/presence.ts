import * as Ably from 'ably';
import { PresenceMessage } from 'ably';

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
import { PresenceEvents, PresenceSetEvents } from './events.js';
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

/**
 * An interface representing the map of presence set change events.
 *
 */
interface PresenceSetChangeEventMap {
  [PresenceSetEvents.PresenceSetChange]: PresenceSetChangeEvent;
}

/**
 * Represents a change in the state of a presence set.
 */
export interface PresenceSetChangeEvent {
  /**
   * The current list of members associated with the presence set.
   */
  members: PresenceMember[];
  /**
   * The current event that triggered the presence set change.
   */
  current: PresenceEvent;
  /**
   * The previous event that triggered the presence set change. This field may not be present if the previous event
   * is not available.
   */
  previous?: PresenceEvent;
  /**
   * Indicates whether a synchronization is currently in progress. When a sync is in progress, the presence members
   * may not be up-to-date with the latest presence messages. This field can be used to determine if the presence
   * members are in a consistent state before updating some UI.
   */
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
   * The connectionId of the presence member.
   */
  connectionId: string;

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
 * InternalPresenceMember extends PresenceMember and adds a nonce field.
 */
interface InternalPresenceMember extends PresenceMember {
  /**
   * An internal unique identifier for the presence data.
   */
  _nonce?: string;
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

  /**
   * Subscribe to presence set change events, which are emitted when a presence event is received.
   * @param listener
   */
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
  private _presenceMembers: Map<string, InternalPresenceMember> = new Map<string, InternalPresenceMember>();
  private _presenceMessages: PresenceMessage[] = [];
  private _syncInProgressStatus: { previous: boolean; current: boolean } = { previous: false, current: false };
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
  private readonly _onPresenceSetChangeEmitter = new EventEmitter<PresenceSetChangeEventMap>();
  private readonly _presenceDataContribution: PresenceDataContribution;

  /**
   * Constructs a new `DefaultPresence` instance.
   * @param roomId The unique identifier of the room.
   * @param channelManager The channel manager to use for creating the presence channel.
   * @param presenceDataContribution
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
    this._presenceMembers = new Map<string, InternalPresenceMember>();
    this._channel = this._makeChannel(roomId, channelManager);
    this._clientId = clientId;
    this._logger = logger;
    this._presenceDataContribution = presenceDataContribution;
    this._listenToPresenceEvents();
    this._listenForDiscontinuities();
  }

  /**
   * Listens for discontinuities and clears the presence members when a discontinuity is detected.
   * @private
   */
  private _listenForDiscontinuities() {
    this.onDiscontinuity(() => {
      this._logger.warn('Presence._listenForDiscontinuities(); Discontinuity detected, clearing presence members');
      this._presenceMembers.clear();
    });
  }

  /**
   * Listens to presence events and emits a presenceSetChange event when a presence event is received.
   * @private
   */
  private _listenToPresenceEvents() {
    this.on((event) => {
      const setChangeEvent = {
        members: [...this._presenceMembers.values()],
        current: event,
        syncInProgress: this._syncInProgressStatus.current,
      };
      if (!this._syncInProgressStatus.current && this._syncInProgressStatus.previous) {
        // A sync has just completed, so we should ensure the presence members are up-to-date
        this._logger.warn('Presence._listenToPresenceEvents(); Sync completed, updating presence members');
        this._setPresenceMembersFromMessages(this._presenceMessages);
        setChangeEvent.members = [...this._presenceMembers.values()];
      }
      this._logger.trace('Presence._listenToPresenceEvents(); Emitting presenceSetChange', { setChangeEvent });
      this._onPresenceSetChangeEmitter.emit(PresenceSetEvents.PresenceSetChange, setChangeEvent);
    });
  }

  /**
   * Creates the realtime channel for presence.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get(DefaultPresence.channelName(roomId));

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
    // Fetch the list of presence messages from the channel
    const presenceMessages = await this._channel.presence.get(params);
    // Filter for members with presence data
    return presenceMessages
      .filter((message) => {
        return (message.data as ChatPresenceData).presence;
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
        userCustomData: data,
      },
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
        // Set a nonce to ensure uniqueness of the update when compared to the previous presence data
        nonce: `${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
        userCustomData: data,
      },
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
      if (!current.presence) {
        // TODO - We should no op as we are not present
        return current;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { presence, ...rest } = current;
      return rest;
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
   * Converts a presence message to a presence member, with the action set to 'present'.
   * @param presenceMessage
   * @private
   */
  private _presenceMessageToPresenceMember(presenceMessage: Ably.PresenceMessage): InternalPresenceMember {
    this._logger.trace('Presence._presenceMessageToPresenceMember();', { presenceMessage });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { clientId, timestamp, extras, data, connectionId } = presenceMessage;
    const chatPresenceData = data as ChatPresenceData;
    return {
      connectionId,
      clientId,
      action: 'present' as PresenceEvents,
      data: chatPresenceData.presence?.userCustomData,
      updatedAt: timestamp,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extras: extras,
      _nonce: chatPresenceData.presence?.nonce,
    };
  }

  /**
   * Sets the presence members from the provided presence messages.
   * @param messages
   * @private
   */
  private _setPresenceMembersFromMessages(messages: PresenceMessage[]): void {
    this._logger.trace('Presence._setPresenceMembersFromMessages();', { messages });
    // Clear the current presence members
    this._presenceMembers.clear();
    for (const message of messages) {
      this._setPresenceMember(message);
    }
    this._logger.trace('Presence._setPresenceMembersFromMessages(); New presence members set', {
      members: [...this._presenceMembers.values()],
    });
  }

  /**
   * Processes a presence set change event, updating the presence members list and emitting the appropriate events.
   * @param presenceSetChange
   * @private
   */
  private _processPresenceSetChange(presenceSetChange: Ably.PresenceSetChange): void {
    this._logger.trace('Presence._processPresenceSetChange(); Processing new set change event');
    const { members, current, syncInProgress } = presenceSetChange;
    // Set the current presence messages
    this._presenceMessages = members;
    // Set the sync in progress status
    this._syncInProgressStatus.previous = this._syncInProgressStatus.current
    this._syncInProgressStatus.current = syncInProgress;

    // Locate the presence member in the current presence set
    const presentMember = this._findPresenceMember(current);
    if (presentMember) {
      this._handlePresentMember(current, presentMember);
    } else {
      this._handleNonPresentMember(current);
    }
  }

  /**
   * Generates a unique key for a presence member based on the clientId and connectionId.
   * @param clientId
   * @param connectionId
   * @private
   */
  private _keyFromClientAndConnectionId(clientId: string, connectionId: string): string {
    return `${clientId}:${connectionId}`;
  }

  /**
   * Finds a presence member by matching `clientId` and `connectionId`.
   */
  private _findPresenceMember(current: Ably.PresenceMessage): InternalPresenceMember | undefined {
    return this._presenceMembers.get(this._keyFromClientAndConnectionId(current.clientId, current.connectionId));
  }

  /**
   * Removes a presence member from the list.
   * @param current
   * @private
   */
  private _removePresenceMember(current: Ably.PresenceMessage): void {
    this._logger.debug('Presence._removePresenceMember(); Removing presence member', { current });
    this._presenceMembers.delete(this._keyFromClientAndConnectionId(current.clientId, current.connectionId));
  }

  /**
   * Sets a presence member in the list.
   * @param current
   * @private
   */
  private _setPresenceMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Presence._updatePresenceMember();', { current });
    // Update the presence member with the new data
    const memberKey = this._keyFromClientAndConnectionId(current.clientId, current.connectionId);
    this._presenceMembers.set(memberKey, this._presenceMessageToPresenceMember(current));
  }

  /**
   * Handles updates to a presence member.
   */
  private _handlePresentMember(current: Ably.PresenceMessage, presentMember: InternalPresenceMember): void {
    this._logger.trace('Presence._handlePresentMember();', { current, presentMember });
    let eventToEmit: PresenceEvent;
    switch (current.action) {
      case PresenceEvents.Leave: {
        this._logger.debug('Presence._handlePresentMember() Member has left presence', { presentMember });
        this._removePresenceMember(current);
        eventToEmit = {
          action: PresenceEvents.Leave,
          clientId: current.clientId,
          connectionId: current.connectionId,
          timestamp: current.timestamp,
          // TODO We need to remove the leaveWithData
          data: presentMember.data,
        };
        break;
      }
      case PresenceEvents.Update: {
        const chatPresenceData = current.data as ChatPresenceData;
        this._logger.debug('Presence._handlePresentMember(); Member presence data has changed', { chatPresenceData });
        if (!chatPresenceData.presence) {
          // Member is still in realtime presence, but no longer in chat presence
          this._removePresenceMember(current);
          eventToEmit = {
            action: PresenceEvents.Leave,
            clientId: current.clientId,
            connectionId: current.connectionId,
            timestamp: current.timestamp,
            // TODO Still need to remove the leaveWithData
            data: presentMember.data,
          };
          break;
        }
        // Check to see if the presence data has changed, if not, it's likely a typing event
        if (chatPresenceData.presence.nonce === presentMember._nonce) {
          this._logger.debug('Presence._handlePresentMember(); No changes to member presence data, skipping', {
            current,
          });
          return;
        }
        // Update the presence member with the new data
        this._setPresenceMember(current);
        eventToEmit = {
          action: PresenceEvents.Update,
          clientId: current.clientId,
          connectionId: current.connectionId,
          timestamp: current.timestamp,
          data: chatPresenceData.presence.userCustomData,
        };
        break;
      }
      case PresenceEvents.Enter: {
        this._logger.debug('Presence._handlePresentMember(); Member was already presence', { current });
        return;
      }
      default: {
        this._logger.warn('Presence._handlePresentMember(); Unsupported presence event', { current });
        return;
      }
    }
    this._emitEvent(eventToEmit);
  }

  /**
   * Handles non-present members.
   */
  private _handleNonPresentMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Presence._handleNonPresentMember();', { current });

    if (current.action === PresenceEvents.Leave) {
      this._logger.debug('Presence._handleNonPresentMember(); Member not present, ignoring leave event', { current });
      return;
    }

    const chatPresenceData = current.data as ChatPresenceData;

    // If this is a chat presence event, we should have some presence data
    if (!chatPresenceData.presence) {
      this._logger.debug('Presence._handleNonPresentMember(); Skipping non-chat presence event', {
        current,
        chatPresenceData,
      });
      return;
    }

    let eventToEmit: PresenceEvent;

    // If this is a `Present` event, we should add a new member and emit the event
    if (current.action === PresenceEvents.Present) {
      this._logger.debug('Presence._handleNonPresentMember(); Adding present member', { current, chatPresenceData });
      this._setPresenceMember(current);
      eventToEmit = {
        action: PresenceEvents.Present,
        clientId: current.clientId,
        connectionId: current.connectionId,
        timestamp: current.timestamp,
        data: chatPresenceData.presence.userCustomData,
      };
    } else {
      // Otherwise, this is a new member joining chat presence for the first time, so emit an Enter event
      this._logger.debug('Presence._handleNonPresentMember(); Member has entered presence', {
        current,
        chatPresenceData,
      });
      // Add the new member to the presence list
      this._setPresenceMember(current);
      // Create the enter event to emit
      eventToEmit = {
        action: PresenceEvents.Enter,
        clientId: current.clientId,
        connectionId: current.connectionId,
        timestamp: current.timestamp,
        data: chatPresenceData.presence.userCustomData,
      };
    }
    this._emitEvent(eventToEmit);
  }

  private _emitEvent(event: PresenceEvent): void {
    this._logger.debug('Presence._emitEvent(); Emitting presence event', { event });
    this.emit(event.action, event);
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
