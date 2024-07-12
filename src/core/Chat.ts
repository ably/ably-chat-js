import * as Ably from 'ably';

import { ClientOptions, normalizeClientOptions, NormalizedClientOptions } from './config.js';
import { Connection, DefaultConnection } from './Connection.js';
import { DefaultConnectionStatus } from './ConnectionStatus.js';
import { makeLogger } from './logger.js';
import { RealtimeWithOptions } from './realtimeExtensions.js';
import { DefaultRooms, Rooms } from './Rooms.js';
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
  private readonly _rooms: Rooms;

  /**
   * @internal
   */
  private readonly _clientOptions: NormalizedClientOptions;

  /**
   * @internal
   */
  private readonly _connection: Connection;

  /**
   * Constructor for Chat
   * @param realtime - The Ably Realtime client.
   * @param clientOptions - The client options.
   */
  constructor(realtime: Ably.Realtime, clientOptions?: ClientOptions) {
    this._realtime = realtime;
    this._clientOptions = normalizeClientOptions(clientOptions);
    const logger = makeLogger(this._clientOptions);
    this._connection = new DefaultConnection(new DefaultConnectionStatus(realtime, logger));

    this._rooms = new DefaultRooms(realtime, this._clientOptions, logger);
    this._setAgent();
    logger.trace(`ably chat client version ${VERSION}; initialized`);
  }

  /**
   * Returns the rooms object, which provides access to chat rooms.
   *
   * @returns The rooms object.
   */
  get rooms(): Rooms {
    return this._rooms;
  }

  /**
   * Returns the underlying connection to Ably, which can be used to monitor the clients
   * connection to Ably servers.
   *
   * @returns The connection object.
   */
  get connection(): Connection {
    return this._connection;
  }

  /**
   * Returns the clientId of the current client.
   *
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
  get clientOptions(): ClientOptions {
    return this._clientOptions;
  }

  /**
   * Sets the agent string for the client.
   * @internal
   */
  private _setAgent(): void {
    const realtime = this._realtime as RealtimeWithOptions;
    const agent = { 'chat-js': VERSION };
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), ...agent };
  }
}
