import * as Ably from 'ably';
import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { DiscontinuityListener, EmitsDiscontinuities, HandlesDiscontinuity, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { Logger } from './logger.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * This interface is used to interact with occupancy in a chat room: subscribing to occupancy updates and
 * fetching the current room occupancy metrics.
 *
 * Get an instance via {@link Room.occupancy}.
 */
export interface Occupancy extends EmitsDiscontinuities {
    /**
     * Subscribe a given listener to occupancy updates of the chat room.
     *
     * @param listener A listener to be called when the occupancy of the room changes.
     * @returns A promise resolves to the channel attachment state change event from the implicit channel attach operation.
     */
    subscribe(listener: OccupancyListener): OccupancySubscriptionResponse;
    /**
     * Unsubscribe all listeners from the occupancy updates of the chat room.
     */
    unsubscribeAll(): void;
    /**
     * Get the current occupancy of the chat room.
     *
     * @returns A promise that resolves to the current occupancy of the chat room.
     */
    get(): Promise<OccupancyEvent>;
    /**
     * Get underlying Ably channel for occupancy events.
     *
     * @returns The underlying Ably channel for occupancy events.
     */
    get channel(): Ably.RealtimeChannel;
}
/**
 * Represents the occupancy of a chat room.
 */
export interface OccupancyEvent {
    /**
     * The number of connections to the chat room.
     */
    connections: number;
    /**
     * The number of presence members in the chat room - members who have entered presence.
     */
    presenceMembers: number;
}
/**
 * A response object that allows you to control an occupancy update subscription.
 */
export interface OccupancySubscriptionResponse {
    /**
     * Unsubscribe the listener registered with {@link Occupancy.subscribe} from occupancy updates.
     */
    unsubscribe: () => void;
}
/**
 * A listener that is called when the occupancy of a chat room changes.
 * @param event The occupancy event.
 */
export type OccupancyListener = (event: OccupancyEvent) => void;
declare enum OccupancyEvents {
    Occupancy = "occupancy"
}
interface OccupancyEventsMap {
    [OccupancyEvents.Occupancy]: OccupancyEvent;
}
/**
 * @inheritDoc
 */
export declare class DefaultOccupancy extends EventEmitter<OccupancyEventsMap> implements Occupancy, HandlesDiscontinuity, ContributesToRoomLifecycle {
    private readonly _roomId;
    private readonly _channel;
    private readonly _chatApi;
    private _logger;
    private _discontinuityEmitter;
    /**
     * Constructs a new `DefaultOccupancy` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager An instance of the ChannelManager.
     * @param chatApi An instance of the ChatApi.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, channelManager: ChannelManager, chatApi: ChatApi, logger: Logger);
    /**
     * Creates the realtime channel for occupancy.
     */
    private _makeChannel;
    /**
     * @inheritdoc Occupancy
     */
    subscribe(listener: OccupancyListener): OccupancySubscriptionResponse;
    /**
     * @inheritdoc Occupancy
     */
    unsubscribeAll(): void;
    /**
     * @inheritdoc Occupancy
     */
    get(): Promise<OccupancyEvent>;
    /**
     * @inheritdoc Occupancy
     */
    get channel(): Ably.RealtimeChannel;
    /**
     * An internal listener that listens for occupancy events from the underlying channel and translates them into
     * occupancy events for the public API.
     */
    private _internalOccupancyListener;
    onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
    discontinuityDetected(reason?: Ably.ErrorInfo): void;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode(): ErrorCodes;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode(): ErrorCodes;
    /**
     * Merges the channel options for the room with the ones required for presence.
     *
     * @param roomOptions The room options to merge for.
     * @returns A function that merges the channel options for the room with the ones required for presence.
     */
    static channelOptionMerger(): ChannelOptionsMerger;
    /**
     * Returns the channel name for the presence channel.
     *
     * @param roomId The unique identifier of the room.
     * @returns The channel name for the presence channel.
     */
    static channelName(roomId: string): string;
}
export {};
