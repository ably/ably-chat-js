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
import { DefaultRoomLifecycle, RoomStatus } from './room-status.js';
import { PresenceMessage } from 'ably';

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
  private _presenceMembers: InternalPresenceMember[];
  private _syncInProgress = false;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
  private readonly _onPresenceSetChangeEmitter = new EventEmitter<PresenceSetChangeEventMap>();
  private readonly _presenceDataContribution: PresenceDataContribution;
  private readonly _roomLifeCycle: DefaultRoomLifecycle;

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
    roomLifeCycle: DefaultRoomLifecycle,
  ) {
    super();
    this._presenceMembers = [];
    this._channel = this._makeChannel(roomId, channelManager);
    this._clientId = clientId;
    this._logger = logger;
    this._presenceDataContribution = presenceDataContribution;
    this._roomLifeCycle = roomLifeCycle;
    this._listenToRoomLifeCycle();
    this._listenToPresenceEvents();
  }

  private _listenToPresenceEvents() {
    this.on((event) => {
      const setChangeEvent = {
        members: [...this._presenceMembers],
        current: event,
        syncInProgress: this._syncInProgress,
      }
      this._logger.trace('Presence._listenToPresenceEvents; Emitting presenceSetChange', { setChangeEvent });
      this._onPresenceSetChangeEmitter.emit('presenceSetChange', setChangeEvent);
    });
  }

  private _listenToRoomLifeCycle() {
    // TODO emit a onSetCleared event
    this._roomLifeCycle.onChange((change) => {
      if (change.current === RoomStatus.Detached) {
        // In this case, we would not receive the usual leave events, so we should clear the presence members
        this._logger.debug('Presence._listenToRoomLifeCycle; Room detached, clearing current presence members');
        this._presenceMembers = [];
      }
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
        nonce: Math.random().toString(36).slice(2),
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
        // We should no op as we are not present
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

  private _presenceMessageToPresenceMember(presenceMessage: Ably.PresenceMessage): InternalPresenceMember {
    this._logger.trace('Presence._presenceMessageToPresenceMember();', { presenceMessage });
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
      _nonce: chatPresenceData.presence?.nonce,
    };
  }

  private _setPresenceMembersFromMessages(messages: PresenceMessage[]): void {
    this._logger.trace('Presence._setPresenceMembersFromMessages();', { messages });
    this._presenceMembers = messages.map((member) => this._presenceMessageToPresenceMember(member));
    this._logger.trace('Presence._setPresenceMembersFromMessages(); New presence members set', {members: this._presenceMembers});
  }

  private _processPresenceSetChange(presenceSetChange: Ably.PresenceSetChange): void {
    this._logger.trace('Presence._processPresenceSetChange(); Processing presence set change');
    const { members, current, syncInProgress } = presenceSetChange;

    // Locate the presence member in the current presence set
    const presentMember = this._findPresenceMember(current);
    if (presentMember) {
      this._handlePresentMember(current, presentMember);
    } else {
      this._handleNonPresentMember(current);
    }

    if (syncInProgress) {
      this._logger.debug('Presence._processPresenceSetChange(); Presence sync in progress, updating presence members');
      this._setPresenceMembersFromMessages(members);
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

  private _removePresenceMember(current: Ably.PresenceMessage): void {
    this._logger.debug('Presence._removePresenceMember(); Removing presence member', { current });
    this._presenceMembers = this._presenceMembers.filter(
      (member) => member.clientId !== current.clientId || member.connectionId !== current.connectionId,
    );
  }

  private _updatePresenceMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Presence._updatePresenceMember();', { current });
    // Update the presence member with the new data
    this._presenceMembers = this._presenceMembers.map((member) =>
      member.clientId === current.clientId && member.connectionId === current.connectionId
        ? this._presenceMessageToPresenceMember(current)
        : member,
    );
  }

  /**
   * Updates or removes a presence member based on the current event's action.
   */
  private _handlePresentMember(current: Ably.PresenceMessage, presentMember: PresenceMember): void {
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
          data: presentMember.data,
        }
        break
      }
      case PresenceEvents.Update: {
        const chatPresenceData = current.data as ChatPresenceData;
        this._logger.debug('Presence._handlePresentMember(); Member presence data has changed', { chatPresenceData })
        if (!chatPresenceData.presence) {
          // Member is still in realtime presence, but no longer in chat presence
          this._removePresenceMember(current);
          eventToEmit = {
            action: PresenceEvents.Leave,
            clientId: current.clientId,
            connectionId: current.connectionId,
            timestamp: current.timestamp,
            // TODO We need to remove the leaveWithData
            data: presentMember.data,
          }
          break;
        }
        // Check to see if the presence data has changed, if not, it's likely a typing event
        if (chatPresenceData.presence.nonce === (presentMember as InternalPresenceMember)._nonce) {
          this._logger.debug('Presence._handlePresentMember(); No changes to member presence data, skipping', {
            current,
          });
          return;
        }
        // Update the presence member with the new data
        this._updatePresenceMember(current);
        eventToEmit = {
          action: PresenceEvents.Update,
          clientId: current.clientId,
          connectionId: current.connectionId,
          timestamp: current.timestamp,
          data: chatPresenceData.presence.userCustomData,
        }
        break;
      }
      default: {
        this._logger.warn('Presence._handlePresentMember(); Unsupported presence event', { current });
        return;
      }
    }
    this._emitEvent(eventToEmit);
  }

  /**
   * Adds a new presence member to the list if they are not already present.
   */
  private _handleNonPresentMember(current: Ably.PresenceMessage): void {
    this._logger.trace('Presence._handleNonPresentMember();', { current });

    const chatPresenceData = current.data as ChatPresenceData;
    if (current.action === PresenceEvents.Leave) {
      this._logger.debug('Presence._handleNonPresentMember(); Member not present, ignoring leave event', { current, chatPresenceData });
      return;
    }

    // If this is a chat presence event, we should have some presence data
    if (!chatPresenceData.presence) {
      this._logger.debug('Presence._handleNonPresentMember(); Skipping non-chat presence event', { current, chatPresenceData });
      return;
    }

    // If this is a Present event, we should add a new member and emit the event
    if (current.action === PresenceEvents.Present) {
      this._logger.debug('Presence._handleNonPresentMember(); Member not present, adding new member', { current, chatPresenceData });
      this._presenceMembers.push(this._presenceMessageToPresenceMember(current));
      this._emitEvent({
        action: PresenceEvents.Present,
        clientId: current.clientId,
        connectionId: current.connectionId,
        timestamp: current.timestamp,
        data: chatPresenceData.presence.userCustomData,
      });
      return;
    }

    // Otherwise, this is a new member joining chat presence for the first time, so emit an Enter event
    this._logger.debug('Presence._handleNonPresentMember(); Member has entered presence', { current, chatPresenceData });
    this._presenceMembers.push(this._presenceMessageToPresenceMember(current));
    this._emitEvent({
      action: PresenceEvents.Enter,
      clientId: current.clientId,
      connectionId: current.connectionId,
      timestamp: current.timestamp,
      data: chatPresenceData.presence.userCustomData,
    });
  }

  private _emitEvent(event: PresenceEvent): void {
    this._logger.debug('Presence._handleNonPresentMember(); Emitting presence event', { event });
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
