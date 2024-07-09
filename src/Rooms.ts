import * as Ably from 'ably';
import { dequal } from 'dequal';

import { ChatApi } from './ChatApi.js';
import { ClientOptions, NormalisedClientOptions } from './config.js';
import { Logger } from './logger.js';
import { DefaultRoom, Room } from './Room.js';
import { RoomOptions } from './RoomOptions.js';

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
   * @param options The options for the room.
   * @throws {@link ErrorInfo} if a room with the same ID but different options already exists.
   * @returns Room A new or existing Room object.
   */
  get(roomId: string, options: RoomOptions): Room;

  /**
   * Release the Room object if it exists. This method only releases the reference
   * to the Room object from the Rooms instance and detaches the room from Ably. It does not unsubscribe to any
   * events.
   *
   * After calling this function, the room object is no-longer usable. If you wish to get the room object again,
   * you must call {@link Rooms.get}.
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
  private readonly _realtime: Ably.Realtime;
  private readonly _chatApi: ChatApi;
  private readonly _clientOptions: NormalisedClientOptions;
  private readonly _rooms: Map<string, DefaultRoom> = new Map<string, DefaultRoom>();
  private readonly _logger: Logger;

  /**
   * Constructs a new Rooms instance.
   *
   * @param realtime An instance of the Ably Realtime client.
   * @param clientOptions The client options from the chat instance.
   */
  constructor(realtime: Ably.Realtime, clientOptions: NormalisedClientOptions, logger: Logger) {
    this._realtime = realtime;
    this._chatApi = new ChatApi(realtime, logger);
    this._clientOptions = clientOptions;
    this._logger = logger;
  }

  /**
   * @inheritDoc
   */
  get(roomId: string, options: RoomOptions): Room {
    this._logger.trace('Rooms.get();', { roomId });

    const existing = this._rooms.get(roomId);
    if (existing) {
      if (!dequal(existing.options(), options)) {
        throw new Ably.ErrorInfo('Room already exists with different options', 40000, 400);
      }

      return existing;
    }

    const room = new DefaultRoom(roomId, options, this._realtime, this._chatApi, this._clientOptions, this._logger);
    this._rooms.set(roomId, room);

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
  release(roomId: string): Promise<void> {
    this._logger.trace('Rooms.release();', { roomId });

    const room = this._rooms.get(roomId);
    if (!room) return Promise.resolve();

    return room.release().then(() => {
      this._logger.debug('Rooms.release(); room released', { roomId });
      this._rooms.delete(roomId);
    });
  }
}
