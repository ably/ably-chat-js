import * as Ably from 'ably';
import { dequal } from 'dequal';
import { ChatApi } from './chat-api.js';
import { ErrorCodes } from './errors.js';
import { randomId } from './id.js';
import { DefaultRoom } from './room.js';
/**
 * Manages the chat rooms.
 */
export class DefaultRooms {
    /**
     * Constructs a new Rooms instance.
     *
     * @param realtime An instance of the Ably Realtime client.
     * @param clientOptions The client options from the chat instance.
     * @param logger An instance of the Logger.
     */
    constructor(realtime, clientOptions, logger) {
        this._rooms = new Map();
        this._releasing = new Map();
        this._realtime = realtime;
        this._chatApi = new ChatApi(realtime, logger);
        this._clientOptions = clientOptions;
        this._logger = logger;
    }
    /**
     * @inheritDoc
     */
    get(roomId, options) {
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
        const roomPromise = new Promise((resolve, reject) => {
            const abortListener = () => {
                this._logger.debug('Rooms.get(); aborted before init', { roomId });
                reject(new Ably.ErrorInfo('room released before get operation could complete', ErrorCodes.RoomReleasedBeforeOperationCompleted, 400));
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
                .catch((error) => {
                reject(error);
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
    get clientOptions() {
        return this._clientOptions;
    }
    /**
     * @inheritDoc
     */
    release(roomId) {
        this._logger.trace('Rooms.release();', { roomId });
        const existing = this._rooms.get(roomId);
        const releasing = this._releasing.get(roomId);
        // If the room doesn't currently exist
        if (!existing) {
            // There's no existing room, but there is a release in progress, so forward that releasing promise
            // to the caller so they can watch that.
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
            return room.release().then(() => {
                this._logger.debug('Rooms.release(); room released', { roomId, nonce: existing.nonce });
                this._releasing.delete(roomId);
            });
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
    _makeRoom(roomId, nonce, options) {
        return new DefaultRoom(roomId, nonce, options, this._realtime, this._chatApi, this._logger);
    }
}
//# sourceMappingURL=rooms.js.map