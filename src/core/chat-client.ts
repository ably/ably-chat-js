import * as Ably from 'ably';

import { ChatClientOptions, normalizeClientOptions, NormalizedChatClientOptions } from './config.js';
import { Connection, DefaultConnection } from './connection.js';
import { randomId } from './id.js';
import { Logger, makeLogger } from './logger.js';
import { RealtimeWithOptions } from './realtime-extensions.js';
import { DefaultRooms, Rooms } from './rooms.js';
import { VERSION } from './version.js';

/**
 * This is the core client for Ably chat. It provides access to chat rooms.
 */
export class ChatClient {
  /**
   * @internal
   */
  private readonly _realtime: Ably.Realtime;

  /**
   * @internal
   */
  private readonly _rooms: DefaultRooms;

  /**
   * @internal
   */
  private readonly _clientOptions: NormalizedChatClientOptions;

  /**
   * @internal
   */
  private readonly _connection: Connection;

  /**
   * @internal
   */
  private readonly _logger: Logger;

  /**
   * @internal
   */
  private readonly _nonce: string;

  /**
   * Constructor for Chat
   * @param realtime - The Ably Realtime client.
   * @param clientOptions - The client options.
   */
  constructor(realtime: Ably.Realtime, clientOptions?: ChatClientOptions) {
    this._realtime = realtime;
    this._clientOptions = normalizeClientOptions(clientOptions);
    this._nonce = randomId();
    this._logger = makeLogger(this._clientOptions).withContext({
      chatClientNonce: this._nonce,
    });

    this._connection = new DefaultConnection(realtime, this._logger);
    this._rooms = new DefaultRooms(realtime, this._clientOptions, this._logger);
    this._addAgent('chat-js');
    this._logger.trace(`ably chat client version ${VERSION}; initialized`);
  }

  /**
   * Returns the rooms object, which provides access to chat rooms.
   * @returns The rooms object.
   */
  get rooms(): Rooms {
    return this._rooms;
  }

  /**
   * Returns the underlying connection to Ably, which can be used to monitor the client's
   * connection to Ably servers.
   * @returns The connection object.
   */
  get connection(): Connection {
    return this._connection;
  }

  /**
   * Returns the clientId of the current client.
   * @returns The clientId.
   */
  get clientId(): string {
    return this._realtime.auth.clientId;
  }

  /**
   * Returns the underlying Ably Realtime client.
   * @returns The Ably Realtime client.
   */
  get realtime(): Ably.Realtime {
    return this._realtime;
  }

  /**
   * Returns the resolved client options for the client, including any defaults that have been set.
   * @returns The client options.
   */
  get clientOptions(): ChatClientOptions {
    return this._clientOptions;
  }

  /**
   * Returns the logger instance for the client.
   * @internal
   * @returns The logger instance.
   */
  get logger(): Logger {
    return this._logger;
  }

  /**
   * Adds additional agent information to the client.
   * Used internally to add React-specific agent information.
   * @internal
   */
  public addReactAgent(): void {
    this._addAgent('chat-react');
    this._rooms.useReact();
  }

  /**
   * Adds additional agent information to the client.
   * This is used internally to add a specific agent with a version.
   * @param agent - The agent to add.
   * @param version - The version of the agent, defaults to the current client version.
   * @internal
   */
  public addAgentWithVersion(agent: string, version: string): void {
    this._addAgent(agent, version);
    this._logger.trace(`Added agent ${agent} with version ${version}`);
  }

  /**
   * Disposes of the ChatClient instance, cleaning up any resources and rendering it unusable.
   * This method will throw an error if there are any rooms currently in the rooms map.
   *
   * @throws An ErrorInfo with code 40000 if the Rooms instance has any rooms in its map.
   */
  dispose(): void {
    this._logger.trace('ChatClient.dispose();');

    // Check if there are any rooms in the rooms map
    if (this._rooms.count > 0) {
      const error = new Ably.ErrorInfo(
        'cannot dispose client; rooms still exist, please release all rooms before disposing',
        40000,
        400,
      );
      this._logger.error('ChatClient.dispose(); cannot dispose with existing rooms', { error });
      throw error;
    }

    // Dispose of the connection instance
    this._connection.dispose();
    this._logger.debug('ChatClient.dispose(); client disposed successfully');
  }

  /**
   * Sets the agent string for the client.
   * @param agent - The agent to add.
   * @param version - The version of the agent, defaults to the current client version.
   * @internal
   */
  private _addAgent(agent: string, version?: string): void {
    const realtime = this._realtime as RealtimeWithOptions;
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), [agent]: version ?? VERSION };
  }
}
