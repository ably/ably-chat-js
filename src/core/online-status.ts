import * as Ably from 'ably';
import { dequal } from 'dequal';

import { OnlineStatusEvents } from './events.js';
import { Logger } from './logger.js';
import {
  ChatPresenceData,
  ChatPresenceMessage,
  PresenceDataContribution,
  PresenceManager,
} from './presence-data-manager.js';
import { HandlesUserStatusChange } from './user-status.js';
import EventEmitter from './utils/event-emitter.js';

/**
 * Event names and their respective payloads for events emitted by the `OnlineStatus` feature.
 */
interface OnlineStatusEventsMap {
  [OnlineStatusEvents.OnlineStatusChange]: OnlineStatusEventPayload;
}

/**
 * Type for onlineStatusData. Any JSON serializable data type.
 */
export type OnlineStatusData = unknown;

/**
 * Defines the payload for {@link OnlineStatusEvents.OnlineStatusChange}
 *
 * @property onlineMembers - A list of {@link OnlineMember} objects representing users who are currently online.
 */
export interface OnlineStatusEventPayload {
  get onlineMembers(): OnlineMember[];
}

/**
 * Represents an online user in the chat room.
 *
 * @property clientId - The unique identifier for the online client.
 * @property data - The associated {@link OnlineStatusData} for the client.
 * @property isOnline - A boolean flag indicating the users online status.
 * @property extras - Additional data provided alongside the user's information.
 * @property updatedAt - The last updated timestamp for the client's status.
 */
export interface OnlineMember {
  clientId: string;
  data: OnlineStatusData;
  isOnline: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extras: any;
  updatedAt: number;
}

/**
 * Defines the type for a listener which handles {@link OnlineStatusEvents}.
 *
 * @param event - The {@link OnlineStatusEventPayload} received for an online status event.
 */
export type OnlineStatusListener = (event: OnlineStatusEventPayload) => void;

/**
 * A response object that allows you to control an online status subscription.
 */
export interface OnlineStatusSubscriptionResponse {
  /**
   * Unsubscribe the listener registered with {@link OnlineStatus.subscribe} from all online status events.
   */
  unsubscribe: () => void;
}

/**
 * This interface is used to interact with a user's online status in a chat room: subscribing to events,
 * fetching online users, or updating the user's status (online or offline).
 *
 * Obtain an instance via {@link Room.userStatus.onlineStatus}.
 */
export interface OnlineStatus {
  /**
   * Fetches the current list of online users and their associated status data.
   *
   * @param params - An {@link Ably.RealtimePresenceParams} object used to control how the online presence set is retrieved.
   * @returns A `Promise` which resolves with an array of {@link OnlineMember} objects representing the online users.
   * If an error occurs, the promise will reject with an {@link Ably.ErrorInfo} object.
   */
  get(params?: Ably.RealtimePresenceParams): Promise<OnlineMember[]>;

  /**
   * Checks if a user, specified by the `clientId`, is currently online.
   *
   * @param clientId - The identifier for the user whose online status is being verified.
   * @returns A `promise` that resolves to `true` or `false` based on whether the user is online.
   * If an error occurs, the promise will reject with an {@link Ably.ErrorInfo} object.
   */
  isUserOnline(clientId: string): Promise<boolean>;

  /**
   * Marks the current user as online and updates optional associated status data.
   * If the user is already online, this will update the user's data.
   * @param data - An optional {@link OnlineStatusData} to to associate with the user.
   * @returns A `promise` that resolves on completion. If an error occurs, the promise will reject with an {@link Ably.ErrorInfo} that explains the failure.
   */
  setOnlineStatus(data?: OnlineStatusData): Promise<void>;

  /**
   * Marks the current user as offline, optionally attaching extra data to this status update.
   * If the user is already offline, this will be a no-op.
   * @param data - An optional {@link OnlineStatusData} to associate with the user.
   * @returns A `promise` that resolves on completion. If an error occurs, the promise will reject with an {@link Ably.ErrorInfo} that explains the failure.
   */
  setOfflineStatus(data?: OnlineStatusData): Promise<void>;

  /**
   * Subscribe a listener to all online status events.
   * @param listener Listener to respond to the events.
   */
  subscribe(listener?: OnlineStatusListener): OnlineStatusSubscriptionResponse;

  /**
   * Unsubscribe all listeners from all events.
   */
  unsubscribeAll(): void;
}

/**
 * @inheritDoc
 */
export class DefaultOnlineStatus
  extends EventEmitter<OnlineStatusEventsMap>
  implements OnlineStatus, HandlesUserStatusChange
{
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private readonly _presenceManager: PresenceManager;
  private readonly _presenceDataContribution: PresenceDataContribution;

  /**
   * Constructs a new instance of {@link DefaultOnlineStatus}.
   * @param roomId The unique identifier of the room.
   * @param presenceManager
   * @param clientId The client ID used as an identifier for updates.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, presenceManager: PresenceManager, clientId: string, logger: Logger) {
    super();
    this._clientId = clientId;
    this._logger = logger;
    this._presenceManager = presenceManager;
    this._logger = logger;

    this._presenceDataContribution = this._presenceManager.newContributor();
  }

  /**
   * @inheritDoc
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<OnlineMember[]> {
    this._logger.trace('OnlineStatus.get()', { params });
    const { latest } = await this._presenceManager.getPresenceSet();
    return latest.map((member) => this._presenceMessageToOnlineMembers(member));
  }

  /**
   * Transforms a message containing user status data into an {@link OnlineMember} object.
   * @param msg - The message containing the chat presence data.
   * @returns An {@link OnlineMember} object representing the user and their status.
   */
  private _presenceMessageToOnlineMembers(msg: ChatPresenceMessage): OnlineMember {
    return {
      clientId: msg.clientId,
      data: msg.data.userCustomData,
      isOnline: msg.data.isOnline,
      updatedAt: msg.timestamp,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extras: msg.extras,
    } as OnlineMember;
  }

  /**
   * @inheritDoc
   */
  async isUserOnline(clientId: string): Promise<boolean> {
    const { latest } = await this._presenceManager.getPresenceSet();
    return latest.some((member) => member.clientId === clientId && member.data.isOnline);
  }

  /**
   * @inheritDoc
   */
  async setOnlineStatus(data?: OnlineStatusData): Promise<void> {
    this._logger.trace(`OnlineStatus.setOnlineStatus()`, { data });
    await this._presenceDataContribution.set((current: ChatPresenceData) => ({
      ...current,
      isOnline: true,
      userCustomData: data,
    }));
  }

  /**
   * @inheritDoc
   */
  async setOfflineStatus(data?: OnlineStatusData): Promise<void> {
    this._logger.trace(`OnlineStatus.setOfflineStatus()`, { data });
    await this._presenceDataContribution.set((current: ChatPresenceData) => ({
      ...current,
      userCustomData: data,
      isOnline: false,
    }));
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: OnlineStatusListener): OnlineStatusSubscriptionResponse {
    this._logger.trace(`DefaultOnlineStatus.subscribe();`);
    this.on(listener);

    return {
      unsubscribe: () => {
        this._logger.trace('DefaultOnlineStatus.unsubscribe();');
        this.off(listener);
      },
    };
  }

  /**
   * @inheritDoc
   */
  unsubscribeAll(): void {
    this._logger.trace(`DefaultOnlineStatus.unsubscribeAll();`);
    this.off();
  }

  /**
   * This will listen to user status events and convert them into associated online status events.
   */
  onUserStatusChange(event: { previous: ChatPresenceMessage[]; latest: ChatPresenceMessage[] }): void {
    this._logger.trace(`OnlineStatus.onUserStatusChange();`, { event });

    const { previous, latest } = event;

    const previousOnlineMembers = previous.map((member) => {
      return this._presenceMessageToOnlineMembers(member);
    });

    const latestOnlineMembers = latest.map((member) => {
      return this._presenceMessageToOnlineMembers(member);
    });

    // If the previous and latest online members are different, emit an event
    if (!dequal(previousOnlineMembers, latestOnlineMembers)) {
      this._logger.debug(`OnlineStatus.onUserStatusChange(); online set changed`, {
        previousOnlineMembers,
        latestOnlineMembers,
      });
      this.emit(OnlineStatusEvents.OnlineStatusChange, {
        onlineMembers: latestOnlineMembers,
      });
    }
  }
}
