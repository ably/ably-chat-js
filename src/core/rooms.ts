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
  options : RoomOptions;
  kill: () => void;
}

function doNothing() {};

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
  private opNumber = 1;

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

  private makeNewRoom(roomId : string, options:RoomOptions) : DefaultRoom {
    const room = new DefaultRoom(roomId, options, this._realtime, this._chatApi, this._logger);
    return room;
  }

  /**
   * @inheritDoc
   */
  get(roomId: string, options: RoomOptions): Promise<Room> {
    const existing = this._rooms.get(roomId);
    if (existing) {
      if (!dequal(existing.options, options)) {
        throw new Ably.ErrorInfo('Room already exists with different options', 40000, 400);
      }
      return existing.promise;
    }

    const releasing = this._releasing.get(roomId);

    // If the current room is currently releasing, we have to wait for the release to finish and then
    // create a new room.
    //
    // We save the new room promise in the rooms map instantly so that we don't create two room objects.
    //
    // We set a killswitch in case the current room should release before initialisation.
    if (releasing) {
      let kill : () => void = () => void 0;
      const roomPromise = new Promise<DefaultRoom>((resolve, reject)=> {
        let rejected = false;
        let accepted = false;
        kill = () => {
          if (accepted) { return; }
          rejected = true;
          reject();
        }
        releasing.promise.then(() => {
          if (rejected) { return; }
          accepted = true;
          const room = this.makeNewRoom(roomId, options);
          resolve(room);
        });
      });

      this._rooms.set(roomId, {
        promise: roomPromise,
        options: options,
        kill: kill,
      });

      return roomPromise;
    }

    const room = this.makeNewRoom(roomId, options);
    const entry = {
      promise: Promise.resolve(room),
      options,
      room,
      kill: doNothing,
    };
    this._rooms.set(roomId, entry);

    return entry.promise;
  }

  /**
   * @inheritDoc
   */
  get clientOptions(): ClientOptions {
    return this._clientOptions;
  }

  release(roomId: string): Promise<void> {
    const existing = this._rooms.get(roomId);
    const releasing = this._releasing.get(roomId);

    if (!existing) {
      if (releasing) {
        return releasing.promise;
      }
      return Promise.resolve();
    }

    if (releasing) {
      // The releasing operation is not for the existing room, it is for the room that was released
      // before. We have to short-circuit and never initialise the existing room.
      this._rooms.delete(roomId);
      existing.kill();
      return Promise.resolve();
    }

    // room exists and not ongoing release operation, perform a regular release
    this._rooms.delete(roomId);
    const releasePromise = existing.promise.then(room => room.release());
    this._releasing.set(roomId, {promise: releasePromise, count: 1});

    return releasePromise;
  }
}
