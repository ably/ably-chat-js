import * as Ably from 'ably';

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
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
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

    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return userOnPresence
      .filter((user) => (user.data as AblyPresenceData | undefined)?.userCustomData)
      .map((user) => ({
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
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    await this._presenceDataContribution.remove((current: ChatPresenceData) => ({
      ...current,
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
    // TODO: Without the line below, things will break if someone's not in presence but is typing
    // The way we solve this? We'd have to have a standalone "present set" just for online users aside
    // from ably-js, to allow us to decide if someone is "truly leaving". It feels like we're gonna be reinventing the wheel here.
    // if (!(member.data as AblyPresenceData | undefined)?.userCustomData) {
    //   return;
    // }

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
