import * as Ably from 'ably';

import { ClientOptions } from './config.js';
import { RealtimeWithOptions } from './realtimeextensions.js';
import { DefaultRooms, Rooms } from './Rooms.js';
import { AGENT_STRING } from './version.js';

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
   * Constructor for Chat
   * @param realtime - The Ably Realtime client.
   * @param clientOptions - The client options.
   */
  constructor(realtime: Ably.Realtime, clientOptions?: ClientOptions) {
    this._realtime = realtime;
    this._rooms = new DefaultRooms(realtime, clientOptions);
    this.setAgent();
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
   * Sets the agent string for the client.
   */
  private setAgent(): void {
    const realtime = this._realtime as RealtimeWithOptions;
    const agent = { chat: AGENT_STRING };
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), ...agent };
  }
}
