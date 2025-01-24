var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { messagesChannelName } from './channel.js';
import { newDiscontinuityEmitter, } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
import EventEmitter from './utils/event-emitter.js';
var OccupancyEvents;
(function (OccupancyEvents) {
    OccupancyEvents["Occupancy"] = "occupancy";
})(OccupancyEvents || (OccupancyEvents = {}));
/**
 * @inheritDoc
 */
export class DefaultOccupancy extends EventEmitter {
    /**
     * Constructs a new `DefaultOccupancy` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager An instance of the ChannelManager.
     * @param chatApi An instance of the ChatApi.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, channelManager, chatApi, logger) {
        super();
        this._discontinuityEmitter = newDiscontinuityEmitter();
        this._roomId = roomId;
        this._channel = this._makeChannel(roomId, channelManager);
        this._chatApi = chatApi;
        this._logger = logger;
    }
    /**
     * Creates the realtime channel for occupancy.
     */
    _makeChannel(roomId, channelManager) {
        const channel = channelManager.get(DefaultOccupancy.channelName(roomId));
        addListenerToChannelWithoutAttach({
            listener: this._internalOccupancyListener.bind(this),
            events: ['[meta]occupancy'],
            channel: channel,
        });
        return channel;
    }
    /**
     * @inheritdoc Occupancy
     */
    subscribe(listener) {
        this._logger.trace('Occupancy.subscribe();');
        this.on(listener);
        return {
            unsubscribe: () => {
                this._logger.trace('Occupancy.unsubscribe();');
                this.off(listener);
            },
        };
    }
    /**
     * @inheritdoc Occupancy
     */
    unsubscribeAll() {
        this._logger.trace('Occupancy.unsubscribeAll();');
        this.off();
    }
    /**
     * @inheritdoc Occupancy
     */
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Occupancy.get();');
            return this._chatApi.getOccupancy(this._roomId);
        });
    }
    /**
     * @inheritdoc Occupancy
     */
    get channel() {
        return this._channel;
    }
    /**
     * An internal listener that listens for occupancy events from the underlying channel and translates them into
     * occupancy events for the public API.
     */
    _internalOccupancyListener(message) {
        if (typeof message.data !== 'object') {
            this._logger.error('invalid occupancy event received; data is not an object', message);
            return;
        }
        const { metrics } = message.data;
        if (metrics === undefined) {
            this._logger.error('invalid occupancy event received; metrics is missing', message);
            return;
        }
        const { connections, presenceMembers } = metrics;
        if (connections === undefined) {
            this._logger.error('invalid occupancy event received; connections is missing', message);
            return;
        }
        if (typeof connections !== 'number' || !Number.isInteger(connections)) {
            this._logger.error('invalid occupancy event received; connections is not a number', message);
            return;
        }
        if (presenceMembers === undefined) {
            this._logger.error('invalid occupancy event received; presenceMembers is missing', message);
            return;
        }
        if (typeof presenceMembers !== 'number' || !Number.isInteger(presenceMembers)) {
            this._logger.error('invalid occupancy event received; presenceMembers is not a number', message);
            return;
        }
        this.emit(OccupancyEvents.Occupancy, {
            connections: connections,
            presenceMembers: presenceMembers,
        });
    }
    onDiscontinuity(listener) {
        this._logger.trace('Occupancy.onDiscontinuity();');
        this._discontinuityEmitter.on(listener);
        return {
            off: () => {
                this._discontinuityEmitter.off(listener);
            },
        };
    }
    discontinuityDetected(reason) {
        this._logger.warn('Occupancy.discontinuityDetected();', { reason });
        this._discontinuityEmitter.emit('discontinuity', reason);
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode() {
        return ErrorCodes.OccupancyAttachmentFailed;
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode() {
        return ErrorCodes.OccupancyDetachmentFailed;
    }
    /**
     * Merges the channel options for the room with the ones required for presence.
     *
     * @param roomOptions The room options to merge for.
     * @returns A function that merges the channel options for the room with the ones required for presence.
     */
    static channelOptionMerger() {
        return (options) => (Object.assign(Object.assign({}, options), { params: Object.assign(Object.assign({}, options.params), { occupancy: 'metrics' }) }));
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
//# sourceMappingURL=occupancy.js.map