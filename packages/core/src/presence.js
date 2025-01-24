var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as Ably from 'ably';
import { messagesChannelName } from './channel.js';
import { newDiscontinuityEmitter, } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { PresenceEvents } from './events.js';
import { addListenerToChannelPresenceWithoutAttach } from './realtime-extensions.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * @inheritDoc
 */
export class DefaultPresence extends EventEmitter {
    /**
     * Constructs a new `DefaultPresence` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager The channel manager to use for creating the presence channel.
     * @param clientId The client ID, attached to presences messages as an identifier of the sender.
     * A channel can have multiple connections using the same clientId.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, channelManager, clientId, logger) {
        super();
        this._discontinuityEmitter = newDiscontinuityEmitter();
        /**
         * Method to handle and emit presence events
         * @param member - PresenceMessage ably-js object
         * @returns void - Emits a transformed event to all subscribers, or upon failure,
         * the promise will be rejected with an {@link ErrorInfo} object which explains the error.
         */
        this.subscribeToEvents = (member) => {
            var _a;
            try {
                // Ably-js never emits the 'absent' event, so we can safely ignore it here.
                this.emit(member.action, {
                    action: member.action,
                    clientId: member.clientId,
                    timestamp: member.timestamp,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    data: (_a = member.data) === null || _a === void 0 ? void 0 : _a.userCustomData,
                });
            }
            catch (error) {
                this._logger.error(`unable to handle presence event: not a valid presence event`, { action: member.action });
                throw new Ably.ErrorInfo(`unable to handle ${member.action} presence event: not a valid presence event`, 50000, 500, error.message);
            }
        };
        this._channel = this._makeChannel(roomId, channelManager);
        this._clientId = clientId;
        this._logger = logger;
    }
    /**
     * Creates the realtime channel for presence.
     */
    _makeChannel(roomId, channelManager) {
        const channel = channelManager.get(DefaultPresence.channelName(roomId));
        addListenerToChannelPresenceWithoutAttach({
            listener: this.subscribeToEvents.bind(this),
            channel: channel,
        });
        return channel;
    }
    /**
     * Get the underlying Ably realtime channel used for presence in this chat room.
     * @returns The realtime channel.
     */
    get channel() {
        return this._channel;
    }
    /**
     * @inheritDoc
     */
    get(params) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Presence.get()', { params });
            const userOnPresence = yield this._channel.presence.get(params);
            // ably-js never emits the 'absent' event, so we can safely ignore it here.
            return userOnPresence.map((user) => {
                var _a;
                return ({
                    clientId: user.clientId,
                    action: user.action,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    data: (_a = user.data) === null || _a === void 0 ? void 0 : _a.userCustomData,
                    updatedAt: user.timestamp,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    extras: user.extras,
                });
            });
        });
    }
    /**
     * @inheritDoc
     */
    isUserPresent(clientId) {
        return __awaiter(this, void 0, void 0, function* () {
            const presenceSet = yield this._channel.presence.get({ clientId: clientId });
            return presenceSet.length > 0;
        });
    }
    /**
     * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
     * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
     * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
     */
    enter(data) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`Presence.enter()`, { data });
            const presenceEventToSend = {
                userCustomData: data,
            };
            return this._channel.presence.enterClient(this._clientId, presenceEventToSend);
        });
    }
    /**
     * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
     * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
     * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
     */
    update(data) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`Presence.update()`, { data });
            const presenceEventToSend = {
                userCustomData: data,
            };
            return this._channel.presence.updateClient(this._clientId, presenceEventToSend);
        });
    }
    /**
     * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
     * @param {PresenceData} data - The users data, a JSON serializable object that will be sent to all subscribers.
     * @returns {Promise<void>} or upon failure, the promise will be rejected with an {@link ErrorInfo} object which explains the error.
     */
    leave(data) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`Presence.leave()`, { data });
            const presenceEventToSend = {
                userCustomData: data,
            };
            return this._channel.presence.leaveClient(this._clientId, presenceEventToSend);
        });
    }
    subscribe(listenerOrEvents, listener) {
        this._logger.trace('Presence.subscribe(); listenerOrEvents', { listenerOrEvents });
        if (!listenerOrEvents && !listener) {
            this._logger.error('could not subscribe to presence; invalid arguments');
            throw new Ably.ErrorInfo('could not subscribe listener: invalid arguments', 40000, 400);
        }
        // Add listener to all events
        if (listener) {
            this.on(listenerOrEvents, listener);
            return {
                unsubscribe: () => {
                    this._logger.trace('Presence.unsubscribe();', { events: listenerOrEvents });
                    this.off(listener);
                },
            };
        }
        else {
            this.on(listenerOrEvents);
            return {
                unsubscribe: () => {
                    this._logger.trace('Presence.unsubscribe();');
                    this.off(listenerOrEvents);
                },
            };
        }
    }
    /**
     * Unsubscribe all listeners from all presence events.
     */
    unsubscribeAll() {
        this._logger.trace('Presence.unsubscribeAll()');
        this.off();
    }
    onDiscontinuity(listener) {
        this._logger.trace('Presence.onDiscontinuity();');
        this._discontinuityEmitter.on(listener);
        return {
            off: () => {
                this._discontinuityEmitter.off(listener);
            },
        };
    }
    discontinuityDetected(reason) {
        this._logger.warn('Presence.discontinuityDetected();', { reason });
        this._discontinuityEmitter.emit('discontinuity', reason);
    }
    /**
     * @inheritDoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode() {
        return ErrorCodes.PresenceAttachmentFailed;
    }
    /**
     * @inheritDoc
     */
    get detachmentErrorCode() {
        return ErrorCodes.PresenceDetachmentFailed;
    }
    /**
     * Merges the channel options for the room with the ones required for presence.
     *
     * @param roomOptions The room options to merge for.
     * @returns A function that merges the channel options for the room with the ones required for presence.
     */
    static channelOptionMerger(roomOptions) {
        return (options) => {
            var _a, _b;
            const channelModes = ['PUBLISH', 'SUBSCRIBE'];
            if (((_a = roomOptions.presence) === null || _a === void 0 ? void 0 : _a.enter) === undefined || roomOptions.presence.enter) {
                channelModes.push('PRESENCE');
            }
            if (((_b = roomOptions.presence) === null || _b === void 0 ? void 0 : _b.subscribe) === undefined || roomOptions.presence.subscribe) {
                channelModes.push('PRESENCE_SUBSCRIBE');
            }
            return Object.assign(Object.assign({}, options), { modes: channelModes });
        };
    }
    /**
     * Returns the channel name for the presence channel.
     *
     * @param roomId The unique identifier of the room.
     * @returns The channel name for the presence channel.
     */
    static channelName(roomId) {
        return messagesChannelName(roomId);
    }
}
//# sourceMappingURL=presence.js.map