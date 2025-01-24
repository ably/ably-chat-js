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
import cloneDeep from 'lodash.clonedeep';
import { ChannelManager } from './channel-manager.js';
import { DefaultMessages } from './messages.js';
import { DefaultOccupancy } from './occupancy.js';
import { DefaultPresence } from './presence.js';
import { RoomLifecycleManager } from './room-lifecycle-manager.js';
import { validateRoomOptions } from './room-options.js';
import { DefaultRoomReactions } from './room-reactions.js';
import { DefaultRoomLifecycle, } from './room-status.js';
import { DefaultTyping } from './typing.js';
export class DefaultRoom {
    /**
     * Constructs a new Room instance.
     *
     * @param roomId The unique identifier of the room.
     * @param nonce A random identifier for the room instance, useful in debugging and logging.
     * @param options The options for the room.
     * @param realtime An instance of the Ably Realtime client.
     * @param chatApi An instance of the ChatApi.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, nonce, options, realtime, chatApi, logger) {
        validateRoomOptions(options);
        this._nonce = nonce;
        logger.debug('Room();', { roomId, options, nonce: this._nonce });
        this._roomId = roomId;
        this._options = options;
        this._chatApi = chatApi;
        this._logger = logger;
        this._lifecycle = new DefaultRoomLifecycle(roomId, logger);
        const channelManager = this._getChannelManager(options, realtime, logger);
        // Setup features
        this._messages = new DefaultMessages(roomId, channelManager, this._chatApi, realtime.auth.clientId, logger);
        const features = [this._messages];
        if (options.presence) {
            this._logger.debug('enabling presence on room', { roomId });
            this._presence = new DefaultPresence(roomId, channelManager, realtime.auth.clientId, logger);
            features.push(this._presence);
        }
        if (options.typing) {
            this._logger.debug('enabling typing on room', { roomId });
            this._typing = new DefaultTyping(roomId, options.typing, channelManager, realtime.auth.clientId, logger);
            features.push(this._typing);
        }
        if (options.reactions) {
            this._logger.debug('enabling reactions on room', { roomId });
            this._reactions = new DefaultRoomReactions(roomId, channelManager, realtime.auth.clientId, logger);
            features.push(this._reactions);
        }
        if (options.occupancy) {
            this._logger.debug('enabling occupancy on room', { roomId });
            this._occupancy = new DefaultOccupancy(roomId, channelManager, this._chatApi, logger);
            features.push(this._occupancy);
        }
        this._lifecycleManager = new RoomLifecycleManager(this._lifecycle, [...features].reverse(), this._logger, 5000);
        // Setup a finalization function to clean up resources
        let finalized = false;
        this._finalizer = () => __awaiter(this, void 0, void 0, function* () {
            // Cycle the channels in the feature and release them from the realtime client
            if (finalized) {
                this._logger.debug('Room.finalizer(); already finalized');
                return;
            }
            yield this._lifecycleManager.release();
            for (const feature of features) {
                channelManager.release(feature.channel.name);
            }
            finalized = true;
        });
    }
    /**
     * Gets the channel manager for the room, which handles merging channel options together and creating channels.
     *
     * @param options The room options.
     * @param realtime  An instance of the Ably Realtime client.
     * @param logger An instance of the Logger.
     */
    _getChannelManager(options, realtime, logger) {
        const manager = new ChannelManager(realtime, logger);
        if (options.occupancy) {
            manager.mergeOptions(DefaultOccupancy.channelName(this._roomId), DefaultOccupancy.channelOptionMerger());
        }
        if (options.presence) {
            manager.mergeOptions(DefaultPresence.channelName(this._roomId), DefaultPresence.channelOptionMerger(options));
        }
        return manager;
    }
    /**
     * @inheritdoc Room
     */
    get roomId() {
        return this._roomId;
    }
    /**
     * @inheritDoc Room
     */
    options() {
        return cloneDeep(this._options);
    }
    /**
     * @inheritdoc Room
     */
    get messages() {
        return this._messages;
    }
    /**
     * @inheritdoc Room
     */
    get presence() {
        if (!this._presence) {
            this._logger.error('Presence is not enabled for this room');
            throw new Ably.ErrorInfo('Presence is not enabled for this room', 40000, 400);
        }
        return this._presence;
    }
    /**
     * @inheritdoc Room
     */
    get reactions() {
        if (!this._reactions) {
            this._logger.error('Reactions are not enabled for this room');
            throw new Ably.ErrorInfo('Reactions are not enabled for this room', 40000, 400);
        }
        return this._reactions;
    }
    /**
     * @inheritdoc Room
     */
    get typing() {
        if (!this._typing) {
            this._logger.error('Typing is not enabled for this room');
            throw new Ably.ErrorInfo('Typing is not enabled for this room', 40000, 400);
        }
        return this._typing;
    }
    /**
     * @inheritdoc Room
     */
    get occupancy() {
        if (!this._occupancy) {
            this._logger.error('Occupancy is not enabled for this room');
            throw new Ably.ErrorInfo('Occupancy is not enabled for this room', 40000, 400);
        }
        return this._occupancy;
    }
    /**
     * @inheritdoc Room
     */
    get status() {
        return this._lifecycle.status;
    }
    /**
     * @inheritdoc Room
     */
    get error() {
        return this._lifecycle.error;
    }
    /**
     * @inheritdoc Room
     */
    onStatusChange(listener) {
        return this._lifecycle.onChange(listener);
    }
    /**
     * @inheritdoc Room
     */
    offAllStatusChange() {
        this._lifecycle.offAll();
    }
    /**
     * @inheritdoc Room
     */
    attach() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Room.attach();', { nonce: this._nonce, roomId: this._roomId });
            return this._lifecycleManager.attach();
        });
    }
    /**
     * @inheritdoc Room
     */
    detach() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Room.detach();', { nonce: this._nonce, roomId: this._roomId });
            return this._lifecycleManager.detach();
        });
    }
    /**
     * Releases resources associated with the room.
     * We guarantee that this does not throw an error.
     */
    release() {
        this._logger.trace('Room.release();', { nonce: this._nonce, roomId: this._roomId });
        return this._finalizer();
    }
    /**
     * A random identifier for the room instance, useful in debugging and logging.
     *
     * @returns The nonce.
     */
    get nonce() {
        return this._nonce;
    }
    /**
     * @internal
     *
     * Returns the rooms lifecycle.
     */
    get lifecycle() {
        return this._lifecycle;
    }
}
//# sourceMappingURL=room.js.map