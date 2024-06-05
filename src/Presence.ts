import * as Ably from 'ably';
import { PresenceEvents } from './events.js';
import EventEmitter, { EventListener } from './utils/EventEmitter.js';
import { SubscriptionManager } from './SubscriptionManager.js';

/**
 * Interface for PresenceEventsMap
 */
interface PresenceEventsMap {
  [PresenceEvents.enter]: PresenceEvent;
  [PresenceEvents.leave]: PresenceEvent;
  [PresenceEvents.update]: PresenceEvent;
  [PresenceEvents.present]: PresenceEvent;
  [PresenceEvents.absent]: PresenceEvent;
}

/**
 * Type for UserCustomData
 */
interface UserCustomData {
  [key: string]: any;
}

/**
 * Type for PresenceData
 */
export interface PresenceData {
  userCustomData: UserCustomData | undefined;

  [key: string]: any;
}

/**
 * Type for PresenceEvent
 */
export interface PresenceEvent {
  type:
    | PresenceEvents.enter
    | PresenceEvents.leave
    | PresenceEvents.update
    | PresenceEvents.present
    | PresenceEvents.absent;
  clientId: string;
  timestamp: number;
  data: UserCustomData | undefined;
}

/**
 * Type for PresenceMember
 */
export interface PresenceMember {
  clientId: string;
  data: UserCustomData | undefined;
  action: 'absent' | 'present' | 'enter' | 'leave' | 'update';
  extras: any;
  id: string;
  timestamp: number;
}

/**
 * Type for PresenceListener
 */
export type PresenceListener = EventListener<PresenceEventsMap, keyof PresenceEventsMap>;

/**
 * This class is used to interact with presence in a chat room including subscribing,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via room.presence.
 */
export class Presence extends EventEmitter<PresenceEventsMap> {
  private readonly subscriptionManager: SubscriptionManager;
  private readonly clientId: string;

  /**
   * Constructor for Presence
   * @param subscriptionManager - Internal class that wraps a Realtime channel and ensures that when all subscriptions
   * (messages and presence) are removed, the channel is implicitly detached.
   * @param {string} clientId - The client ID, attached to presences messages as an identifier of the sender.
   * A channel can have multiple connections using the same clientId.
   */
  constructor(subscriptionManager: SubscriptionManager, clientId: string) {
    super();
    this.subscriptionManager = subscriptionManager;
    this.clientId = clientId;
  }

  /**
   * Method to get list of the current online users and returns the latest presence messages associated to it.
   * @returns {Promise<PresenceMessage[]>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    const userOnPresence = await this.subscriptionManager.channel.presence.get(params);
    return userOnPresence.map((user) => ({
      clientId: user.clientId,
      action: user.action,
      data: user.data ? (JSON.parse(user.data).userCustomData as UserCustomData) : undefined,
      timestamp: user.timestamp,
      extras: user.extras,
      id: user.id,
    }));
  }

  /**
   * Method to check if user with supplied clientId is online
   * @returns {Promise<{boolean}>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async userIsPresent(clientId: string): Promise<boolean> {
    const presenceSet = await this.subscriptionManager.channel.presence.get({ clientId: clientId });
    return presenceSet.length > 0;
  }

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param {UserCustomData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async enter(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };
    return this.subscriptionManager.presenceEnterClient(this.clientId, JSON.stringify(presenceEventToSend));
  }

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {UserCustomData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async update(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };
    return this.subscriptionManager.presenceUpdateClient(this.clientId, JSON.stringify(presenceEventToSend));
  }

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {UserCustomData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async leave(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };
    return this.subscriptionManager.presenceLeaveClient(this.clientId, JSON.stringify(presenceEventToSend));
  }

  /**
   * Subscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'absent' | 'present'} single event name or array of events to subscribe to
   * @param listener listener to subscribe
   */
  subscribe<K extends keyof PresenceEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<PresenceEventsMap, K>,
  ): Promise<void>;
  /**
   * Subscribe the given listener to all presence events.
   * @param listener listener to subscribe
   */
  subscribe(listener?: EventListener<PresenceEventsMap, keyof PresenceEventsMap>): Promise<void>;
  async subscribe<K extends keyof PresenceEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<PresenceEventsMap, K>,
    listener?: EventListener<PresenceEventsMap, K>,
  ): Promise<void> {
    if (!listenerOrEvents && !listener) {
      throw new Ably.ErrorInfo('could not subscribe listener: invalid arguments', 40000, 400);
    }
    const hasListeners = this.hasListeners();
    if (!listener) {
      this.on(listenerOrEvents);
    } else {
      this.on(listenerOrEvents, listener);
    }
    if (!hasListeners) {
      return this.subscriptionManager.presenceSubscribe(this.subscribeToEvents);
    }
    return this.subscriptionManager.channel.attach().then(() => {});
  }

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update' | 'present' | 'absent'} single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe<K extends keyof PresenceEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<PresenceEventsMap, K>,
  ): Promise<void>;

  /**
   * Unsubscribe the given listener from all presence events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: EventListener<PresenceEventsMap, keyof PresenceEventsMap>): Promise<void>;
  async unsubscribe<K extends keyof PresenceEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<PresenceEventsMap, K>,
    listener?: EventListener<PresenceEventsMap, K>,
  ): Promise<void> {
    if (!listenerOrEvents && !listener) {
      throw new Ably.ErrorInfo('could not unsubscribe listener: invalid arguments', 40000, 400);
    }
    if (!listener) {
      this.off(listenerOrEvents);
    } else {
      this.off(listenerOrEvents, listener);
    }
    if (!this.hasListeners()) {
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
      this.emit(PresenceEvents[member.action], {
        type: PresenceEvents[member.action],
        clientId: member.clientId,
        timestamp: member.timestamp,
        data: parsedData.userCustomData,
      });
    } catch (error) {
      throw new Ably.ErrorInfo(
        `unable to handle ${member.action} presence event: not a valid presence event`,
        50000,
        500,
        (error as Error).message,
      );
    }
  };
}
