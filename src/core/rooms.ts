import * as Ably from 'ably';
import { dequal } from 'dequal';

import { ChatApi } from './chat-api.js';
import { ChatClientOptions, NormalizedChatClientOptions } from './config.js';
import { ErrorCode } from './errors.js';
import { randomId } from './id.js';
import { Logger } from './logger.js';
import { DefaultRoom, Room } from './room.js';
import { normalizeRoomOptions, RoomOptions } from './room-options.js';

/**
 * Manages the lifecycle of chat rooms.
 */
export interface Rooms {
  /**
   * Gets a room reference by its unique identifier. The Rooms class ensures that only one reference
   * exists for each room. A new reference object is created if it doesn't already
   * exist, or if the one used previously was released using release(name).
   *
   * Always call `release(name)` after the Room object is no longer needed.
   *
   * If a call to `get` is made for a room that is currently being released, then the promise will resolve only when
   * the release operation is complete.
   *
   * If a call to `get` is made, followed by a subsequent call to `release` before the promise resolves, then the
   * promise will reject with an error.
   * @param name The unique identifier of the room.
   * @param options The options for the room.
   * @throws {@link ErrorInfo} if a room with the same name but different options already exists.
   * @returns Room A promise to a new or existing Room object.
   */
  get(name: string, options?: RoomOptions): Promise<Room>;

  /**
   * Release the Room object if it exists. This method only releases the reference
   * to the Room object from the Rooms instance and detaches the room from Ably. It does not unsubscribe to any
   * events.
   *
   * After calling this function, the room object is no-longer usable. If you wish to get the room object again,
   * you must call {@link Rooms.get}.
   *
   * Calling this function will abort any in-progress `get` calls for the same room.
   * @param name The unique identifier of the room.
   */
  release(name: string): Promise<void>;

  /**
   * Disposes all rooms that are currently in the rooms map.
   * This method releases all rooms concurrently and clears the rooms map.
   *
   * @returns A promise that resolves when all rooms have been released.
   */
  dispose(): Promise<void>;

  /**
   * Get the client options used to create the Chat instance.
   * @returns ChatClientOptions
   */
  get clientOptions(): ChatClientOptions;

  /**
   * Get the number of rooms currently in the rooms map.
   * @returns The number of rooms currently in the rooms map.
   */
  get count(): number;
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
  options: RoomOptions | undefined;

  /**
   * An abort controller to abort the get operation if the room is released before the get operation completes.
   */
  abort?: AbortController;
}

/**
 * Manages the chat rooms.
 */
export class DefaultRooms implements Rooms {
  private readonly _realtime: Ably.Realtime;
  private readonly _chatApi: ChatApi;
  private readonly _clientOptions: NormalizedChatClientOptions;
  private readonly _rooms: Map<string, RoomMapEntry> = new Map<string, RoomMapEntry>();
  private readonly _releasing = new Map<string, Promise<void>>();
  private readonly _logger: Logger;
  private _isReact = false;
  private _disposed = false;

  /**
   * Constructs a new Rooms instance.
   * @param realtime An instance of the Ably Realtime client.
   * @param clientOptions The client options from the chat instance.
   * @param logger An instance of the Logger.
   */
  constructor(realtime: Ably.Realtime, clientOptions: NormalizedChatClientOptions, logger: Logger) {
    this._realtime = realtime;
    this._chatApi = new ChatApi(realtime, logger);
    this._clientOptions = clientOptions;
    this._logger = logger;
  }

  /**
   * @inheritDoc
   */
  async get(name: string, options?: RoomOptions): Promise<Room> {
    this._logger.trace('Rooms.get();', { roomName: name });

    this._ensureNotDisposed();

    const existingRoom = this._rooms.get(name);
    if (existingRoom) {
      return this._handleExistingRoom(existingRoom, name, options);
    }

    const ongoingRelease = this._releasing.get(name);
    const nonce = randomId();

    if (!ongoingRelease) {
      return this._createNewRoom(name, nonce, options);
    }

    return this._waitForReleaseAndCreateRoom(name, nonce, options, ongoingRelease);
  }

  /**
   * @inheritDoc
   */
  async release(name: string): Promise<void> {
    this._logger.trace('Rooms.release();', { roomName: name });

    const existingRoom = this._rooms.get(name);
    const ongoingRelease = this._releasing.get(name);

    if (!existingRoom) {
      return this._handleNonExistentRoomRelease(name, ongoingRelease);
    }

    if (ongoingRelease) {
      return this._handleConcurrentRelease(name, existingRoom, ongoingRelease);
    }

    return this._performRoomRelease(name, existingRoom);
  }

  /**
   * Disposes all rooms that are currently in the rooms map.
   * This method releases all rooms concurrently and clears the rooms map.
   * @internal
   * @returns A promise that resolves when all rooms have been released.
   */
  async dispose(): Promise<void> {
    this._logger.trace('Rooms.dispose();');

    // Mark this instance as disposed
    this._disposed = true;

    // Get all room names currently in the map
    const roomNames = [...this._rooms.keys()];

    if (roomNames.length === 0) {
      this._logger.debug('Rooms.dispose(); no rooms to release');
      return;
    }

    // Release all rooms concurrently
    const releasePromises = roomNames.map((roomName) => this.release(roomName));

    this._logger.debug('Rooms.dispose(); releasing rooms', { roomCount: roomNames.length, roomNames });

    await Promise.all(releasePromises);
    this._logger.debug('Rooms.dispose(); all rooms released successfully');
  }

  /**
   * Get the client options used to create the Chat instance.
   * @returns ChatClientOptions
   */
  get clientOptions(): ChatClientOptions {
    return this._clientOptions;
  }

  /**
   * @inheritDoc
   */
  get count(): number {
    return this._rooms.size;
  }

  /**
   * Ensures the rooms instance has not been disposed.
   * @private
   */
  private _ensureNotDisposed(): void {
    if (this._disposed) {
      throw new Ably.ErrorInfo('cannot get room, rooms instance has been disposed', 40000, 400);
    }
  }

  /**
   * Handles the case where a room already exists.
   * @private
   */
  private async _handleExistingRoom(existingRoom: RoomMapEntry, name: string, options?: RoomOptions): Promise<Room> {
    if (!dequal(existingRoom.options, options)) {
      throw new Ably.ErrorInfo('room already exists with different options', 40000, 400);
    }

    this._logger.debug('Rooms.get(); returning existing room', {
      roomName: name,
      nonce: existingRoom.nonce,
      options,
    });
    return await existingRoom.promise;
  }

  /**
   * Creates a new room when no existing room or ongoing release exists.
   * @private
   */
  private _createNewRoom(name: string, nonce: string, options?: RoomOptions): Room {
    const room = this._makeRoom(name, nonce, options);
    const entry: RoomMapEntry = {
      promise: Promise.resolve(room),
      nonce: nonce,
      options: options,
    };

    this._rooms.set(name, entry);
    this._logger.debug('Rooms.get(); returning new room', { roomName: name, nonce: room.nonce });
    return room; // No need to await Promise.resolve(room)
  }

  /**
   * Waits for an ongoing release to complete, then creates a new room.
   * @private
   */
  private async _waitForReleaseAndCreateRoom(
    name: string,
    nonce: string,
    options: RoomOptions | undefined,
    ongoingRelease: Promise<void>,
  ): Promise<Room> {
    const abortController = new AbortController();
    const roomPromise = this._createAbortableRoomPromise(name, nonce, options, ongoingRelease, abortController);

    this._rooms.set(name, {
      promise: roomPromise,
      options: options,
      nonce: nonce,
      abort: abortController,
    });

    this._logger.debug('Rooms.get(); creating new promise dependent on previous release', { roomName: name });
    return await roomPromise;
  }

  /**
   * Creates a promise that can be aborted if the room is released before completion.
   * @private
   */
  private _createAbortableRoomPromise(
    name: string,
    nonce: string,
    options: RoomOptions | undefined,
    ongoingRelease: Promise<void>,
    abortController: AbortController,
  ): Promise<DefaultRoom> {
    return new Promise<DefaultRoom>((resolve, reject) => {
      const abortListener = () => {
        this._logger.debug('Rooms.get(); aborted before init', { roomName: name });
        reject(
          new Ably.ErrorInfo(
            'room released before get operation could complete',
            ErrorCode.RoomReleasedBeforeOperationCompleted,
            400,
          ),
        );
      };

      abortController.signal.addEventListener('abort', abortListener);

      ongoingRelease
        .then(() => {
          if (abortController.signal.aborted) {
            this._logger.debug('Rooms.get(); aborted before releasing promise resolved', { roomName: name });
            return;
          }

          this._logger.debug('Rooms.get(); releasing finished', { roomName: name });
          const room = this._makeRoom(name, nonce, options);
          abortController.signal.removeEventListener('abort', abortListener);
          resolve(room);
        })
        .catch((error: unknown) => {
          abortController.signal.removeEventListener('abort', abortListener);
          reject(error as Error);
        });
    });
  }

  /**
   * Handles release when no room exists.
   * @private
   */
  private async _handleNonExistentRoomRelease(name: string, ongoingRelease?: Promise<void>): Promise<void> {
    if (ongoingRelease) {
      this._logger.debug('Rooms.release(); waiting for previous release call', { roomName: name });
      await ongoingRelease;
      return;
    }

    this._logger.debug('Rooms.release(); room does not exist', { roomName: name });
  }

  /**
   * Handles release when there's already a release in progress.
   * @private
   */
  private async _handleConcurrentRelease(
    name: string,
    existingRoom: RoomMapEntry,
    ongoingRelease: Promise<void>,
  ): Promise<void> {
    if (existingRoom.abort) {
      this._logger.debug('Rooms.release(); aborting get call', {
        roomName: name,
        existingNonce: existingRoom.nonce,
      });
      existingRoom.abort.abort();
      this._rooms.delete(name);
    }

    await ongoingRelease;
  }

  /**
   * Performs the actual room release operation.
   * @private
   */
  private async _performRoomRelease(name: string, existingRoom: RoomMapEntry): Promise<void> {
    this._rooms.delete(name);

    const releasePromise = this._executeRoomRelease(name, existingRoom);
    this._releasing.set(name, releasePromise);

    this._logger.debug('Rooms.release(); creating new release promise', {
      roomName: name,
      nonce: existingRoom.nonce,
    });

    await releasePromise;
  }

  /**
   * Executes the room release and cleanup.
   * @private
   */
  private async _executeRoomRelease(name: string, existingRoom: RoomMapEntry): Promise<void> {
    const room = await existingRoom.promise;
    this._logger.debug('Rooms.release(); releasing room', { roomName: name, nonce: existingRoom.nonce });
    await room.release();
    this._logger.debug('Rooms.release(); room released', { roomName: name, nonce: existingRoom.nonce });
    this._releasing.delete(name);
  }

  /**
   * makes a new room object
   * @param name The unique identifier of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   * @returns DefaultRoom A new room object.
   */
  private _makeRoom(name: string, nonce: string, options: RoomOptions | undefined): DefaultRoom {
    return new DefaultRoom(
      name,
      nonce,
      normalizeRoomOptions(options, this._isReact),
      this._realtime,
      this._chatApi,
      this._logger,
    );
  }

  /**
   * Sets react JS mode.
   */
  useReact(): void {
    this._logger.trace('Rooms.useReact();');
    this._isReact = true;
  }
}
