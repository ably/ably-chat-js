import * as Ably from 'ably';
import { ClientOptions, NormalizedClientOptions } from './config.js';
import { Logger } from './logger.js';
import { Room } from './room.js';
import { RoomOptions } from './room-options.js';
/**
 * Manages the lifecycle of chat rooms.
 */
export interface Rooms {
    /**
     * Gets a room reference by ID. The Rooms class ensures that only one reference
     * exists for each room. A new reference object is created if it doesn't already
     * exist, or if the one used previously was released using release(roomId).
     *
     * Always call `release(roomId)` after the Room object is no longer needed.
     *
     * If a call to `get` is made for a room that is currently being released, then the promise will resolve only when
     * the release operation is complete.
     *
     * If a call to `get` is made, followed by a subsequent call to `release` before the promise resolves, then the
     * promise will reject with an error.
     *
     * @param roomId The ID of the room.
     * @param options The options for the room.
     * @throws {@link ErrorInfo} if a room with the same ID but different options already exists.
     * @returns Room A promise to a new or existing Room object.
     */
    get(roomId: string, options: RoomOptions): Promise<Room>;
    /**
     * Release the Room object if it exists. This method only releases the reference
     * to the Room object from the Rooms instance and detaches the room from Ably. It does not unsubscribe to any
     * events.
     *
     * After calling this function, the room object is no-longer usable. If you wish to get the room object again,
     * you must call {@link Rooms.get}.
     *
     * Calling this function will abort any in-progress `get` calls for the same room.
     *
     * @param roomId The ID of the room.
     */
    release(roomId: string): Promise<void>;
    /**
     * Get the client options used to create the Chat instance.
     * @returns ClientOptions
     */
    get clientOptions(): ClientOptions;
}
/**
 * Manages the chat rooms.
 */
export declare class DefaultRooms implements Rooms {
    private readonly _realtime;
    private readonly _chatApi;
    private readonly _clientOptions;
    private readonly _rooms;
    private readonly _releasing;
    private readonly _logger;
    /**
     * Constructs a new Rooms instance.
     *
     * @param realtime An instance of the Ably Realtime client.
     * @param clientOptions The client options from the chat instance.
     * @param logger An instance of the Logger.
     */
    constructor(realtime: Ably.Realtime, clientOptions: NormalizedClientOptions, logger: Logger);
    /**
     * @inheritDoc
     */
    get(roomId: string, options: RoomOptions): Promise<Room>;
    /**
     * @inheritDoc
     */
    get clientOptions(): ClientOptions;
    /**
     * @inheritDoc
     */
    release(roomId: string): Promise<void>;
    /**
     * makes a new room object
     *
     * @param roomId The ID of the room.
     * @param nonce A random, internal identifier useful for debugging and logging.
     * @param options The options for the room.
     *
     * @returns DefaultRoom A new room object.
     */
    private _makeRoom;
}
