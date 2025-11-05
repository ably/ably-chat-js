import * as Ably from 'ably';
import { dequal } from 'dequal';

import { ChatApi } from './chat-api.js';
import { ClientIdResolver } from './client-id.js';
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
   * Gets a room reference by its unique identifier.
   *
   * Creates a new room instance or returns an existing one. The Rooms class ensures
   * only one instance exists per room name. Always call `release()` when the room
   * is no longer needed to free resources.
   *
   * **Note**:
   * - If options differ from an existing room, an error is thrown.
   * - If `get` is called during a release, it waits for release to complete.
   * - If `release` is called before `get` resolves, the promise rejects.
   * @param name - The unique identifier of the room
   * @param options - Optional configuration for the room features
   * @returns Promise resolving to the Room instance, or rejecting with:
   * - {@link ErrorCode.RoomExistsWithDifferentOptions} if room exists with different options
   * - {@link ErrorCode.ResourceDisposed} if the rooms instance has been disposed
   * - {@link ErrorCode.RoomReleasedBeforeOperationCompleted} if room is released before get completes
   * @example
   * ```
   * import * as Ably from 'ably';
   * import { ChatClient, Room } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('general-chat');
   *
   * // Always release when done
   * await chatClient.rooms.release('general-chat');
   *
   * // Handle errors when options conflict
   * try {
   *   // This will throw if 'game-room' already exists with different options
   *   const room1 = await chatClient.rooms.get('game-room', {
   *     typing: { heartbeatThrottleMs: 1000 }
   *   });
   *
   *   const room2 = await chatClient.rooms.get('game-room', {
   *     typing: { heartbeatThrottleMs: 2000 } // Different options!
   *   });
   * } catch (error) {
   *   if (error.code === 40000) {
   *     console.error('Room already exists with different options');
   *   }
   * }
   * ```
   */
  get(name: string, options?: RoomOptions): Promise<Room>;

  /**
   * Releases a room, freeing its resources and detaching it from Ably.
   *
   * After release, the room object is no longer usable. To use the room again,
   * call `get()` to create a new instance. This method only releases the reference
   * and detaches from Ably; it doesn't unsubscribe existing event listeners.
   *
   * **Note**:
   * - Calling release aborts any in-progress `get` calls for the same room.
   * - The room object becomes unusable after release.
   * @param name - The unique identifier of the room to release
   * @returns Promise that resolves when the room is fully released
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('temporary-chat');
   * await room.attach();
   *
   * // Do chat operations...
   *
   * // When done, release the room
   * await chatClient.rooms.release('temporary-chat');
   *
   * // The room object is now unusable
   * try {
   *   await room.messages.send({ text: 'This will fail' });
   * } catch (error) {
   *   console.error('Room has been released');
   * }
   *
   * // To use the room again, get a new instance
   * const newRoom = await chatClient.rooms.get('temporary-chat');
   *
   * // Handle release of non-existent rooms (no-op)
   * await chatClient.rooms.release('non-existent-room'); // Safe, does nothing
   * ```
   */
  release(name: string): Promise<void>;

  /**
   * Disposes all rooms that are currently in the rooms map.
   * This method releases all rooms concurrently and clears the rooms map.
   * @returns A promise that resolves when all rooms have been released.
   */
  dispose(): Promise<void>;
}

/**
 * An internal interface for Rooms.
 * @internal
 */
export interface InternalRooms extends Rooms {
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
export class DefaultRooms implements InternalRooms {
  private readonly _realtime: Ably.Realtime;
  private readonly _chatApi: ChatApi;
  private readonly _rooms: Map<string, RoomMapEntry> = new Map<string, RoomMapEntry>();
  private readonly _releasing = new Map<string, Promise<void>>();
  private readonly _clientIdResolver: ClientIdResolver;
  private readonly _logger: Logger;
  private _isReact = false;
  private _disposed = false;

  /**
   * Constructs a new Rooms instance.
   * @param realtime An instance of the Ably Realtime client.
   * @param clientIdResolver A resolver for the clientId.
   * @param logger An instance of the Logger.
   */
  constructor(realtime: Ably.Realtime, clientIdResolver: ClientIdResolver, logger: Logger) {
    this._realtime = realtime;
    this._chatApi = new ChatApi(realtime, logger);
    this._clientIdResolver = clientIdResolver;
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
   * Disposes all rooms that are currently in the rooms map and waits for any ongoing release operations to complete.
   * This method releases all rooms concurrently, waits for any in-flight releases to finish, and clears the rooms map.
   * After this method resolves, all rooms will have been fully released and cleaned up.
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
    const releasePromises = roomNames.map(async (roomName) => this.release(roomName));

    // Ensure we wait for all ongoing releases too, since we guarantee that all rooms are released after this call
    // resolves.
    const inFlight = [...this._releasing.values()];
    const all = [...releasePromises, ...inFlight];

    this._logger.debug('Rooms.dispose(); releasing rooms', { roomCount: roomNames.length, roomNames });

    await Promise.all(all);
    this._logger.debug('Rooms.dispose(); all rooms released successfully');
  }

  /**
   * @inheritDoc
   */
  get count(): number {
    return this._rooms.size;
  }

  /**
   * Ensures the rooms instance has not been disposed.
   */
  private _ensureNotDisposed(): void {
    if (this._disposed) {
      throw new Ably.ErrorInfo('unable to get room; rooms instance has been disposed', ErrorCode.ResourceDisposed, 400);
    }
  }

  /**
   * Handles the case where a room already exists.
   * @param existingRoom The existing room entry in the map.
   * @param name The unique identifier of the room.
   * @param options The options for the room.
   * @returns A promise that resolves to the existing room.
   */
  private async _handleExistingRoom(existingRoom: RoomMapEntry, name: string, options?: RoomOptions): Promise<Room> {
    if (!dequal(existingRoom.options, options)) {
      throw new Ably.ErrorInfo(
        'unable to get room; room already exists with different options',
        ErrorCode.RoomExistsWithDifferentOptions,
        400,
      );
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
   * @param name The unique identifier of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   * @returns A new room object.
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
   * @param name The unique identifier of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   * @param ongoingRelease The promise of an ongoing release operation.
   * @returns A promise that resolves to a room.
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
   * @param name The unique identifier of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   * @param ongoingRelease A promise that resolves when the previous release operation is complete.
   * @param abortController An AbortController to manage the abort signal.
   * @returns A promise that resolves to a new room or rejects if the operation is aborted.
   */
  private async _createAbortableRoomPromise(
    name: string,
    nonce: string,
    options: RoomOptions | undefined,
    ongoingRelease: Promise<void>,
    abortController: AbortController,
  ): Promise<DefaultRoom> {
    // Create a promise that rejects when the abort signal fires
    const abortPromise = new Promise<never>((_, reject) => {
      const abortListener = () => {
        this._logger.debug('Rooms.get(); aborted before init', { roomName: name });
        reject(
          new Ably.ErrorInfo(
            'unable to get room; room released before operation could complete',
            ErrorCode.RoomReleasedBeforeOperationCompleted,
            400,
          ),
        );
      };

      abortController.signal.addEventListener('abort', abortListener, { once: true });
    });

    // Race between the ongoing release and the abort signal
    await Promise.race([ongoingRelease, abortPromise]);

    // If we get here, the release completed without being aborted
    this._logger.debug('Rooms.get(); releasing finished', { roomName: name });
    const room = this._makeRoom(name, nonce, options);
    return room;
  }

  /**
   * Handles release when no room exists.
   * @param name The unique identifier of the room.
   * @param ongoingRelease An ongoing release promise, if any.
   * @returns A promise that resolves when the release operation is complete.
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
   * @param name The unique identifier of the room.
   * @param existingRoom The existing room entry in the map.
   * @param ongoingRelease The promise of an ongoing release operation.
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
   * @param name The unique identifier of the room.
   * @param existingRoom The existing room entry in the map.
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
   * @param name The unique identifier of the room.
   * @param existingRoom The existing room entry in the map.
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
      this._clientIdResolver,
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
