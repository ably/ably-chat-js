import * as Ably from 'ably';
import { Mutex } from 'async-mutex';
import { dequal } from 'dequal';

import { ChatApi } from './chat-api.js';
import { ClientOptions, NormalizedClientOptions } from './config.js';
import { Logger } from './logger.js';
import { DefaultRoom, Room } from './room.js';
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
   * @param roomId The ID of the room.
   * @param options The options for the room.
   * @throws {@link ErrorInfo} if a room with the same ID but different options already exists.
   * @returns Room A new or existing Room object.
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
   * @param roomId The ID of the room.
   */
  release(roomId: string): Promise<void>;

  /**
   * Get the client options used to create the Chat instance.
   * @returns ClientOptions
   */
  get clientOptions(): ClientOptions;
}

interface RoomMapEntry {
  promise: Promise<DefaultRoom>;
  room: DefaultRoom;
}

/**
 * Manages the chat rooms.
 */
export class DefaultRooms implements Rooms {
  private readonly _realtime: Ably.Realtime;
  private readonly _chatApi: ChatApi;
  private readonly _clientOptions: NormalizedClientOptions;
  private readonly _rooms: Map<string, RoomMapEntry> = new Map<string, RoomMapEntry>();
  private readonly _releasing = new Map<string, { count: number; promise: Promise<void> }>();
  private readonly _logger: Logger;
  private readonly _mtx: Mutex;

  /**
   * Constructs a new Rooms instance.
   *
   * @param realtime An instance of the Ably Realtime client.
   * @param clientOptions The client options from the chat instance.
   * @param logger An instance of the Logger.
   */
  constructor(realtime: Ably.Realtime, clientOptions: NormalizedClientOptions, logger: Logger) {
    this._realtime = realtime;
    this._chatApi = new ChatApi(realtime, logger);
    this._clientOptions = clientOptions;
    this._logger = logger;
    this._mtx = new Mutex();
  }

  /**
   * @inheritDoc
   */
  get(roomId: string, options: RoomOptions): Promise<Room> {
    this._logger.debug('Rooms.get(); before mtx', { roomId });
    return this._mtx.runExclusive(async () => {
      this._logger.trace('Rooms.get();', { roomId });

      const existing = this._rooms.get(roomId);
      if (existing) {
        if (!dequal(existing.room.options(), options)) {
          throw new Ably.ErrorInfo('Room already exists with different options', 40000, 400);
        }

        this._logger.debug('Rooms.get(); returning existing room', { roomId });
        return existing.promise;
      }

      const releasing = this._releasing.get(roomId);
      if (!releasing) {
        const room = new DefaultRoom(roomId, options, this._realtime, this._chatApi, this._logger);
        const entry = {
          promise: Promise.resolve(room),
          room: room,
        };

        this._rooms.set(roomId, entry);
        this._logger.debug('Rooms.get(); returning new room', { roomId });
        return entry.promise;
      }

      this._logger.debug('Rooms.get(); waiting for releasing to finish', { roomId });
      await releasing.promise;
      this._logger.debug('Rooms.get(); releasing finished', { roomId });
      return this.get(roomId, options);
    }, 1);
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
    this._logger.debug('Rooms.release(); before mtx', { roomId });
    return this._mtx.runExclusive(async () => {
      this._logger.trace('Rooms.release();', { roomId });

      const room = this._rooms.get(roomId);
      const releasing = this._releasing.get(roomId);

      // If the room doesn't currently exist
      if (!room) {
        // If the room is being released, forward the releasing promise
        if (releasing) {
          this._logger.debug('Rooms.release(); waiting for previous release call', {
            roomId,
          });
          return releasing.promise;
        }

        // If the room is not releasing, there is nothing else to do
        return;
      }

      // Make sure we no longer keep this room in the map
      this._logger.debug('Rooms.release(); removing room from map', { roomId });
      this._rooms.delete(roomId);

      // We have a room and an ongoing release, we keep the count of the latest
      // release call.
      let count = 0;
      if (releasing) {
        count = releasing.count + 1;
      }

      // const releasedPromise = room.room.release().then(() => {
      //   this._logger.debug('Rooms.release(); room released', { roomId });
      //   // Remove the room from currently releasing if the count of
      //   // this callback is at least as high as the current count.
      //   //
      //   // This is to handle the case where multiple release calls
      //   // are made in quick succession. We only want to remove the
      //   // room from the releasing map if the last ongoing release
      //   // finished.
      //   const releasing = this._releasing.get(roomId);
      //   if (releasing && releasing.count < count) {
      //     this._releasing.delete(roomId);
      //   }
      // });

      // Set the releasing process into motion but don't wait for it to finish
      const releasingPromise = room.room.release().then(() => {
        this._logger.debug('Rooms.release(); room released', { roomId });
        this._releasing.delete(roomId);
      });
      this._logger.debug('Rooms.release(); setting releasing', { roomId });
      this._releasing.set(roomId, { count, promise: releasingPromise });

      // At this point, we might come back after the release has finished, so see if we're still releasing
      return releasingPromise;
    }, 2);
  }
}
