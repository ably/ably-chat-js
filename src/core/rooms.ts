import * as Ably from 'ably';
import { dequal } from 'dequal';

import { ChatApi } from './chat-api.js';
import { ClientOptions, NormalizedClientOptions } from './config.js';
import { ErrorCodes } from './errors.js';
import { randomId } from './id.js';
import { Logger } from './logger.js';
import { DefaultRoom, Room } from './room.js';
import { RoomOptions } from './room-options.js';
import { RoomStatus } from './room-status.js';

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
   * If a call to `get` is made for a room that is currently being released, then the promise will resolve only when
   * the release operation is complete.
   *
   * If a call to `get` is made, followed by a subsequent call to `release` before the promise resolves, then the
   * promise will reject with an error.
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
   * Calling this function will abort any in-progress `get` calls for the same room.
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
 * Represents an entry in the chat room map.
 */
interface RoomMapEntry {
  /**
   * The promise that will eventually resolve to the room.
   */
  promise: Promise<DefaultRoom>;

  /**
   * A random, internal identifier useful for debugging and logging.
   */
  nonce: string;

  /**
   * The options for the room.
   */
  options: RoomOptions;

  /**
   * An abort controller to abort the get operation if the room is released before the get operation completes.
   */
  abort?: AbortController;
}

type CancelRoomGet = (reason?: Ably.ErrorInfo) => void

/**
 * Manages the chat rooms.
 */
export class DefaultRooms implements Rooms {
  private readonly _realtime: Ably.Realtime;
  private readonly _chatApi: ChatApi;
  private readonly _clientOptions: NormalizedClientOptions;
  private readonly _rooms: Map<string, RoomMapEntry> = new Map<string, RoomMapEntry>();
  private readonly _releasing = new Map<string, Promise<void>>();
  private readonly _logger: Logger;

  private readonly _roomsMap: Map<string, Room> = new Map<string, Room>();
  private readonly _roomReleaseBeforeRoomGet: Map<string, { released: Promise<void>, rej: CancelRoomGet }> = new Map<string, {released: Promise<void>, rej: CancelRoomGet }>();
  private readonly _releasingRoom = new Map<string, boolean>();

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
  }

  getReleasedOrExistingRoom(roomId: string, operationCancellable: boolean): Promise<void> | Promise<Room> {
    if (operationCancellable) {
      const previousgetReleasedRoom = this._roomReleaseBeforeRoomGet.get(roomId)
      if (previousgetReleasedRoom) {
        return previousgetReleasedRoom.released
      }
    }
    const existing = this._roomsMap.get(roomId);
    if (existing) {
      if (this._releasing.has(roomId)) {
        const promise = new Promise<void>((res, rej) => {
          if (operationCancellable) {
            this._roomReleaseBeforeRoomGet.set(roomId, {released: promise, rej})
          }
          const {off} = existing.onStatusChange(change => {
              if (change.current === RoomStatus.Released) {
                if (operationCancellable) {
                  this._roomReleaseBeforeRoomGet.delete(roomId)
                }
                off()
                res()
              }
          })
        })
        return promise
      }
      return Promise.resolve(existing)
    }
    return Promise.resolve()
  }

  getRoom(roomId: string, options: RoomOptions): Promise<Room> {
    return this.getReleasedOrExistingRoom(roomId, true).then(existingRoom => {
      if (existingRoom) {
        return existingRoom
      }
      const room = this._makeRoom(roomId, 'nonceId', options)
      this._roomsMap.set(roomId, room)
      return room
    })
  }
  
  releaseRoom(roomId: string): Promise<void> {
    const cancelExistingRoomGet = this._roomReleaseBeforeRoomGet.get(roomId)
    if (cancelExistingRoomGet) {
      this._roomReleaseBeforeRoomGet.delete(roomId)
      cancelExistingRoomGet.rej(new Ably.ErrorInfo(
        'room released before get operation could complete',
        ErrorCodes.RoomReleasedBeforeOperationCompleted,
        400,
      ))
    }
    return this.getReleasedOrExistingRoom(roomId, false).then(existingRoom => {
      if (existingRoom) {
        this._releasingRoom.set(roomId, true)
        return existingRoom.release()
      }
    }).then(_ => {
      this._releasingRoom.delete(roomId)
      this._roomsMap.delete(roomId)
    })
  }

  /**
   * @inheritDoc
   */
  get(roomId: string, options: RoomOptions): Promise<Room> {
    this._logger.trace('Rooms.get();', { roomId });

    const existing = this._rooms.get(roomId);
    if (existing) {
      if (!dequal(existing.options, options)) {
        return Promise.reject(new Ably.ErrorInfo('room already exists with different options', 40000, 400));
      }

      this._logger.debug('Rooms.get(); returning existing room', { roomId, nonce: existing.nonce });
      return existing.promise;
    }

    const releasing = this._releasing.get(roomId);
    const nonce = randomId();

    // We're not currently releasing the room, so we just make a new one
    if (!releasing) {
      const room = this._makeRoom(roomId, nonce, options);
      const entry = {
        promise: Promise.resolve(room),
        nonce: nonce,
        options: options,
      };

      this._rooms.set(roomId, entry);
      this._logger.debug('Rooms.get(); returning new room', { roomId, nonce: room.nonce });
      return entry.promise;
    }

    // The room is currently in the process of being released so, we wait for it to finish
    // we add an abort controller so that if the room is released again whilst we're waiting, we abort the process
    const abortController = new AbortController();
    const roomPromise = new Promise<DefaultRoom>((resolve, reject) => {
      const abortListener = () => {
        this._logger.debug('Rooms.get(); aborted before init', { roomId });
        reject(
          new Ably.ErrorInfo(
            'room released before get operation could complete',
            ErrorCodes.RoomReleasedBeforeOperationCompleted,
            400,
          ),
        );
      };

      abortController.signal.addEventListener('abort', abortListener);

      releasing
        .then(() => {
          // We aborted before resolution
          if (abortController.signal.aborted) {
            this._logger.debug('Rooms.get(); aborted before releasing promise resolved', { roomId });
            return;
          }

          this._logger.debug('Rooms.get(); releasing finished', { roomId });
          const room = this._makeRoom(roomId, nonce, options);
          abortController.signal.removeEventListener('abort', abortListener);
          resolve(room);
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    });

    this._rooms.set(roomId, {
      promise: roomPromise,
      options: options,
      nonce: nonce,
      abort: abortController,
    });

    this._logger.debug('Rooms.get(); creating new promise dependent on previous release', { roomId });
    return roomPromise;
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

    const existing = this._rooms.get(roomId);
    const releasing = this._releasing.get(roomId);

    // If the room doesn't currently exist
    if (!existing) {
      // existing the room is being released, forward the releasing promise
      if (releasing) {
        this._logger.debug('Rooms.release(); waiting for previous release call', {
          roomId,
        });
        return releasing;
      }

      // If the room is not releasing, there is nothing else to do
      this._logger.debug('Rooms.release(); room does not exist', { roomId });
      return Promise.resolve();
    }

    // A release is in progress, but its not for the currently requested room instance
    // ie we called release, then get, then release again
    // so instead of doing another release process, we just abort the current get
    if (releasing) {
      if (existing.abort) {
        this._logger.debug('Rooms.release(); aborting get call', { roomId, existingNonce: existing.nonce });
        existing.abort.abort();
        this._rooms.delete(roomId);
      }

      return releasing;
    }

    // Room doesn't exist and we're not releasing, so its just a regular release operation
    this._rooms.delete(roomId);
    const releasePromise = existing.promise.then((room) => {
      this._logger.debug('Rooms.release(); releasing room', { roomId, nonce: existing.nonce });
      return room.release();
    });

    this._logger.debug('Rooms.release(); creating new release promise', { roomId, nonce: existing.nonce });
    this._releasing.set(roomId, releasePromise);

    return releasePromise;
  }

  /**
   * makes a new room object
   *
   * @param roomId The ID of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   *
   * @returns DefaultRoom A new room object.
   */
  private _makeRoom(roomId: string, nonce: string, options: RoomOptions): DefaultRoom {
    return new DefaultRoom(roomId, nonce, options, this._realtime, this._chatApi, this._logger);
  }
}
