import * as Ably from 'ably';
import { dequal } from 'dequal';

import { ChatClient } from '../../core/chat-client.js';
import { ErrorCode } from '../../core/errors.js';
import { Logger } from '../../core/logger.js';
import { Room } from '../../core/room.js';
import { RoomOptions } from '../../core/room-options.js';

/**
 * Reference counting entry for a room.
 */
interface RoomRefCountEntry {
  count: number;
  roomName: string;
  options?: RoomOptions;
  resolvedRoom?: Room;
  resolutionError?: Ably.ErrorInfo;
  pendingRelease?: ReturnType<typeof setTimeout>;
}

/**
 * Normalizes an array item by sorting the keys of the object and recursively sorting the items in the array.
 * @param item The item to normalize.
 * @returns The normalized item.
 */
const normalizeArrayItem = (item: unknown): unknown => {
  if (item === null || typeof item !== 'object') {
    return item;
  }
  if (Array.isArray(item)) {
    return item.sort().map((nestedItem) => normalizeArrayItem(nestedItem));
  }
  // For objects in arrays, sort keys
  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(item as Record<string, unknown>).sort();
  for (const objKey of keys) {
    sortedObj[objKey] = normalizeArrayItem((item as Record<string, unknown>)[objKey]);
  }
  return sortedObj;
};

/**
 * Replacer function for JSON.stringify that normalizes values to ensure consistent serialization.
 * Recursively sorts object keys and array items for deterministic output.
 * @param key The key being processed.
 * @param value The value being processed.
 * @returns The normalized value.
 */
const roomKeyReplacer = (key: string, value: unknown): unknown => {
  // Handle undefined values consistently
  if (value === undefined) {
    return undefined;
  }

  // Handle null or non-object values
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Handle arrays - sort the items and recursively normalize
  if (Array.isArray(value)) {
    return value.sort().map((item) => normalizeArrayItem(item));
  }

  // Handle objects - sort the keys
  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const objKey of keys) {
    sortedObj[objKey] = (value as Record<string, unknown>)[objKey];
  }
  return sortedObj;
};

/**
 * Creates a unique key for a room based on name and options.
 * Ensures that objects with the same properties but different key order produce the same key.
 * @param roomName The name of the room.
 * @param options The room options.
 * @returns A unique string key for the room.
 */
const createRoomKey = (roomName: string, options?: RoomOptions): string =>
  JSON.stringify({ roomName, options }, roomKeyReplacer);

/**
 * Reference counting manager for rooms within a ChatClientProvider.
 * This manages attach/release lifecycle based on reference counts.
 */
export class RoomReferenceManager {
  private readonly _refCounts = new Map<string, RoomRefCountEntry>();
  private readonly _client: ChatClient;
  private readonly _logger: Logger;
  private readonly _releaseDelayMs = 100; // Delay before actually releasing to allow for abort
  private readonly _pendingReleases = new Map<string, Promise<void>>(); // Track pending releases by room name

  constructor(client: ChatClient, logger: Logger) {
    this._client = client;
    this._logger = logger;
  }

  /**
   * Get the client this manager is associated with.
   * @returns The chat client.
   */
  get client(): ChatClient {
    return this._client;
  }

  /**
   * Increment reference count for a room. Attaches on first reference.
   * @param roomName The name of the room.
   * @param options The room options.
   * @returns A promise that resolves to the room instance.
   */
  async addReference(roomName: string, options?: RoomOptions): Promise<Room> {
    this._logger.trace('RoomReferenceManager.addReference();');
    const key = createRoomKey(roomName, options);
    const existing = this._refCounts.get(key);

    if (existing) {
      // If there's a pending release, abort it
      if (existing.pendingRelease) {
        clearTimeout(existing.pendingRelease);
        existing.pendingRelease = undefined;
        this._logger.debug('RoomReferenceManager.addReference(); aborted pending release', {
          roomName,
          options,
        });
      }

      existing.count++;
      this._logger.debug('RoomReferenceManager.addReference(); incremented ref count', {
        roomName,
        options,
        count: existing.count,
      });

      // Always return the resolved room from the existing reference
      // We should never call client.rooms.get() again as that would cause
      // "room already exists with different options" errors
      if (existing.resolvedRoom) {
        return existing.resolvedRoom;
      }

      // If the room hasn't resolved yet, wait for it
      // This shouldn't happen in normal circumstances since we await the room
      // creation below, but it's a safety net
      // We'll run a promise that checks every 100ms to see if the room has resolved
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (existing.resolvedRoom) {
            clearInterval(interval);
            resolve(existing.resolvedRoom);
          } else if (existing.resolutionError) {
            clearInterval(interval);
            reject(existing.resolutionError);
          }
        }, 100);
      });
    }

    // Check if there's a pending release for this room name (regardless of options)
    const pendingRelease = this._pendingReleases.get(roomName);
    if (pendingRelease) {
      this._logger.debug('RoomReferenceManager.addReference(); waiting for pending release to complete', {
        roomName,
        options,
      });

      try {
        await pendingRelease;
      } catch (error) {
        this._logger.debug('RoomReferenceManager.addReference(); pending release failed, continuing', {
          roomName,
          options,
          error,
        });
      }
    }

    // Check if there's already a room with the same name but different options
    const existingWithDifferentOptions = [...this._refCounts.values()].find(
      (entry) => entry.roomName === roomName && !dequal(entry.options, options),
    );

    if (existingWithDifferentOptions) {
      // Only allow different options if:
      // 1. There's a pending release for the existing room, OR
      // 2. The reference count is 0 (meaning it's scheduled for release)
      const hasPendingRelease = existingWithDifferentOptions.pendingRelease !== undefined;
      const hasZeroRefCount = existingWithDifferentOptions.count <= 0;

      if (!hasPendingRelease && !hasZeroRefCount) {
        // Room is actively being used with different options - throw an error
        throw new Ably.ErrorInfo(
          `unable to get room reference; room "${roomName}" is already in use with different options`,
          ErrorCode.RoomExistsWithDifferentOptions,
          400,
        );
      }

      this._logger.debug(
        'RoomReferenceManager.addReference(); found existing room with different options, releasing it first',
        {
          roomName,
          newOptions: options,
          existingOptions: existingWithDifferentOptions.options,
          hasPendingRelease,
          hasZeroRefCount,
        },
      );

      // Cancel any pending release for the existing room
      if (existingWithDifferentOptions.pendingRelease) {
        clearTimeout(existingWithDifferentOptions.pendingRelease);
        existingWithDifferentOptions.pendingRelease = undefined;
      }

      // Remove the existing room reference immediately
      const existingKey = createRoomKey(roomName, existingWithDifferentOptions.options);
      this._refCounts.delete(existingKey);

      // Create and track the release promise
      const releasePromise = this._client.rooms
        .release(roomName)
        .catch((error: unknown) => {
          this._logger.debug('RoomReferenceManager.addReference(); release of existing room failed', {
            roomName,
            error,
          });
        })
        .finally(() => {
          // Remove the pending release tracking when done
          this._pendingReleases.delete(roomName);
        });

      // Track the pending release
      this._pendingReleases.set(roomName, releasePromise);

      // Wait for the release to complete
      try {
        await releasePromise;
      } catch (error) {
        this._logger.debug('RoomReferenceManager.addReference(); release of existing room failed, continuing', {
          roomName,
          error,
        });
      }
    }

    // First reference - create entry and attach
    const entry: RoomRefCountEntry = {
      count: 1,
      roomName,
      options,
    };
    this._refCounts.set(key, entry);

    this._logger.debug('RoomReferenceManager.addReference(); first reference, attaching room', {
      roomName,
      options,
    });

    try {
      const room = await this._client.rooms.get(roomName, options);
      entry.resolvedRoom = room;

      // Attach the room on first reference
      void room.attach().catch((error: unknown) => {
        this._logger.error('RoomReferenceManager.addReference(); error attaching room', {
          roomName,
          options,
          error,
        });
      });

      return room;
    } catch (error: unknown) {
      // If room creation failed, clean up the entry, but also set the resolution error
      entry.resolutionError = error as Ably.ErrorInfo;
      this._refCounts.delete(key);
      this._logger.error('RoomReferenceManager.addReference(); error creating room', {
        roomName,
        options,
        error,
      });
      throw error;
    }
  }

  /**
   * Decrement reference count for a room. Releases on last reference after a delay.
   * @param roomName The name of the room.
   * @param options The room options.
   */
  removeReference(roomName: string, options?: RoomOptions): void {
    this._logger.trace('RoomReferenceManager.removeReference();');
    const key = createRoomKey(roomName, options);
    const existing = this._refCounts.get(key);

    if (!existing) {
      this._logger.debug('RoomReferenceManager.removeReference(); no existing reference found', {
        roomName,
        options,
      });
      return;
    }

    existing.count--;
    this._logger.debug('RoomReferenceManager.removeReference(); decremented ref count', {
      roomName,
      options,
      count: existing.count,
    });

    if (existing.count <= 0) {
      // Schedule release after a delay to allow for abort
      this._logger.debug('RoomReferenceManager.removeReference(); scheduling delayed release', {
        roomName,
        options,
        delayMs: this._releaseDelayMs,
      });

      existing.pendingRelease = setTimeout(() => {
        // Double-check that the entry still exists and should be released
        const currentEntry = this._refCounts.get(key);
        if (currentEntry && currentEntry.count <= 0) {
          this._refCounts.delete(key);
          this._logger.debug('RoomReferenceManager.removeReference(); executing delayed release', {
            roomName,
            options,
          });

          // Create a promise for the release operation and track it
          const releasePromise = this._client.rooms
            .release(roomName)
            .catch((error: unknown) => {
              this._logger.debug('RoomReferenceManager.removeReference(); release failed', {
                roomName,
                options,
                error,
              });
            })
            .finally(() => {
              // Remove the pending release tracking when done
              this._pendingReleases.delete(roomName);
            });

          // Track the pending release by room name
          this._pendingReleases.set(roomName, releasePromise);
        }
      }, this._releaseDelayMs);
    }
  }

  getReferenceCount(roomName: string, options?: RoomOptions): number {
    this._logger.trace('RoomReferenceManager.getReferenceCount();');
    const key = createRoomKey(roomName, options);
    return this._refCounts.get(key)?.count ?? 0;
  }
}
