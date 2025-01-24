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
import { ChatMessageActions, MessageEvents, RealtimeMessageNames } from './events.js';
import { DefaultMessage } from './message.js';
import { parseMessage } from './message-parser.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * Mapping of chat message actions to message events.
 */
const MessageActionsToEventsMap = new Map([
    [ChatMessageActions.MessageCreate, MessageEvents.Created],
    [ChatMessageActions.MessageUpdate, MessageEvents.Updated],
    [ChatMessageActions.MessageDelete, MessageEvents.Deleted],
]);
/**
 * The order in which results should be returned when performing a paginated query (e.g. message history).
 */
export var OrderBy;
(function (OrderBy) {
    /**
     * Return results in ascending order (oldest first).
     */
    OrderBy["OldestFirst"] = "oldestFirst";
    /**
     * Return results in descending order (newest first).
     */
    OrderBy["NewestFirst"] = "newestFirst";
})(OrderBy || (OrderBy = {}));
/**
 * @inheritDoc
 */
export class DefaultMessages extends EventEmitter {
    /**
     * Constructs a new `DefaultMessages` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager An instance of the ChannelManager.
     * @param chatApi An instance of the ChatApi.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, channelManager, chatApi, clientId, logger) {
        super();
        this._discontinuityEmitter = newDiscontinuityEmitter();
        this._roomId = roomId;
        this._channel = this._makeChannel(roomId, channelManager);
        this._chatApi = chatApi;
        this._clientId = clientId;
        this._logger = logger;
        this._listenerSubscriptionPoints = new Map();
    }
    /**
     * Creates the realtime channel for messages.
     */
    _makeChannel(roomId, channelManager) {
        const channel = channelManager.get(messagesChannelName(roomId));
        addListenerToChannelWithoutAttach({
            listener: this._processEvent.bind(this),
            events: [RealtimeMessageNames.ChatMessage],
            channel: channel,
        });
        // Handles the case where channel attaches and resume state is false. This can happen when the channel is first attached,
        // or when the channel is reattached after a detach. In both cases, we reset the subscription points for all listeners.
        channel.on('attached', (message) => {
            this._handleAttach(message.resumed);
        });
        // Handles the case where an update message is received from a channel after a detach and reattach.
        channel.on('update', (message) => {
            if (message.current === 'attached' && message.previous === 'attached') {
                this._handleAttach(message.resumed);
            }
        });
        return channel;
    }
    /**
     * @inheritdoc Messages
     */
    _getBeforeSubscriptionStart(listener, params) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`DefaultSubscriptionManager.getBeforeSubscriptionStart();`);
            const subscriptionPoint = this._listenerSubscriptionPoints.get(listener);
            if (subscriptionPoint === undefined) {
                this._logger.error(`DefaultSubscriptionManager.getBeforeSubscriptionStart(); listener has not been subscribed yet`);
                throw new Ably.ErrorInfo('cannot query history; listener has not been subscribed yet', 40000, 400);
            }
            // Get the subscription point of the listener
            const subscriptionPointParams = yield subscriptionPoint;
            // Query messages from the subscription point to the start of the time window
            return this._chatApi.getMessages(this._roomId, Object.assign(Object.assign(Object.assign({}, params), { orderBy: OrderBy.NewestFirst }), subscriptionPointParams));
        });
    }
    /**
     * Handle the case where the channel experiences a detach and reattaches.
     */
    _handleAttach(fromResume) {
        this._logger.trace(`DefaultSubscriptionManager.handleAttach();`);
        // Do nothing if we have resumed as there is no discontinuity in the message stream
        if (fromResume)
            return;
        // Reset subscription points for all listeners
        const newSubscriptionStartResolver = this._subscribeAtChannelAttach();
        for (const [listener] of this._listenerSubscriptionPoints.entries()) {
            this._listenerSubscriptionPoints.set(listener, newSubscriptionStartResolver);
        }
    }
    /**
     * Create a promise that resolves with the attachSerial of the channel or the serial of the latest message.
     */
    _resolveSubscriptionStart() {
        return __awaiter(this, void 0, void 0, function* () {
            const channelWithProperties = this._getChannelProperties();
            // If we are attached, we can resolve with the channelSerial
            if (channelWithProperties.state === 'attached') {
                if (channelWithProperties.properties.channelSerial) {
                    return { fromSerial: channelWithProperties.properties.channelSerial };
                }
                this._logger.error(`DefaultSubscriptionManager.handleAttach(); channelSerial is undefined`);
                throw new Ably.ErrorInfo('channel is attached, but channelSerial is not defined', 40000, 400);
            }
            return this._subscribeAtChannelAttach();
        });
    }
    _getChannelProperties() {
        // Get the attachSerial from the channel properties
        return this._channel;
    }
    _subscribeAtChannelAttach() {
        return __awaiter(this, void 0, void 0, function* () {
            const channelWithProperties = this._getChannelProperties();
            return new Promise((resolve, reject) => {
                // Check if the state is now attached
                if (channelWithProperties.state === 'attached') {
                    // Get the attachSerial from the channel properties
                    // AttachSerial should always be defined at this point, but we check just in case
                    this._logger.debug('Messages._subscribeAtChannelAttach(); channel is attached already, using attachSerial', {
                        attachSerial: channelWithProperties.properties.attachSerial,
                    });
                    if (channelWithProperties.properties.attachSerial) {
                        resolve({ fromSerial: channelWithProperties.properties.attachSerial });
                    }
                    else {
                        this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
                        reject(new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400));
                    }
                }
                channelWithProperties.once('attached', () => {
                    // Get the attachSerial from the channel properties
                    // AttachSerial should always be defined at this point, but we check just in case
                    this._logger.debug('Messages._subscribeAtChannelAttach(); channel is now attached, using attachSerial', {
                        attachSerial: channelWithProperties.properties.attachSerial,
                    });
                    if (channelWithProperties.properties.attachSerial) {
                        resolve({ fromSerial: channelWithProperties.properties.attachSerial });
                    }
                    else {
                        this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
                        reject(new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400));
                    }
                });
            });
        });
    }
    /**
     * @inheritdoc Messages
     */
    get channel() {
        return this._channel;
    }
    /**
     * @inheritdoc Messages
     */
    get(options) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Messages.query();');
            return this._chatApi.getMessages(this._roomId, options);
        });
    }
    /**
     * @inheritdoc Messages
     */
    send(params) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Messages.send();', { params });
            const { text, metadata, headers } = params;
            const response = yield this._chatApi.sendMessage(this._roomId, { text, headers, metadata });
            return new DefaultMessage(response.serial, this._clientId, this._roomId, text, metadata !== null && metadata !== void 0 ? metadata : {}, headers !== null && headers !== void 0 ? headers : {}, ChatMessageActions.MessageCreate, response.serial, new Date(response.createdAt), new Date(response.createdAt));
        });
    }
    update(message, update, details) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            this._logger.trace('Messages.update();', { message, update, details });
            const response = yield this._chatApi.updateMessage(this._roomId, message.serial, Object.assign(Object.assign({}, details), { message: update }));
            const updatedMessage = new DefaultMessage(message.serial, message.clientId, this._roomId, update.text, (_a = update.metadata) !== null && _a !== void 0 ? _a : {}, (_b = update.headers) !== null && _b !== void 0 ? _b : {}, ChatMessageActions.MessageUpdate, response.version, new Date(message.createdAt), new Date(response.timestamp), {
                clientId: this._clientId,
                description: details === null || details === void 0 ? void 0 : details.description,
                metadata: details === null || details === void 0 ? void 0 : details.metadata,
            });
            this._logger.debug('Messages.update(); message update successfully', { updatedMessage });
            return updatedMessage;
        });
    }
    /**
     * @inheritdoc Messages
     */
    delete(message, params) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('Messages.delete();', { params });
            const response = yield this._chatApi.deleteMessage(this._roomId, message.serial, params);
            const deletedMessage = new DefaultMessage(message.serial, message.clientId, this._roomId, message.text, message.metadata, message.headers, ChatMessageActions.MessageDelete, response.version, new Date(message.createdAt), new Date(response.timestamp), {
                clientId: this._clientId,
                description: params === null || params === void 0 ? void 0 : params.description,
                metadata: params === null || params === void 0 ? void 0 : params.metadata,
            });
            this._logger.debug('Messages.delete(); message deleted successfully', { deletedMessage });
            return deletedMessage;
        });
    }
    /**
     * @inheritdoc Messages
     */
    subscribe(listener) {
        this._logger.trace('Messages.subscribe();');
        super.on([MessageEvents.Created, MessageEvents.Updated, MessageEvents.Deleted], listener);
        // Set the subscription point to a promise that resolves when the channel attaches or with the latest message
        const resolvedSubscriptionStart = this._resolveSubscriptionStart();
        // Add a handler for unhandled rejections incase the room is released before the subscription point is resolved
        resolvedSubscriptionStart.catch(() => {
            this._logger.debug('Messages.subscribe(); subscription point was not resolved before the room was released', {
                roomId: this._roomId,
            });
        });
        this._listenerSubscriptionPoints.set(listener, resolvedSubscriptionStart);
        return {
            unsubscribe: () => {
                // Remove the listener from the subscription points
                this._listenerSubscriptionPoints.delete(listener);
                this._logger.trace('Messages.unsubscribe();');
                super.off(listener);
            },
            getPreviousMessages: (params) => this._getBeforeSubscriptionStart(listener, params),
        };
    }
    /**
     * @inheritdoc Messages
     */
    unsubscribeAll() {
        this._logger.trace('Messages.unsubscribeAll();');
        super.off();
        this._listenerSubscriptionPoints.clear();
    }
    _processEvent(channelEventMessage) {
        this._logger.trace('Messages._processEvent();', {
            channelEventMessage,
        });
        const { action } = channelEventMessage;
        const event = MessageActionsToEventsMap.get(action);
        if (!event) {
            this._logger.debug('Messages._processEvent(); received unknown message action', { action });
            return;
        }
        // Send the message to the listeners
        const message = this._parseNewMessage(channelEventMessage);
        if (!message) {
            return;
        }
        this.emit(event, { type: event, message: message });
    }
    /**
     * Validate the realtime message and convert it to a chat message.
     */
    _parseNewMessage(channelEventMessage) {
        try {
            return parseMessage(this._roomId, channelEventMessage);
        }
        catch (error) {
            this._logger.error(`failed to parse incoming message;`, { channelEventMessage, error: error });
        }
    }
    /**
     * @inheritdoc HandlesDiscontinuity
     */
    discontinuityDetected(reason) {
        this._logger.warn('Messages.discontinuityDetected();', { reason });
        this._discontinuityEmitter.emit('discontinuity', reason);
    }
    /**
     * @inheritdoc EmitsDiscontinuities
     */
    onDiscontinuity(listener) {
        this._logger.trace('Messages.onDiscontinuity();');
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
        return ErrorCodes.MessagesAttachmentFailed;
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode() {
        return ErrorCodes.MessagesDetachmentFailed;
    }
}
//# sourceMappingURL=messages.js.map