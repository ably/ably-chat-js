import * as Ably from 'ably';
import { ClientOptions } from './config.js';
import { Connection } from './connection.js';
import { Rooms } from './rooms.js';
/**
 * This is the core client for Ably chat. It provides access to chat rooms.
 */
export declare class ChatClient {
    /**
     * Constructor for Chat
     * @param realtime - The Ably Realtime client.
     * @param clientOptions - The client options.
     */
    constructor(realtime: Ably.Realtime, clientOptions?: ClientOptions);
    /**
     * Returns the rooms object, which provides access to chat rooms.
     *
     * @returns The rooms object.
     */
    get rooms(): Rooms;
    /**
     * Returns the underlying connection to Ably, which can be used to monitor the clients
     * connection to Ably servers.
     *
     * @returns The connection object.
     */
    get connection(): Connection;
    /**
     * Returns the clientId of the current client.
     *
     * @returns The clientId.
     */
    get clientId(): string;
    /**
     * Returns the underlying Ably Realtime client.
     * @returns The Ably Realtime client.
     */
    get realtime(): Ably.Realtime;
    /**
     * Returns the resolved client options for the client, including any defaults that have been set.
     * @returns The client options.
     */
    get clientOptions(): ClientOptions;
}
