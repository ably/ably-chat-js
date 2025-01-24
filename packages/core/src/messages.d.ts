import * as Ably from 'ably';
import { ChannelManager } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { DiscontinuityListener, EmitsDiscontinuities, HandlesDiscontinuity, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { MessageEvents } from './events.js';
import { Logger } from './logger.js';
import { Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
import { PaginatedResult } from './query.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * Event names and their respective payloads emitted by the messages feature.
 */
interface MessageEventsMap {
    [MessageEvents.Created]: MessageEventPayload;
    [MessageEvents.Updated]: MessageEventPayload;
    [MessageEvents.Deleted]: MessageEventPayload;
}
/**
 * The order in which results should be returned when performing a paginated query (e.g. message history).
 */
export declare enum OrderBy {
    /**
     * Return results in ascending order (oldest first).
     */
    OldestFirst = "oldestFirst",
    /**
     * Return results in descending order (newest first).
     */
    NewestFirst = "newestFirst"
}
/**
 * Options for querying messages in a chat room.
 */
export interface QueryOptions {
    /**
     * The start of the time window to query from. If provided, the response will include
     * messages with timestamps equal to or greater than this value.
     *
     * @defaultValue The beginning of time
     */
    start?: number;
    /**
     * The end of the time window to query from. If provided, the response will include
     * messages with timestamps less than this value.
     *
     * @defaultValue Now
     */
    end?: number;
    /**
     * The maximum number of messages to return in the response.
     *
     * @defaultValue 100
     */
    limit?: number;
    /**
     * The direction to query messages in.
     * If {@link OrderBy.OldestFirst}, the response will include messages from the start of the time window to the end.
     * If {@link OrderBy.NewestFirst}, the response will include messages from the end of the time window to the start.
     * If not provided, the default is {@link OrderBy.NewestFirst}.
     *
     * @defaultValue {@link OrderBy.NewestFirst}
     */
    orderBy?: OrderBy;
}
/**
 * The parameters supplied to a message action like delete or update.
 */
export interface OperationDetails {
    /**
     * Optional description for the message action.
     */
    description?: string;
    /**
     * Optional metadata that will be added to the action. Defaults to empty.
     *
     */
    metadata?: MessageOperationMetadata;
}
/**
 * Parameters for deleting a message.
 */
export interface DeleteMessageParams extends OperationDetails {
}
/**
 * Params for sending a text message. Only `text` is mandatory.
 */
export interface SendMessageParams {
    /**
     * The text of the message.
     */
    text: string;
    /**
     * Optional metadata of the message.
     *
     * The metadata is a map of extra information that can be attached to chat
     * messages. It is not used by Ably and is sent as part of the realtime
     * message payload. Example use cases are setting custom styling like
     * background or text colors or fonts, adding links to external images,
     * emojis, etc.
     *
     * Do not use metadata for authoritative information. There is no server-side
     * validation. When reading the metadata, treat it like user input.
     *
     */
    metadata?: MessageMetadata;
    /**
     * Optional headers of the message.
     *
     * The headers are a flat key-value map and are sent as part of the realtime
     * message's extras inside the `headers` property. They can serve similar
     * purposes as the metadata, but they are read by Ably and can be used for
     * features such as
     * [subscription filters](https://faqs.ably.com/subscription-filters).
     *
     * Do not use the headers for authoritative information. There is no
     * server-side validation. When reading the headers, treat them like user
     * input.
     *
     */
    headers?: MessageHeaders;
}
/**
 * Params for updating a message. It accepts all parameters that sending a
 * message accepts.
 *
 * Note that updating a message replaces the whole previous message, so all
 * metadata and headers that should be kept must be set in the update request,
 * or they will be lost.
 */
export interface UpdateMessageParams extends SendMessageParams {
}
/**
 * Payload for a message event.
 */
export interface MessageEventPayload {
    /**
     * The type of the message event.
     */
    type: MessageEvents;
    /**
     * The message that was received.
     */
    message: Message;
}
/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: MessageEventPayload) => void;
/**
 * A response object that allows you to control a message subscription.
 */
export interface MessageSubscriptionResponse {
    /**
     * Unsubscribe the listener registered with {@link Messages.subscribe} from message events.
     */
    unsubscribe: () => void;
    /**
     * Get the previous messages that were sent to the room before the listener was subscribed.
     * @param params Options for the history query.
     * @returns A promise that resolves with the paginated result of messages, in newest-to-oldest order.
     */
    getPreviousMessages(params: Omit<QueryOptions, 'orderBy'>): Promise<PaginatedResult<Message>>;
}
/**
 * This interface is used to interact with messages in a chat room: subscribing
 * to new messages, fetching history, or sending messages.
 *
 * Get an instance via {@link Room.messages}.
 */
export interface Messages extends EmitsDiscontinuities {
    /**
     * Subscribe to new messages in this chat room.
     * @param listener callback that will be called
     * @returns A response object that allows you to control the subscription.
     */
    subscribe(listener: MessageListener): MessageSubscriptionResponse;
    /**
     * Unsubscribe all listeners from new messages in the chat room.
     */
    unsubscribeAll(): void;
    /**
     * Get messages that have been previously sent to the chat room, based on the provided options.
     *
     * @param options Options for the query.
     * @returns A promise that resolves with the paginated result of messages. This paginated result can
     * be used to fetch more messages if available.
     */
    get(options: QueryOptions): Promise<PaginatedResult<Message>>;
    /**
     * Send a message in the chat room.
     *
     * This method uses the Ably Chat API endpoint for sending messages.
     *
     * Note that the Promise may resolve before OR after the message is received
     * from the realtime channel. This means you may see the message that was just
     * sent in a callback to `subscribe` before the returned promise resolves.
     *
     * @param params an object containing {text, headers, metadata} for the message
     * to be sent. Text is required, metadata and headers are optional.
     * @returns A promise that resolves when the message was published.
     */
    send(params: SendMessageParams): Promise<Message>;
    /**
     * Delete a message in the chat room.
     *
     * This method uses the Ably Chat API REST endpoint for deleting messages.
     * It performs a `soft` delete, meaning the message is marked as deleted.
     *
     * Note that the Promise may resolve before OR after the message is deleted
     * from the realtime channel. This means you may see the message that was just
     * deleted in a callback to `subscribe` before the returned promise resolves.
     *
     * Should you wish to restore a deleted message, and providing you have the appropriate permissions,
     * you can simply send an update to the original message.
     * Note: This is subject to change in future versions, whereby a new permissions model will be introduced
     * and a deleted message may not be restorable in this way.
     *
     * @returns A promise that resolves when the message was deleted.
     * @param message - The message to delete.
     * @param deleteMessageParams - Optional details to record about the delete action.
     * @return A promise that resolves to the deleted message.
     */
    delete(message: Message, deleteMessageParams?: DeleteMessageParams): Promise<Message>;
    /**
     * Update a message in the chat room.
     *
     * Note that the Promise may resolve before OR after the updated message is
     * received from the realtime channel. This means you may see the update that
     * was just sent in a callback to `subscribe` before the returned promise
     * resolves.
     *
     * @param message The message to update.
     * @param update The new message content including headers and metadata. This
     * fully replaces the old content. Everything that's not set will be removed.
     * @param details Optional details to record about the update action.
     * @returns A promise of the updated message.
     */
    update(message: Message, update: UpdateMessageParams, details?: OperationDetails): Promise<Message>;
    /**
     * Get the underlying Ably realtime channel used for the messages in this chat room.
     *
     * @returns The realtime channel.
     */
    get channel(): Ably.RealtimeChannel;
}
/**
 * @inheritDoc
 */
export declare class DefaultMessages extends EventEmitter<MessageEventsMap> implements Messages, HandlesDiscontinuity, ContributesToRoomLifecycle {
    private readonly _roomId;
    private readonly _channel;
    private readonly _chatApi;
    private readonly _clientId;
    private readonly _listenerSubscriptionPoints;
    private readonly _logger;
    private readonly _discontinuityEmitter;
    /**
     * Constructs a new `DefaultMessages` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager An instance of the ChannelManager.
     * @param chatApi An instance of the ChatApi.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, channelManager: ChannelManager, chatApi: ChatApi, clientId: string, logger: Logger);
    /**
     * Creates the realtime channel for messages.
     */
    private _makeChannel;
    /**
     * @inheritdoc Messages
     */
    private _getBeforeSubscriptionStart;
    /**
     * Handle the case where the channel experiences a detach and reattaches.
     */
    private _handleAttach;
    /**
     * Create a promise that resolves with the attachSerial of the channel or the serial of the latest message.
     */
    private _resolveSubscriptionStart;
    private _getChannelProperties;
    private _subscribeAtChannelAttach;
    /**
     * @inheritdoc Messages
     */
    get channel(): Ably.RealtimeChannel;
    /**
     * @inheritdoc Messages
     */
    get(options: QueryOptions): Promise<PaginatedResult<Message>>;
    /**
     * @inheritdoc Messages
     */
    send(params: SendMessageParams): Promise<Message>;
    update(message: Message, update: UpdateMessageParams, details?: OperationDetails): Promise<Message>;
    /**
     * @inheritdoc Messages
     */
    delete(message: Message, params?: DeleteMessageParams): Promise<Message>;
    /**
     * @inheritdoc Messages
     */
    subscribe(listener: MessageListener): MessageSubscriptionResponse;
    /**
     * @inheritdoc Messages
     */
    unsubscribeAll(): void;
    private _processEvent;
    /**
     * Validate the realtime message and convert it to a chat message.
     */
    private _parseNewMessage;
    /**
     * @inheritdoc HandlesDiscontinuity
     */
    discontinuityDetected(reason?: Ably.ErrorInfo): void;
    /**
     * @inheritdoc EmitsDiscontinuities
     */
    onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode(): ErrorCodes;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode(): ErrorCodes;
}
export {};
