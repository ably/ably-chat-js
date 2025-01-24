import * as Ably from 'ably';
import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
import { DiscontinuityListener, EmitsDiscontinuities, HandlesDiscontinuity, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { PresenceEvents } from './events.js';
import { Logger } from './logger.js';
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
    subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): PresenceSubscriptionResponse;
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
export declare class DefaultPresence extends EventEmitter<PresenceEventsMap> implements Presence, HandlesDiscontinuity, ContributesToRoomLifecycle {
    private readonly _channel;
    private readonly _clientId;
    private readonly _logger;
    private readonly _discontinuityEmitter;
    /**
     * Constructs a new `DefaultPresence` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager The channel manager to use for creating the presence channel.
     * @param clientId The client ID, attached to presences messages as an identifier of the sender.
     * A channel can have multiple connections using the same clientId.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, channelManager: ChannelManager, clientId: string, logger: Logger);
    /**
     * Creates the realtime channel for presence.
     */
    private _makeChannel;
    /**
     * Get the underlying Ably realtime channel used for presence in this chat room.
     * @returns The realtime channel.
     */
    get channel(): Ably.RealtimeChannel;
    /**
     * @inheritDoc
     */
    get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;
    /**
     * @inheritDoc
     */
    isUserPresent(clientId: string): Promise<boolean>;
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
    subscribe(eventOrEvents: PresenceEvents | PresenceEvents[], listener?: PresenceListener): PresenceSubscriptionResponse;
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
     * Method to handle and emit presence events
     * @param member - PresenceMessage ably-js object
     * @returns void - Emits a transformed event to all subscribers, or upon failure,
     * the promise will be rejected with an {@link ErrorInfo} object which explains the error.
     */
    subscribeToEvents: (member: Ably.PresenceMessage) => void;
    onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
    discontinuityDetected(reason?: Ably.ErrorInfo): void;
    /**
     * @inheritDoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode(): ErrorCodes;
    /**
     * @inheritDoc
     */
    get detachmentErrorCode(): ErrorCodes;
    /**
     * Merges the channel options for the room with the ones required for presence.
     *
     * @param roomOptions The room options to merge for.
     * @returns A function that merges the channel options for the room with the ones required for presence.
     */
    static channelOptionMerger(roomOptions: RoomOptions): ChannelOptionsMerger;
    /**
     * Returns the channel name for the presence channel.
     *
     * @param roomId The unique identifier of the room.
     * @returns The channel name for the presence channel.
     */
    static channelName(roomId: string): string;
}
export {};
