import * as Ably from 'ably';
import { Logger } from './logger.js';
import { Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
import { OrderBy } from './messages.js';
import { OccupancyEvent } from './occupancy.js';
import { PaginatedResult } from './query.js';
export interface GetMessagesQueryParams {
    start?: number;
    end?: number;
    orderBy?: OrderBy;
    limit?: number;
    /**
     * Serial indicating the starting point for message retrieval.
     * This serial is specific to the region of the channel the client is connected to. Messages published within
     * the same region of the channel are guaranteed to be received in increasing serial order.
     *
     * @defaultValue undefined (not used if not specified)
     */
    fromSerial?: string;
}
export interface CreateMessageResponse {
    serial: string;
    createdAt: number;
}
interface SendMessageParams {
    text: string;
    metadata?: MessageMetadata;
    headers?: MessageHeaders;
}
/**
 * Represents the response for deleting or updating a message.
 */
interface MessageOperationResponse {
    /**
     * The new message version.
     */
    version: string;
    /**
     * The timestamp of the operation.
     */
    timestamp: number;
}
type UpdateMessageResponse = MessageOperationResponse;
type DeleteMessageResponse = MessageOperationResponse;
interface UpdateMessageParams {
    /**
     * Message data to update. All fields are updated and, if omitted, they are
     * set to empty.
     */
    message: {
        text: string;
        metadata?: MessageMetadata;
        headers?: MessageHeaders;
    };
    /** Description of the update action */
    description?: string;
    /** Metadata of the update action */
    metadata?: MessageOperationMetadata;
}
interface DeleteMessageParams {
    /** Description of the delete action */
    description?: string;
    /** Metadata of the delete action */
    metadata?: MessageOperationMetadata;
}
/**
 * Chat SDK Backend
 */
export declare class ChatApi {
    private readonly _realtime;
    private readonly _logger;
    private readonly _apiProtocolVersion;
    constructor(realtime: Ably.Realtime, logger: Logger);
    getMessages(roomId: string, params: GetMessagesQueryParams): Promise<PaginatedResult<Message>>;
    private _recursivePaginateMessages;
    deleteMessage(roomId: string, serial: string, params?: DeleteMessageParams): Promise<DeleteMessageResponse>;
    sendMessage(roomId: string, params: SendMessageParams): Promise<CreateMessageResponse>;
    updateMessage(roomId: string, serial: string, params: UpdateMessageParams): Promise<UpdateMessageResponse>;
    getOccupancy(roomId: string): Promise<OccupancyEvent>;
    private _makeAuthorizedRequest;
    private _makeAuthorizedPaginatedRequest;
}
export {};
