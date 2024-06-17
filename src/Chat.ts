import * as Ably from 'ably';

import { ClientOptions, normaliseClientOptions, NormalisedClientOptions } from './config.js';
import { makeLogger } from './logger.js';
import { RealtimeWithOptions } from './realtimeextensions.js';
import { DefaultRooms, Rooms } from './Rooms.js';
import { AGENT_STRING, VERSION } from './version.js';

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
  private readonly _clientOptions: NormalisedClientOptions;

  /**
   * Constructor for Chat
   * @param realtime - The Ably Realtime client.
   * @param clientOptions - The client options.
   */
  constructor(realtime: Ably.Realtime, clientOptions?: ClientOptions) {
    this._realtime = realtime;
    this._clientOptions = normaliseClientOptions(clientOptions);
    const logger = makeLogger(this._clientOptions);

    this._rooms = new DefaultRooms(realtime, this._clientOptions, logger);
    this.setAgent();
    logger.trace(`ably chat client version ${VERSION}; initialised`);
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
  get connection(): Ably.Connection {
    return this._realtime.connection;
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
   */
  private setAgent(): void {
    const realtime = this._realtime as RealtimeWithOptions;
    const agent = { chat: AGENT_STRING };
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), ...agent };
  }
}
