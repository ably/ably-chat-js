import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { PresenceEventType } from './events.js';
import { Logger } from './logger.js';
import { InternalRoomOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * Interface for PresenceEventsMap
 */
interface PresenceEventsMap {
  [PresenceEventType.Enter]: PresenceEvent;
  [PresenceEventType.Leave]: PresenceEvent;
  [PresenceEventType.Update]: PresenceEvent;
  [PresenceEventType.Present]: PresenceEvent;
}

/**
 * Type for PresenceData. Any JSON serializable data type.
 */
export type PresenceData = unknown;

/**
 * Type for PresenceEvent
 */
export interface PresenceEvent {
  /**
   * The type of the presence event.
   */
  type: PresenceEventType;

  /**
   * The presence member associated with this event.
   */
  member: PresenceMember;
}

/**
 * Type for PresenceMember.
 *
 * Presence members are unique based on their `connectionId` and `clientId`. It is possible for
 * multiple users to have the same `clientId` if they are connected to the room from different devices.
 */
export type PresenceMember = Omit<Ably.PresenceMessage, 'id' | 'action' | 'timestamp'> & {
  /**
   * The timestamp of when the last change in state occurred for this presence member.
   */
  updatedAt: Date;

  /**
   * The data associated with the presence member.
   */
  data: PresenceData;

  /**
   * The extras associated with the presence member.
   */
  extras: unknown;
};

/**
 * Type for PresenceListener
 * @param event The presence event that was received.
 */
export type PresenceListener = (event: PresenceEvent) => void;

/**
 * This interface is used to interact with presence in a chat room: subscribing to presence events,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via {@link Room.presence}.
 */
export interface Presence {
  /**
   * Method to get list of the current online users and returns the latest presence messages associated to it.
   * @param params - Parameters that control how the presence set is retrieved.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;

  /**
   * Method to check if user with supplied clientId is online
   * @param clientId - The client ID to check if it is present in the room.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  isUserPresent(clientId: string): Promise<boolean>;

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  enter(data?: PresenceData): Promise<void>;

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  update(data?: PresenceData): Promise<void>;

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  leave(data?: PresenceData): Promise<void>;

  /**
   * Subscribe the given listener from the given list of events.
   *
   * Note: This requires presence events to be enabled via the `enableEvents` option in
   * the {@link PresenceOptions} provided to the room. If this is not enabled, an error will be thrown.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   * @throws An {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(eventOrEvents: PresenceEventType | PresenceEventType[], listener?: PresenceListener): Subscription;

  /**
   * Subscribe the given listener to all presence events.
   *
   * Note: This requires presence events to be enabled via the `enableEvents` option in
   * the {@link PresenceOptions} provided to the room. If this is not enabled, an error will be thrown.
   * @param listener listener to subscribe
   * @throws An {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(listener?: PresenceListener): Subscription;
}

/**
 * @inheritDoc
 */
export class DefaultPresence implements Presence {
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<PresenceEventsMap>();
  private readonly _options: InternalRoomOptions;

  /**
   * Constructs a new `DefaultPresence` instance.
   * @param channel The Realtime channel instance.
   * @param clientId The client ID, attached to presences messages as an identifier of the sender.
   * A channel can have multiple connections using the same clientId.
   * @param logger An instance of the Logger.
   * @param options The room options.
   */
  constructor(channel: Ably.RealtimeChannel, clientId: string, logger: Logger, options: InternalRoomOptions) {
    this._channel = channel;
    this._clientId = clientId;
    this._logger = logger;
    this._options = options;

    this._applyChannelSubscriptions();
  }

  /**
   * Sets up channel subscriptions for presence.
   */
  private _applyChannelSubscriptions(): void {
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.presence.subscribe(this.subscribeToEvents.bind(this));
  }

  /**
   * @inheritDoc
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    this._logger.trace('Presence.get()', { params });
    this._assertChannelState();
    const userOnPresence = await this._channel.presence.get(params);

    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return userOnPresence.map((user) => this._realtimeMemberToPresenceMember(user));
  }

  /**
   * @inheritDoc
   */
  async isUserPresent(clientId: string): Promise<boolean> {
    this._logger.trace(`Presence.isUserPresent()`, { clientId });
    this._assertChannelState();
    const presenceSet = await this._channel.presence.get({ clientId: clientId });
    return presenceSet.length > 0;
  }

  /**
   * @inheritDoc
   */
  async enter(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.enter()`, { data });
    this._assertChannelState();
    return this._channel.presence.enterClient(this._clientId, data);
  }

  /**
   * @inheritDoc
   */
  async update(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.update()`, { data });
    this._assertChannelState();
    return this._channel.presence.updateClient(this._clientId, data);
  }

  /**
   * @inheritDoc
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    this._assertChannelState();
    return this._channel.presence.leaveClient(this._clientId, data);
  }

  /**
   * @inheritDoc
   */
  subscribe(eventOrEvents: PresenceEventType | PresenceEventType[], listener?: PresenceListener): Subscription;
  /**
   * @inheritDoc
   */
  subscribe(listener?: PresenceListener): Subscription;
  subscribe(
    listenerOrEvents?: PresenceEventType | PresenceEventType[] | PresenceListener,
    listener?: PresenceListener,
  ): Subscription {
    this._logger.trace('Presence.subscribe(); listenerOrEvents', { listenerOrEvents });

    // Check if presence events are enabled
    if (!this._options.presence.enableEvents) {
      this._logger.error('could not subscribe to presence; presence events are not enabled');
      throw new Ably.ErrorInfo('could not subscribe to presence; presence events are not enabled', 40000, 400);
    }

    if (!listenerOrEvents && !listener) {
      this._logger.error('could not subscribe to presence; invalid arguments');
      throw new Ably.ErrorInfo('could not subscribe listener: invalid arguments', 40000, 400);
    }

    // Add listener to all events
    if (listener) {
      const wrapped = wrap(listener);
      this._emitter.on(listenerOrEvents as PresenceEventType, wrapped);
      return {
        unsubscribe: () => {
          this._logger.trace('Presence.unsubscribe();', { events: listenerOrEvents });
          this._emitter.off(wrapped);
        },
      };
    } else {
      const wrapped = wrap(listenerOrEvents as PresenceListener);
      this._emitter.on(wrapped);
      return {
        unsubscribe: () => {
          this._logger.trace('Presence.unsubscribe();');
          this._emitter.off(wrapped);
        },
      };
    }
  }

  /**
   * Method to handle and emit presence events
   * @param member - PresenceMessage ably-js object
   */
  subscribeToEvents = (member: Ably.PresenceMessage) => {
    this._emitter.emit(member.action as PresenceEventType, {
      type: member.action as PresenceEventType,
      member: this._realtimeMemberToPresenceMember(member),
    });
  };

  /**
   * Merges the channel options for the room with the ones required for presence.
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(roomOptions: InternalRoomOptions): ChannelOptionsMerger {
    return (options) => {
      // Presence mode is always required
      if (!options.modes.includes('PRESENCE')) {
        options.modes.push('PRESENCE');
      }
      // If presence events are enabled, add the PRESENCE_SUBSCRIBE mode
      if (roomOptions.presence.enableEvents && !options.modes.includes('PRESENCE_SUBSCRIBE')) {
        options.modes.push('PRESENCE_SUBSCRIBE');
      }
      return options;
    };
  }

  /**
   * Converts an Ably presence message to a presence member.
   * @param member The Ably presence message to convert.
   * @returns The presence member.
   */
  private _realtimeMemberToPresenceMember(member: Ably.PresenceMessage): PresenceMember {
    return {
      ...member,
      data: member.data as PresenceData,
      updatedAt: new Date(member.timestamp),
    };
  }

  private _assertChannelState(): void {
    if (this._channel.state !== 'attaching' && this._channel.state !== 'attached') {
      this._logger.error('could not perform presence operation; room is not attached');
      throw new Ably.ErrorInfo('could not perform presence operation; room is not attached', 40000, 400);
    }
  }
}
