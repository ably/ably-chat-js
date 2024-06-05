import * as Ably from 'ably';
import { Rooms } from './Rooms.js';
import { AGENT_STRING } from './version.js';
import { RealtimeWithOptions } from './realtimeextensions.js';
import { ClientOptions } from './config.js';

/**
 * This is the core client for Ably chat. It provides access to chat rooms.
 */
export class Chat {
  private readonly _realtime: Ably.Realtime;
  private readonly _rooms: Rooms;

  constructor(realtime: Ably.Realtime, clientOptions?: ClientOptions) {
    this._realtime = realtime;
    this._rooms = new Rooms(realtime, clientOptions);
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

  private setAgent(): void {
    const realtime = this._realtime as RealtimeWithOptions;
    const agent = { chat: AGENT_STRING };
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), ...agent };
  }
}
