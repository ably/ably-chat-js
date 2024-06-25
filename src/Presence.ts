import * as Ably from 'ably';

import { PresenceEvents } from './events.js';
import { Logger } from './logger.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Interface for PresenceEventsMap
 */
interface PresenceEventsMap {
  [PresenceEvents.enter]: PresenceEvent;
  [PresenceEvents.leave]: PresenceEvent;
  [PresenceEvents.update]: PresenceEvent;
  [PresenceEvents.present]: PresenceEvent;
}

/**
 * Type for PresenceData
 */
export type PresenceData = {
  [key: string]: unknown;
};

/**
 * Type for AblyPresenceData
 */
interface AblyPresenceData {
  userCustomData: PresenceData | undefined;

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
  data: PresenceData | undefined;
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
  data: PresenceData | undefined;

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
   * The Ably message id of the associated presence message.
   */
  id: string;

  /**
   * The timestamp of the presence message.
   */
  timestamp: number;
}

/**
 * Type for PresenceListener
 * @param event The presence event that was received.
 */
export type PresenceListener = (event: PresenceEvent) => void;

/**
 * This interface is used to interact with presence in a chat room including subscribing,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via room.presence.
 */
export interface Presence {
  /**
   * Method to get list of the current online users and returns the latest presence messages associated to it.
   * @param {Ably.RealtimePresenceParams} params - Parameters that control how the presence set is retrieved.
   * @returns {Promise<PresenceMessage[]>} or upon failure, the promise will be rejected with an [[Ably.ErrorInfo]] object which explains the error.
   */
  get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;

  /**
   * Method to check if user with supplied clientId is online
   * @param {string} clientId - The client ID to check if it is present in the room.
   * @returns {Promise<{boolean}>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  userIsPresent(clientId: string): Promise<boolean>;

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  enter(data?: PresenceData): Promise<void>;

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  update(data?: PresenceData): Promise<void>;

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  leave(data?: PresenceData): Promise<void>;

  /**
   * Subscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   */
  subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Promise<void>;

  /**
   * Subscribe the given listener to all presence events.
   * @param listener listener to subscribe
   */
  subscribe(listener?: PresenceListener): Promise<void>;

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Promise<void>;

  /**
   * Unsubscribe the given listener from all presence events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: PresenceListener): Promise<void>;

  /**
   * Get the underlying Ably realtime channel used for presence in this chat room.
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * @inheritDoc
 */
export class DefaultPresence extends EventEmitter<PresenceEventsMap> implements Presence {
  private readonly subscriptionManager: SubscriptionManager;
  private readonly clientId: string;
  private readonly _logger: Logger;

  /**
   * Constructor for Presence
   * @param subscriptionManager - Internal class that wraps a Realtime channel and ensures that when all subscriptions
   * (messages and presence) are removed, the channel is implicitly detached.
   * @param {string} clientId - The client ID, attached to presences messages as an identifier of the sender.
   * A channel can have multiple connections using the same clientId.
   */
  constructor(subscriptionManager: SubscriptionManager, clientId: string, logger: Logger) {
    super();
    this.subscriptionManager = subscriptionManager;
    this.clientId = clientId;
    this._logger = logger;
  }

  /**
   * Get the underlying Ably realtime channel used for presence in this chat room.
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel {
    return this.subscriptionManager.channel;
  }

  /**
   * @inheritDoc
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    this._logger.trace('Presence.get()', { params });
    const userOnPresence = await this.subscriptionManager.channel.presence.get(params);

    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return userOnPresence.map((user) => ({
      clientId: user.clientId,
      action: user.action as PresenceEvents,
      data: user.data ? (JSON.parse(user.data).userCustomData as PresenceData) : undefined,
      timestamp: user.timestamp,
      extras: user.extras,
      id: user.id,
    }));
  }

  /**
   * @inheritDoc
   */
  async userIsPresent(clientId: string): Promise<boolean> {
    const presenceSet = await this.subscriptionManager.channel.presence.get({ clientId: clientId });
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
    return this.subscriptionManager.presenceEnterClient(this.clientId, JSON.stringify(presenceEventToSend));
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
    return this.subscriptionManager.presenceUpdateClient(this.clientId, JSON.stringify(presenceEventToSend));
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
    return this.subscriptionManager.presenceLeaveClient(this.clientId, JSON.stringify(presenceEventToSend));
  }

  /**
   * Subscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   */
  subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Promise<void>;
  /**
   * Subscribe the given listener to all presence events.
   * @param listener listener to subscribe
   */
  subscribe(listener?: PresenceListener): Promise<void>;
  async subscribe(
    listenerOrEvents?: PresenceEvents | PresenceEvents[] | PresenceListener,
    listener?: PresenceListener,
  ): Promise<void> {
    this._logger.trace('Presence.subscribe(); listenerOrEvents', { listenerOrEvents });
    if (!listenerOrEvents && !listener) {
      this._logger.error('could not subscribe to presence; invalid arguments');
      throw new Ably.ErrorInfo('could not subscribe listener: invalid arguments', 40000, 400);
    }
    const hasListeners = this.hasListeners();
    if (!listener) {
      this.on(listenerOrEvents);
    } else {
      this.on(listenerOrEvents, listener);
    }
    if (!hasListeners) {
      this._logger.debug('Presence.subscribe(); adding internal listener');
      return this.subscriptionManager.presenceSubscribe(this.subscribeToEvents);
    }
    return this.subscriptionManager.channel.attach().then(() => {});
  }

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present'} single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): Promise<void>;

  /**
   * Unsubscribe the given listener from all presence events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: PresenceListener): Promise<void>;
  async unsubscribe(
    listenerOrEvents?: PresenceEvents | PresenceEvents[] | PresenceListener,
    listener?: PresenceListener,
  ): Promise<void> {
    this._logger.trace('Presence.unsubscribe(); listenerOrEvents', { listenerOrEvents });
    if (!listenerOrEvents && !listener) {
      this._logger.error('could not unsubscribe from presence; invalid arguments');
      throw new Ably.ErrorInfo('could not unsubscribe listener: invalid arguments', 40000, 400);
    }
    if (!listener) {
      this.off(listenerOrEvents);
    } else {
      this.off(listenerOrEvents, listener);
    }
    if (!this.hasListeners()) {
      this._logger.debug('Presence.unsubscribe(); removing internal listener');
      return this.subscriptionManager.presenceUnsubscribe(this.subscribeToEvents);
    }
    return Promise.resolve();
  }

  /**
   * Method to handle and emit presence events
   * @param member - PresenceMessage ably-js object
   * @returns void - Emits a transformed event to all subscribers, or upon failure,
   * the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  subscribeToEvents = (member: Ably.PresenceMessage) => {
    try {
      const parsedData = JSON.parse(member.data);

      // ably-js never emits the 'absent' event, so we can safely ignore it here.
      this.emit(PresenceEvents[member.action as PresenceEvents], {
        action: PresenceEvents[member.action as PresenceEvents],
        clientId: member.clientId,
        timestamp: member.timestamp,
        data: parsedData.userCustomData,
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
}
