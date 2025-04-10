import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { PresenceEvents } from './events.js';
import { Logger } from './logger.js';
import { InternalRoomOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

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
 * Type for AblyPresenceData
 */
interface AblyPresenceData {
  userCustomData: PresenceData;

  [key: string]: unknown;
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
 * This interface is used to interact with presence in a chat room: subscribing to presence events,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via {@link Room.presence}.
 */
export interface Presence {
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
   *
   * Note that this method will throw an error if presence events are not enabled in the room options.
   * Make sure to set `enableEvents: true` in your room options to use this feature.
   *
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   * @throws An {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Subscription;

  /**
   * Subscribe the given listener to all presence events.
   *
   * Note that this method will throw an error if presence events are not enabled in the room options.
   * Make sure to set `enableEvents: true` in your room options to use this feature.
   *
   * @param listener listener to subscribe
   * @throws An {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(listener?: PresenceListener): Subscription;

  /**
   * Unsubscribe all listeners from all presence events.
   */
  unsubscribeAll(): void;
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
    const userOnPresence = await this._channel.presence.get(params);

    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return userOnPresence.map((user) => ({
      clientId: user.clientId,
      action: user.action as PresenceEvents,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data: user.data?.userCustomData as PresenceData,
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
    const presenceEventToSend: AblyPresenceData = {
      userCustomData: data,
    };
    return this._channel.presence.enterClient(this._clientId, presenceEventToSend);
  }

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async update(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.update()`, { data });
    const presenceEventToSend: AblyPresenceData = {
      userCustomData: data,
    };
    return this._channel.presence.updateClient(this._clientId, presenceEventToSend);
  }

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    const presenceEventToSend: AblyPresenceData = {
      userCustomData: data,
    };
    return this._channel.presence.leaveClient(this._clientId, presenceEventToSend);
  }

  /**
   * Subscribe the given listener from the given list of events.
   *
   * Note that this method will throw an error if presence events are not enabled in the room options.
   * Make sure to set `enableEvents: true` in your room options to use this feature.
   *
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   * @throws {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Subscription;
  /**
   * Subscribe the given listener to all presence events.
   *
   * Note that this method will throw an error if presence events are not enabled in the room options.
   * Make sure to set `enableEvents: true` in your room options to use this feature.
   *
   * @param listener listener to subscribe
   * @throws {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(listener?: PresenceListener): Subscription;
  subscribe(
    listenerOrEvents?: PresenceEvents | PresenceEvents[] | PresenceListener,
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
      this._emitter.on(listenerOrEvents as PresenceEvents, wrapped);
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
   * Unsubscribe all listeners from all presence events.
   */
  unsubscribeAll(): void {
    this._logger.trace('Presence.unsubscribeAll()');
    this._emitter.off();
  }

  /**
   * Method to handle and emit presence events
   * @param member - PresenceMessage ably-js object
   * @returns void - Emits a transformed event to all subscribers, or upon failure,
   * the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  subscribeToEvents = (member: Ably.PresenceMessage) => {
    try {
      // Ably-js never emits the 'absent' event, so we can safely ignore it here.
      this._emitter.emit(member.action as PresenceEvents, {
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

  /**
   * Merges the channel options for the room with the ones required for presence.
   *
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(roomOptions: InternalRoomOptions): ChannelOptionsMerger {
    return (options) => {
      // User wants to receive presence events, so we don't need to do anything.
      if (roomOptions.presence.enableEvents) {
        return options;
      }

      const modes = options.modes ?? ['PUBLISH', 'SUBSCRIBE', 'PRESENCE'];
      return {
        ...options,
        modes,
      };
    };
  }
}
