import * as Ably from 'ably';
import { newDiscontinuityEmitter, } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { RoomReactionEvents } from './events.js';
import { parseReaction } from './reaction-parser.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * @inheritDoc
 */
export class DefaultRoomReactions extends EventEmitter {
    /**
     * Constructs a new `DefaultRoomReactions` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager The ChannelManager instance.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, channelManager, clientId, logger) {
        super();
        this._discontinuityEmitter = newDiscontinuityEmitter();
        // parses reactions from realtime channel into Reaction objects and forwards them to the EventEmitter
        this._forwarder = (inbound) => {
            const reaction = this._parseNewReaction(inbound, this._clientId);
            if (!reaction) {
                // ignore non-reactions
                return;
            }
            this.emit(RoomReactionEvents.Reaction, reaction);
        };
        this._channel = this._makeChannel(roomId, channelManager);
        this._clientId = clientId;
        this._logger = logger;
    }
    /**
     * Creates the realtime channel for room reactions.
     */
    _makeChannel(roomId, channelManager) {
        const channel = channelManager.get(`${roomId}::$chat::$reactions`);
        addListenerToChannelWithoutAttach({
            listener: this._forwarder.bind(this),
            events: [RoomReactionEvents.Reaction],
            channel: channel,
        });
        return channel;
    }
    /**
     * @inheritDoc Reactions
     */
    send(params) {
        this._logger.trace('RoomReactions.send();', params);
        const { type, metadata, headers } = params;
        if (!type) {
            return Promise.reject(new Ably.ErrorInfo('unable to send reaction; type not set and it is required', 40001, 400));
        }
        const payload = {
            type: type,
            metadata: metadata !== null && metadata !== void 0 ? metadata : {},
        };
        const realtimeMessage = {
            name: RoomReactionEvents.Reaction,
            data: payload,
            extras: {
                headers: headers !== null && headers !== void 0 ? headers : {},
            },
        };
        return this._channel.publish(realtimeMessage);
    }
    /**
     * @inheritDoc Reactions
     */
    subscribe(listener) {
        this._logger.trace(`RoomReactions.subscribe();`);
        this.on(listener);
        return {
            unsubscribe: () => {
                this._logger.trace('RoomReactions.unsubscribe();');
                this.off(listener);
            },
        };
    }
    /**
     * @inheritDoc Reactions
     */
    unsubscribeAll() {
        this._logger.trace(`RoomReactions.unsubscribeAll();`);
        this.off();
    }
    get channel() {
        return this._channel;
    }
    _parseNewReaction(inbound, clientId) {
        try {
            return parseReaction(inbound, clientId);
        }
        catch (error) {
            this._logger.error(`failed to parse incoming reaction;`, { inbound, error: error });
        }
    }
    discontinuityDetected(reason) {
        this._logger.warn('RoomReactions.discontinuityDetected();', { reason });
        this._discontinuityEmitter.emit('discontinuity', reason);
    }
    onDiscontinuity(listener) {
        this._logger.trace('RoomReactions.onDiscontinuity();');
        this._discontinuityEmitter.on(listener);
        return {
            off: () => {
                this._discontinuityEmitter.off(listener);
            },
        };
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode() {
        return ErrorCodes.ReactionsAttachmentFailed;
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode() {
        return ErrorCodes.ReactionsDetachmentFailed;
    }
}
//# sourceMappingURL=room-reactions.js.map