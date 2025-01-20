import * as Ably from 'ably';
import { RealtimePresenceParams } from 'ably';
import { dequal } from 'dequal';

import { messagesChannelName } from './channel.js';
import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { UserStatusEvents } from './events.js';
import { Logger } from './logger.js';
import { ChatPresenceData, PresenceDataContribution } from './presence-data-manager.js';
import { addListenerToChannelPresenceWithoutAttach } from './realtime-extensions.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { RoomOptions, TypingOptions } from './room-options.js';
import EventEmitter from './utils/event-emitter.js';

const PRESENCE_GET_RETRY_INTERVAL_MS = 1500; // base retry interval, we double it each time
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 30000; // max retry interval
const PRESENCE_GET_MAX_RETRIES = 5; // max num of retries

// /**
//  * Interface for PresenceEventsMap
//  */
// interface PresenceEventsMap {
//   [PresenceEvents.Enter]: PresenceEvent;
//   [PresenceEvents.Leave]: PresenceEvent;
//   [PresenceEvents.Update]: PresenceEvent;
//   [PresenceEvents.Present]: PresenceEvent;
// }

interface UserStatusEventsMap {
  [UserStatusEvents.OnlineStatusChange]: UserStatusEvent;
  [UserStatusEvents.TypingStatusChange]: UserStatusEvent;
}

/**
 * Type for PresenceData. Any JSON serializable data type.
 */
export type PresenceData = Record<string, unknown>;

interface PresenceMessage extends Omit<Ably.PresenceMessage, 'data'> {
  data: AblyPresenceData;
}

/**
 * Type for AblyPresenceData
 */
interface AblyPresenceData {
  userCustomData: PresenceData | undefined;
  isTyping: boolean;
  isOnline: boolean;

  [key: string]: unknown;
}

export interface UserStatusEvent {
  get currentlyTyping(): Set<string>;

  get onlineStatuses(): OnlineMember[] | undefined;
}

// /**
//  * Type for OnlineStatusEvent
//  */
// export interface OnlineStatusEvent {
//   /**
//    * The clientId of the client that triggered the presence event.
//    */
//   clientId: string;
//
//   /**
//    * The timestamp of the presence event.
//    */
//   timestamp: number;
//
//   /**
//    * The online status of the presence event.
//    */
//   isOnline: boolean;
//
//   /**
//    * The typing status of the presence event.
//    */
//   isTyping: boolean;
//
//   /**
//    * The data associated with the presence event.
//    */
//   data: PresenceData;
// }

export interface OnlineMember {
  /**
   * The clientId of the presence member.
   */
  clientId: string;

  /**
   * The data associated with the presence member.
   */
  data: PresenceData | undefined;

  /**
   * The online status of the presence member.
   */
  isOnline: boolean;

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
export type OnlineStatusListener = (event: UserStatusEvent) => void;

/**
 * A listener which listens for typing events.
 * @param event The typing event.
 */
export type TypingListener = (event: UserStatusEvent) => void;

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

  setOnline(): Promise<void>;

  /**
   * Set a user to offline. If the user is already offline, it will be treated as a no-op.
   */
  setOffline(): Promise<void>;

  /**
   * Allow the user to set their presence data when they are online.
   * If the user is already online, it will update the presence data.
   * @param data
   */
  setOnlineWithData(data?: PresenceData): Promise<void>;

  /**
   * Allow the user to set their presence data when they are offline.
   * If the user is already offline, it will no-op.
   * @param data
   */
  setOfflineWithData(data?: PresenceData): Promise<void>;

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
   * Get the underlying Ably realtime channel used for presence in this chat room.
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * @inheritDoc
 */
export class DefaultPresence
  extends EventEmitter<UserStatusEventsMap>
  implements Presence, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
  private readonly _presenceDataContribution: PresenceDataContribution;
  private _clientsPresenceData: AblyPresenceData;

  // Timeout for typing
  private readonly _typingTimeoutMs: number;
  private _timerId: ReturnType<typeof setTimeout> | undefined;

  private _receivedEventNumber = 0;
  private _triggeredEventNumber = 0;
  private _currentlyTyping: Set<string> = new Set<string>();
  private _currentlyOnline: OnlineMember[] = [];
  private _retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private _numRetries = 0;

  /**
   * Constructs a new `DefaultPresence` instance.
   * @param roomId The unique identifier of the room.
   * @param channelManager The channel manager to use for creating the presence channel.
   * @param clientId The client ID, attached to presences messages as an identifier of the sender.
   * A channel can have multiple connections using the same clientId.
   * @param options
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    channelManager: ChannelManager,
    presenceDataContribution: PresenceDataContribution,
    clientId: string,
    logger: Logger,
  ) {
  constructor(
    roomId: string,
    channelManager: ChannelManager,
    clientId: string,
    options: TypingOptions,
    logger: Logger,
  ) {
    super();

    this._channel = this._makeChannel(roomId, channelManager);
    this._clientId = clientId;
    this._logger = logger;
    this._presenceDataContribution = presenceDataContribution;
    // Timeout for typing
    // TODO - What do we want the api to be if a user doesn't give typing?
    this._typingTimeoutMs = options.timeoutMs;
    this._logger = logger;

    // Initialize the presence data
    this._clientsPresenceData = {
      userCustomData: {},
      isTyping: false,
      isOnline: false,
    };

    // TODO: Listen to status changes and update the is present and data accordingly
  }

  /**
   * Creates the realtime channel for presence.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get(DefaultPresence.channelName(roomId));

    addListenerToChannelPresenceWithoutAttach({
      listener: this._internalSubscribeToEvents.bind(this),
      channel: channel,
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
  async startTyping(): Promise<void> {
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
    return this._updatePresenceWithPayload({
      ...this._clientsPresenceData,
      isTyping: true,
    });
  }

  /**
   * @inheritDoc
   */
  async stopTyping(): Promise<void> {
    this._logger.trace(`DefaultTyping.stop();`);
    // Clear the timer and emit typingStopped event
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = undefined;
    }

    if (this._clientsPresenceData.isOnline) {
      this._logger.debug(`DefaultTyping.stop(); client is still online, so update the typing status only`);
      return this._updatePresenceWithPayload({
        ...this._clientsPresenceData,
        isTyping: false,
      });
    }

    // If the user is offline, leave the presence
    return this._leavePresenceWithPayload({
      ...this._clientsPresenceData,
      isTyping: false,
    });
  }

  /**
   * @inheritDoc
   */
  async getOnlineStatuses(params?: Ably.RealtimePresenceParams): Promise<OnlineMember[]> {
    this._logger.trace('Presence.get()', { params });
    const userOnPresence: PresenceMessage[] = await this._channel.presence.get(params);
    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return this._presenceMessageToOnlineMembers(userOnPresence);
  }

  private _presenceMessageToOnlineMembers(presence: PresenceMessage[]): OnlineMember[] {
    return presence.map(
      (user) =>
        ({
          clientId: user.clientId,
          data: user.data.userCustomData,
          isOnline: user.data.isOnline,
          updatedAt: user.timestamp,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          extras: user.extras,
        }) as OnlineMember,
    );
  }

  /**
   * @inheritDoc
   */
  async isUserPresent(clientId: string): Promise<boolean> {
    const presenceSet: PresenceMessage[] = await this._channel.presence.get({ clientId: clientId });
    return presenceSet.some((member) => member.clientId === clientId && member.data.isOnline);
  }

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async enter(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.enter()`, { data });

    // TODO: We can now collapse enter, update and leave into two methods, something like
    // Set - indicates you're online, so "present" in the traditional sense
    // Unset - indicates you're offline, so "absent" in the traditional sense
    // "Online data" or something like that
    // For brevity in this POC, we'll keep the three methods separate
    await this._presenceDataContribution.set((current: ChatPresenceData) => ({
      ...current,
      userCustomData: data,
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
      userCustomData: data,
    }));
  }

  /**
   * Allow the user to set their presence data when they are online.
   * If the user is already online, it will update the presence data.
   * @param data
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    await this._presenceDataContribution.remove((current: ChatPresenceData) => ({
      ...current,
  async setOnlineWithData(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.setOnlineWithData()`, { data });
    const presenceEventToSend: AblyPresenceData = {
      ...this._clientsPresenceData,
      userCustomData: data,
    }));
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
   * Unsubscribe all listeners from all events.
   */
  unsubscribeAll(): void {
    this._logger.trace('Presence.unsubscribeAll()');
    this.off();
  }

  /**
   * Subscribe to internal events. This will listen to presence events and convert them into associated typing events,
   * while also updating the currentlyTypingClientIds set.
   */
  private readonly _internalSubscribeToEvents = (member: Ably.PresenceMessage) => {
    if (!member.clientId) {
      this._logger.error(`unable to handle typing event; no clientId`, { member });
      return;
    }

    this._receivedEventNumber += 1;

    // received a real event, cancelling retry timeout
    if (this._retryTimeout) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = undefined;
      this._numRetries = 0;
    }

    this._getAndEmit(this._receivedEventNumber);
  };

  private _getAndEmit(eventNum: number) {
    const typers: Set<string> = new Set<string>();
    const onlineMembers: OnlineMember[] = [];

    // Fetch presence messages and process them
    this.channel.presence
      .get()
      .then((members) => {
        const presenceMessages = members as PresenceMessage[];
        for (const msg of presenceMessages) {
          if (msg.data.isTyping) {
            typers.add(msg.clientId);
          }
          if (msg.data.isOnline) {
            onlineMembers.push(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this._presenceMessageToOnlineMembers([msg])[0]!,
            );
          }
        }
      })
      .then(() => {
        // successful fetch, remove retry timeout if one exists
        if (this._retryTimeout) {
          clearTimeout(this._retryTimeout);
          this._retryTimeout = undefined;
          this._numRetries = 0;
        }
        // if we've seen the result of a newer promise, do nothing
        if (this._triggeredEventNumber >= eventNum) {
          return;
        }
        this._triggeredEventNumber = eventNum;

        // if current typers have changed, emit an event for them
        if (!dequal(this._currentlyTyping, typers)) {
          this.emit(UserStatusEvents.TypingStatusChange, {
            currentlyTyping: typers,
            onlineStatuses: undefined,
          });
          this._currentlyTyping = typers;
        }

        if (!dequal(this._currentlyOnline, onlineMembers)) {
          this.emit(UserStatusEvents.OnlineStatusChange, {
            currentlyTyping: new Set<string>(),
            onlineStatuses: onlineMembers,
          });
          this._currentlyOnline = onlineMembers;
        }
      })
      .catch((error: unknown) => {
        const willReattempt = this._numRetries < PRESENCE_GET_MAX_RETRIES;
        this._logger.error(`Error fetching currently presence`, {
          error,
          willReattempt: willReattempt,
        });
        if (!willReattempt) {
          return;
        }
        // already another timeout, do nothing
        if (this._retryTimeout) {
          return;
        }

        const waitBeforeRetry = Math.min(
          PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
          PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, this._numRetries),
        );

        this._numRetries += 1;

        this._retryTimeout = setTimeout(() => {
          this._retryTimeout = undefined;
          this._receivedEventNumber++;
          this._getAndEmit(this._receivedEventNumber);
        }, waitBeforeRetry);
      });
  }

  get timeoutMs(): number {
    return this._typingTimeoutMs;
  }
  // subscribeToEvents = (member: Ably.PresenceMessage) => {
  //   // TODO: Without the line below, things will break if someone's not in presence but is typing
  //   // The way we solve this? We'd have to have a standalone "present set" just for online users aside
  //   // from ably-js, to allow us to decide if someone is "truly leaving". It feels like we're gonna be reinventing the wheel here.
  //   // if (!(member.data as AblyPresenceData | undefined)?.userCustomData) {
  //   //   return;
  //   // }
  //
  //   try {
  //     // Ably-js never emits the 'absent' event, so we can safely ignore it here.
  //     this.emit(member.action as PresenceEvents, {
  //       action: member.action as PresenceEvents,
  //       clientId: member.clientId,
  //       timestamp: member.timestamp,
  //       // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  //       data: member.data?.userCustomData as PresenceData,
  //     });
  //   } catch (error) {
  //     this._logger.error(`unable to handle presence event: not a valid presence event`, { action: member.action });
  //     throw new Ably.ErrorInfo(
  //       `unable to handle ${member.action} presence event: not a valid presence event`,
  //       50000,
  //       500,
  //       (error as Error).message,
  //     );
  //   }
  // };

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
