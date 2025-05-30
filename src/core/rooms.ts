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
   *
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
   *
   * @param name The unique identifier of the room.
   */
  release(name: string): Promise<void>;

  /**
   * Get the client options used to create the Chat instance.
   * @returns ChatClientOptions
   */
  get clientOptions(): ChatClientOptions;
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

  /**
   * Constructs a new Rooms instance.
   *
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
  get(name: string, options?: RoomOptions): Promise<Room> {
    this._logger.trace('Rooms.get();', { roomName: name });

    const existing = this._rooms.get(name);
    if (existing) {
      if (!dequal(existing.options, options)) {
        return Promise.reject(new Ably.ErrorInfo('room already exists with different options', 40000, 400));
      }

      this._logger.debug('Rooms.get(); returning existing room', { roomName: name, nonce: existing.nonce });
      return existing.promise;
    }

    const releasing = this._releasing.get(name);
    const nonce = randomId();

    // We're not currently releasing the room, so we just make a new one
    if (!releasing) {
      const room = this._makeRoom(name, nonce, options);
      const entry = {
        promise: Promise.resolve(room),
        nonce: nonce,
        options: options,
      };

      this._rooms.set(name, entry);
      this._logger.debug('Rooms.get(); returning new room', { roomName: name, nonce: room.nonce });
      return entry.promise;
    }

    // The room is currently in the process of being released so, we wait for it to finish
    // we add an abort controller so that if the room is released again whilst we're waiting, we abort the process
    const abortController = new AbortController();
    const roomPromise = new Promise<DefaultRoom>((resolve, reject) => {
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

      releasing
        .then(() => {
          // We aborted before resolution
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
          reject(error as Error);
        });
    });

    this._rooms.set(name, {
      promise: roomPromise,
      options: options,
      nonce: nonce,
      abort: abortController,
    });

    this._logger.debug('Rooms.get(); creating new promise dependent on previous release', { roomName: name });
    return roomPromise;
  }

  /**
   * @inheritDoc
   */
  get clientOptions(): ChatClientOptions {
    return this._clientOptions;
  }

  /**
   * @inheritDoc
   */
  release(name: string): Promise<void> {
    this._logger.trace('Rooms.release();', { roomName: name });

    const existing = this._rooms.get(name);
    const releasing = this._releasing.get(name);

    // If the room doesn't currently exist
    if (!existing) {
      // There's no existing room, but there is a release in progress, so forward that releasing promise
      // to the caller so they can watch that.
      if (releasing) {
        this._logger.debug('Rooms.release(); waiting for previous release call', {
          roomName: name,
        });
        return releasing;
      }

      // If the room is not releasing, there is nothing else to do
      this._logger.debug('Rooms.release(); room does not exist', { roomName: name });
      return Promise.resolve();
    }

    // A release is in progress, but its not for the currently requested room instance
    // ie we called release, then get, then release again
    // so instead of doing another release process, we just abort the current get
    if (releasing) {
      if (existing.abort) {
        this._logger.debug('Rooms.release(); aborting get call', { roomName: name, existingNonce: existing.nonce });
        existing.abort.abort();
        this._rooms.delete(name);
      }

      return releasing;
    }

    // Room doesn't exist and we're not releasing, so its just a regular release operation
    this._rooms.delete(name);
    const releasePromise = existing.promise.then((room) => {
      this._logger.debug('Rooms.release(); releasing room', { roomName: name, nonce: existing.nonce });
      return room.release().then(() => {
        this._logger.debug('Rooms.release(); room released', { roomName: name, nonce: existing.nonce });
        this._releasing.delete(name);
      });
    });

    this._logger.debug('Rooms.release(); creating new release promise', { roomName: name, nonce: existing.nonce });
    this._releasing.set(name, releasePromise);

    return releasePromise;
  }

  /**
   * makes a new room object
   *
   * @param name The unique identifier of the room.
   * @param nonce A random, internal identifier useful for debugging and logging.
   * @param options The options for the room.
   *
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
