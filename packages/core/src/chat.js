import { normalizeClientOptions } from './config.js';
import { DefaultConnection } from './connection.js';
import { makeLogger } from './logger.js';
import { DefaultRooms } from './rooms.js';
import { VERSION } from './version.js';
/**
 * This is the core client for Ably chat. It provides access to chat rooms.
 */
export class ChatClient {
    /**
     * Constructor for Chat
     * @param realtime - The Ably Realtime client.
     * @param clientOptions - The client options.
     */
    constructor(realtime, clientOptions) {
        this._realtime = realtime;
        this._clientOptions = normalizeClientOptions(clientOptions);
        this._logger = makeLogger(this._clientOptions);
        this._connection = new DefaultConnection(realtime, this._logger);
        this._rooms = new DefaultRooms(realtime, this._clientOptions, this._logger);
        this._addAgent('chat-js');
        this._logger.trace(`ably chat client version ${VERSION}; initialized`);
    }
    /**
     * Returns the rooms object, which provides access to chat rooms.
     *
     * @returns The rooms object.
     */
    get rooms() {
        return this._rooms;
    }
    /**
     * Returns the underlying connection to Ably, which can be used to monitor the clients
     * connection to Ably servers.
     *
     * @returns The connection object.
     */
    get connection() {
        return this._connection;
    }
    /**
     * Returns the clientId of the current client.
     *
     * @returns The clientId.
     */
    get clientId() {
        return this._realtime.auth.clientId;
    }
    /**
     * Returns the underlying Ably Realtime client.
     * @returns The Ably Realtime client.
     */
    get realtime() {
        return this._realtime;
    }
    /**
     * Returns the resolved client options for the client, including any defaults that have been set.
     * @returns The client options.
     */
    get clientOptions() {
        return this._clientOptions;
    }
    /**
     * Returns the logger instance for the client.
     * @internal
     * @returns The logger instance.
     */
    get logger() {
        return this._logger;
    }
    /**
     * Adds additional agent information to the client.
     * Used internally to add React-specific agent information.
     * @param agent - The agent to add.
     * @internal
     */
    addReactAgent() {
        this._addAgent('chat-react');
    }
    /**
     * Sets the agent string for the client.
     * @param agent - The agent to add.
     * @internal
     */
    _addAgent(agent) {
        var _a;
        const realtime = this._realtime;
        realtime.options.agents = Object.assign(Object.assign({}, ((_a = realtime.options.agents) !== null && _a !== void 0 ? _a : realtime.options.agents)), { [agent]: VERSION });
    }
}
//# sourceMappingURL=chat.js.map