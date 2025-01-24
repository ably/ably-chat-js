import * as Ably from 'ably';
import { ChatApi } from './chat-api.js';
import { Logger } from './logger.js';
import { Messages } from './messages.js';
import { Occupancy } from './occupancy.js';
import { Presence } from './presence.js';
import { RoomOptions } from './room-options.js';
import { RoomReactions } from './room-reactions.js';
import { OnRoomStatusChangeResponse, RoomStatus, RoomStatusListener } from './room-status.js';
import { Typing } from './typing.js';
/**
 * Represents a chat room.
 */
export interface Room {
    /**
     * The unique identifier of the room.
     * @returns The room identifier.
     */
    get roomId(): string;
    /**
     * Allows you to send, subscribe-to and query messages in the room.
     *
     * @returns The messages instance for the room.
     */
    get messages(): Messages;
    /**
     * Allows you to subscribe to presence events in the room.
     *
     * @throws {@link ErrorInfo}} if presence is not enabled for the room.
     * @returns The presence instance for the room.
     */
    get presence(): Presence;
    /**
     * Allows you to interact with room-level reactions.
     *
     * @throws {@link ErrorInfo} if reactions are not enabled for the room.
     * @returns The room reactions instance for the room.
     */
    get reactions(): RoomReactions;
    /**
     * Allows you to interact with typing events in the room.
     *
     * @throws {@link ErrorInfo} if typing is not enabled for the room.
     * @returns The typing instance for the room.
     */
    get typing(): Typing;
    /**
     * Allows you to interact with occupancy metrics for the room.
     *
     * @throws {@link ErrorInfo} if occupancy is not enabled for the room.
     * @returns The occupancy instance for the room.
     */
    get occupancy(): Occupancy;
    /**
     * The current status of the room.
     *
     * @returns The current status.
     */
    get status(): RoomStatus;
    /**
     * The current error, if any, that caused the room to enter the current status.
     */
    get error(): Ably.ErrorInfo | undefined;
    /**
     * Registers a listener that will be called whenever the room status changes.
     * @param listener The function to call when the status changes.
     * @returns An object that can be used to unregister the listener.
     */
    onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;
    /**
     * Removes all listeners that were added by the `onStatusChange` method.
     */
    offAllStatusChange(): void;
    /**
     * Attaches to the room to receive events in realtime.
     *
     * If a room fails to attach, it will enter either the {@link RoomStatus.Suspended} or {@link RoomStatus.Failed} state.
     *
     * If the room enters the failed state, then it will not automatically retry attaching and intervention is required.
     *
     * If the room enters the suspended state, then the call to attach will reject with the {@link ErrorInfo} that caused the suspension. However,
     * the room will automatically retry attaching after a delay.
     *
     * @returns A promise that resolves when the room is attached.
     */
    attach(): Promise<void>;
    /**
     * Detaches from the room to stop receiving events in realtime.
     *
     * @returns A promise that resolves when the room is detached.
     */
    detach(): Promise<void>;
    /**
     * Returns the room options.
     *
     * @returns A copy of the options used to create the room.
     */
    options(): RoomOptions;
}
export declare class DefaultRoom implements Room {
    private readonly _roomId;
    private readonly _options;
    private readonly _chatApi;
    private readonly _messages;
    private readonly _typing?;
    private readonly _presence?;
    private readonly _reactions?;
    private readonly _occupancy?;
    private readonly _logger;
    private readonly _lifecycle;
    private readonly _lifecycleManager;
    private readonly _finalizer;
    /**
     * A random identifier for the room instance, useful in debugging and logging.
     */
    private readonly _nonce;
    /**
     * Constructs a new Room instance.
     *
     * @param roomId The unique identifier of the room.
     * @param nonce A random identifier for the room instance, useful in debugging and logging.
     * @param options The options for the room.
     * @param realtime An instance of the Ably Realtime client.
     * @param chatApi An instance of the ChatApi.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, nonce: string, options: RoomOptions, realtime: Ably.Realtime, chatApi: ChatApi, logger: Logger);
    /**
     * Gets the channel manager for the room, which handles merging channel options together and creating channels.
     *
     * @param options The room options.
     * @param realtime  An instance of the Ably Realtime client.
     * @param logger An instance of the Logger.
     */
    private _getChannelManager;
    /**
     * @inheritdoc Room
     */
    get roomId(): string;
    /**
     * @inheritDoc Room
     */
    options(): RoomOptions;
    /**
     * @inheritdoc Room
     */
    get messages(): Messages;
    /**
     * @inheritdoc Room
     */
    get presence(): Presence;
    /**
     * @inheritdoc Room
     */
    get reactions(): RoomReactions;
    /**
     * @inheritdoc Room
     */
    get typing(): Typing;
    /**
     * @inheritdoc Room
     */
    get occupancy(): Occupancy;
    /**
     * @inheritdoc Room
     */
    get status(): RoomStatus;
    /**
     * @inheritdoc Room
     */
    get error(): Ably.ErrorInfo | undefined;
    /**
     * @inheritdoc Room
     */
    onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;
    /**
     * @inheritdoc Room
     */
    offAllStatusChange(): void;
    /**
     * @inheritdoc Room
     */
    attach(): Promise<void>;
    /**
     * @inheritdoc Room
     */
    detach(): Promise<void>;
    /**
     * Releases resources associated with the room.
     * We guarantee that this does not throw an error.
     */
    release(): Promise<void>;
    /**
     * A random identifier for the room instance, useful in debugging and logging.
     *
     * @returns The nonce.
     */
    get nonce(): string;
}
