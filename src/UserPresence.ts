import Ably, { PresenceMessage, Realtime } from 'ably';
import { PresenceEvents } from './events.js';
import EventEmitter, { EventListener, inspect, InvalidArgumentError } from './utils/EventEmitter.js';
import { isFunction } from './utils/is.js';
import { any, assert, intersection, object, optional, record, string } from 'superstruct';

/**
 * Interface for RoomStateEventsMap
 */
interface UserPresenceEventsMap {
  [PresenceEvents.enter]: PresenceEvent;
  [PresenceEvents.leave]: PresenceEvent;
  [PresenceEvents.update]: PresenceEvent;
}

/**
 * Schema for UserCustomData
 */
const userCustomDataSchema = optional(record(string(), any()));

/**
 * Type for UserCustomData
 */
interface UserCustomData {
  [key: string]: any;
}

/**
 * Schema for PresenceData
 */
const presenceDataSchema = intersection([
  object({
    userCustomData: userCustomDataSchema,
  }),
  record(string(), any()),
]);

/**
 * Type for PresenceData
 */
interface PresenceData {
  userCustomData: UserCustomData | undefined;
}

/**
 * Type for UserPresenceEvent
 */
interface PresenceEvent {
  type: PresenceEvents.enter | PresenceEvents.leave | PresenceEvents.update;
  clientId: string;
  timestamp: number;
  data: UserCustomData | undefined;
  currentUsers: {
    clientId: string;
    status: PresenceMessage['action'];
  }[];
}

/**
 * Type for UserPresenceListener
 */
export type UserPresenceListener = EventListener<UserPresenceEventsMap, keyof UserPresenceEventsMap>;

/**
 * Class for UserPresence
 */
export class UserPresence extends EventEmitter<UserPresenceEventsMap> {
  private readonly roomId: string;
  private readonly channel: Ably.RealtimeChannel;
  private readonly clientId: string;

  /**
   * Constructor for UserPresence
   * @param {string} roomId - The room ID, should be a unique identifier for the room
   * @param {Ably.Realtime} realtime - The Ably Realtime instance, used to interact with the Ably Realtime API
   * @param {string} clientId - The client ID, attached to presences messages as an identifier of the sender. Please note, you can have multiple connections using the same clientId on the same channel.
   */
  constructor(roomId: string, realtime: Realtime, clientId: string) {
    super();
    this.roomId = roomId;
    this.channel = realtime.channels.get(this.realtimeChannelName);
    this.clientId = clientId;
  }

  /**
   * Getter for realtimeChannelName
   * @returns {string} The realtime channel name
   */
  get realtimeChannelName(): string {
    return `${this.roomId}::$chat::$chatMessages`;
  }

  /**
   * Method to get list of the current online users and returns the status of each state user.
   * @returns {Promise<{clientId: string; status: 'absent' | 'present' | 'enter' | 'leave' | 'update'}[]>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async get(): Promise<
    {
      clientId: string;
      status: PresenceMessage['action'];
    }[]
  > {
    try {
      const presenceSet: PresenceMessage[] = await this.channel.presence.get();
      // Map the presence set to the required format and remove duplicate entries of the same client
      return presenceSet.reduce((acc: { clientId: string; status: PresenceMessage['action'] }[], member) => {
        if (acc.some((existingMember) => existingMember.clientId === member.clientId)) {
          return acc;
        }
        return [
          ...acc,
          {
            clientId: member.clientId,
            status: member.action,
          },
        ];
      }, []);
    } catch (error) {
      throw new Ably.ErrorInfo('unable to get current presence members', 50001, 500, (error as Error).message);
    }
  }

  /**
   * Method to check if user with supplied clientId is online
   * @returns {Promise<{boolean}>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async userIsPresent(clientId: string): Promise<boolean> {
    try {
      const presenceSet = await this.channel.presence.get({ clientId: clientId });
      return presenceSet.length > 0;
    } catch (error) {
      throw new Ably.ErrorInfo('unable to get current presence members', 50001, 500, (error as Error).message);
    }
  }

  /**
   * Method to join room presence, will emit an enter event to all subscribers
   * @param {UserCustomData} data - The user data, a JSON serializable object that can contain any data
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async enter(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };
    try {
      assert(presenceEventToSend, presenceDataSchema);
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to join presence, invalid presence packet',
        40013,
        400,
        (error as Error).message,
      );
    }
    try {
      await this.channel.presence.enterClient(this.clientId, JSON.stringify(presenceEventToSend));
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to join presence, failed to enter channel',
        50001,
        500,
        (error as Error).message,
      );
    }
  }

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param {UserCustomData} data - The user data, a JSON serializable object that can contain any data
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async update(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };
    try {
      assert(presenceEventToSend, presenceDataSchema);
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to send presence update, invalid presence packet',
        40013,
        400,
        (error as Error).message,
      );
    }

    try {
      await this.channel.presence.updateClient(this.clientId, JSON.stringify(presenceEventToSend));
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to send presence update, failed to publish to channel',
        50001,
        500,
        (error as Error).message,
      );
    }
  }

  /**
   * Method to leave room presence, will emit a leave event to all subscribers
   * @param {UserCustomData} data - The user data, a JSON serializable object that can contain any data
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async leave(data?: UserCustomData): Promise<void> {
    const presenceEventToSend: PresenceData = {
      userCustomData: data,
    };

    try {
      assert(presenceEventToSend, presenceDataSchema);
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to leave presence, invalid presence packet',
        40013,
        400,
        (error as Error).message,
      );
    }
    try {
      await this.channel.presence.leaveClient(this.clientId, JSON.stringify(presenceEventToSend));
    } catch (error) {
      throw new Ably.ErrorInfo(
        'unable to leave presence, failed to leave channel',
        50001,
        500,
        (error as Error).message,
      );
    }
  }

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update'} single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  subscribe<K extends keyof UserPresenceEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<UserPresenceEventsMap, K>,
  ): void;
  /**
   * Subscribe to all presence events in this chat room.
   * @param listener callback that will be called
   */
  subscribe(listener?: EventListener<UserPresenceEventsMap, keyof UserPresenceEventsMap>): void;
  async subscribe<K extends keyof UserPresenceEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<UserPresenceEventsMap, K>,
    listener?: EventListener<UserPresenceEventsMap, K>,
  ) {
    try {
      super.on(listenerOrEvents, listener);
      if (isFunction(listenerOrEvents)) {
        // Subscribe to all events if only a listener is provided
        return this.subscribeToEvents(['leave', 'enter', 'update']);
      }
      // Subscribe to the provided event or events
      const eventOrEvents = listenerOrEvents as K | K[];
      const eventList = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
      return this.subscribeToEvents(eventList);
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'UserPresence.subscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents {'enter' | 'leave' | 'update'} single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe<K extends keyof UserPresenceEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<UserPresenceEventsMap, K>,
  ): void;

  /**
   * Unsubscribe the given listener from all presence events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: EventListener<UserPresenceEventsMap, keyof UserPresenceEventsMap>): void;
  unsubscribe<K extends keyof UserPresenceEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<UserPresenceEventsMap, K>,
    listener?: EventListener<UserPresenceEventsMap, K>,
  ) {
    try {
      super.off(listenerOrEvents, listener);
      if (isFunction(listenerOrEvents)) {
        // Subscribe to all events if only a listener is provided
        return this.unsubscribeToEvents(['leave', 'enter', 'update']);
      }
      // Subscribe to the provided event or events
      const eventOrEvents = listenerOrEvents as K | K[];
      const eventList = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
      return this.unsubscribeToEvents(eventList);
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'UserPresence.unsubscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }

  /**
   * Method to subscribe to presence events.
   * @param {('leave' | 'enter' | 'update')[]} eventNames - The list of event names to subscribe too.
   */
  async subscribeToEvents(eventNames: ('leave' | 'enter' | 'update')[]) {
    for (const eventName of eventNames) {
      await this.channel.presence.subscribe(eventName, async (member) => {
        try {
          const users = await this.get();
          const parsedData = JSON.parse(member.data);
          assert(parsedData, presenceDataSchema);
          this.emit(PresenceEvents[eventName], {
            type: PresenceEvents[eventName],
            clientId: member.clientId,
            timestamp: member.timestamp,
            data: parsedData.userCustomData,
            currentUsers: users,
          });
          console.debug(`Received ${eventName} presence event`);
        } catch (error) {
          throw new Ably.ErrorInfo(
            `unable to handle ${eventName} presence event`,
            50001,
            500,
            (error as Error).message,
          );
        }
      });
    }
  }

  /**
   * Method to unsubscribe from presence events.
   * @param {('leave' | 'enter' | 'update')[]} eventNames - The list of event names to unsubscribe from.
   */
  private async unsubscribeToEvents(eventNames: ('leave' | 'enter' | 'update')[]) {
    for (const eventName of eventNames) {
      await this.channel.presence.unsubscribe(eventName);
      console.debug(`Unsubscribed from ${eventName} presence events`);
    }
  }
}
