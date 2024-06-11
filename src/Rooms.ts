import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { ClientOptions } from './config.js';
import { Logger } from './logger.js';
import { DefaultRoom, Room } from './Room.js';

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
   * @param roomId The ID of the room.
   * @returns Room A new or existing Room object.
   */
  get(roomId: string): Room;

  /**
   * Release the Room object if it exists. This method only releases the reference
   * to the Room object from the Rooms instance. It does not unsubscribe to any
   * events, leave the chat room or perform any other cleanup task. Those should
   * be done before calling release().
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
export class DefaultRooms implements Rooms {
  private readonly realtime: Ably.Realtime;
  private readonly chatApi: ChatApi;
  private readonly _clientOptions: ClientOptions;
  private rooms: Record<string, Room> = {};
  private _logger: Logger;

  /**
   * Constructs a new Rooms instance.
   *
   * @param realtime An instance of the Ably Realtime client.
   * @param clientOptions The client options from the chat instance.
   */
  constructor(realtime: Ably.Realtime, clientOptions: ClientOptions, logger: Logger) {
    this.realtime = realtime;
    this.chatApi = new ChatApi(realtime, logger);
    this._clientOptions = clientOptions;
    this._logger = logger;
  }

  /**
   * @inheritDoc
   */
  get(roomId: string): Room {
    this._logger.trace(`Rooms.get(); roomId=${roomId}`);
    if (this.rooms[roomId]) return this.rooms[roomId];

    const room = new DefaultRoom(roomId, this.realtime, this.chatApi, this._clientOptions, this._logger);
    this.rooms[roomId] = room;

    return room;
  }

  /**
   * @inheritDoc
   */
  get clientOptions(): ClientOptions {
    return this._clientOptions;
  }

  /**
   * @inheritDoc
   */
  async release(roomId: string) {
    this._logger.trace(`Rooms.release(); roomId=${roomId}`);
    const room = this.rooms[roomId];
    if (!room) {
      return;
    }
    delete this.rooms[roomId];
  }
}
