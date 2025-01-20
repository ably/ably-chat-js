import * as Ably from 'ably';

import { Logger } from './logger.js';
import { DefaultMessage, Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
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

/**
 * In the REST API, we currently use the `direction` query parameter to specify the order of messages instead
 * of orderBy. So define this type for conversion purposes.
 */
type ApiGetMessagesQueryParams = Omit<GetMessagesQueryParams, 'orderBy'> & {
  direction?: 'forwards' | 'backwards';
};

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
export class ChatApi {
  private readonly _realtime: Ably.Realtime;
  private readonly _logger: Logger;
  private readonly _apiProtocolVersion: number = 3;

  constructor(realtime: Ably.Realtime, logger: Logger) {
    this._realtime = realtime;
    this._logger = logger;
  }

  async getMessages(roomId: string, params: GetMessagesQueryParams): Promise<PaginatedResult<Message>> {
    roomId = encodeURIComponent(roomId);

    // convert the params into internal format
    const apiParams: ApiGetMessagesQueryParams = { ...params };
    if (params.orderBy) {
      switch (params.orderBy) {
        case OrderBy.NewestFirst: {
          apiParams.direction = 'backwards';
          break;
        }
        case OrderBy.OldestFirst: {
          apiParams.direction = 'forwards';
          break;
        }
        default: {
          // in vanilla JS use-cases, without types, we need to check non-enum values
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new Ably.ErrorInfo(`invalid orderBy value: ${params.orderBy}`, 40000, 400);
        }
      }
    }

    const data = await this._makeAuthorizedPaginatedRequest<Message>(`/chat/v2/rooms/${roomId}/messages`, apiParams);
    return this._recursivePaginateMessages(data);
  }

  private _recursivePaginateMessages(data: PaginatedResult<Message>): PaginatedResult<Message> {
    const mapToDefaultMessage = (message: Message): DefaultMessage => {
      const metadata = message.metadata as MessageMetadata | undefined;
      const headers = message.headers as MessageHeaders | undefined;
      return new DefaultMessage(
        message.serial,
        message.clientId,
        message.roomId,
        message.text,
        metadata ?? {},
        headers ?? {},
        message.action,
        message.version,
        (message.createdAt as Date | undefined) ? new Date(message.createdAt) : new Date(message.timestamp),
        new Date(message.timestamp),
        message.operation,
      );
    };

    const paginatedResult: PaginatedResult<Message> = {} as PaginatedResult<Message>;
    paginatedResult.items = data.items.map((payload) => mapToDefaultMessage(payload));

    // Recursively map the next paginated data
    paginatedResult.next = () =>
      data.next().then((nextData) => {
        // eslint-disable-next-line unicorn/no-null
        return nextData ? this._recursivePaginateMessages(nextData) : null;
      });

    paginatedResult.first = () => data.first().then((firstData) => this._recursivePaginateMessages(firstData));

    paginatedResult.current = () => data.current().then((currentData) => this._recursivePaginateMessages(currentData));

    return { ...data, ...paginatedResult };
  }

  async deleteMessage(roomId: string, serial: string, params?: DeleteMessageParams): Promise<DeleteMessageResponse> {
    const body: { description?: string; metadata?: MessageOperationMetadata } = {
      description: params?.description,
      metadata: params?.metadata,
    };
    serial = encodeURIComponent(serial);
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest<DeleteMessageResponse>(
      `/chat/v2/rooms/${roomId}/messages/${serial}/delete`,
      'POST',
      body,
      {},
    );
  }

  async sendMessage(roomId: string, params: SendMessageParams): Promise<CreateMessageResponse> {
    const body: {
      text: string;
      metadata?: MessageMetadata;
      headers?: MessageHeaders;
    } = { text: params.text };
    if (params.metadata) {
      body.metadata = params.metadata;
    }
    if (params.headers) {
      body.headers = params.headers;
    }
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest<CreateMessageResponse>(`/chat/v2/rooms/${roomId}/messages`, 'POST', body);
  }

  async updateMessage(roomId: string, serial: string, params: UpdateMessageParams): Promise<UpdateMessageResponse> {
    const encodedSerial = encodeURIComponent(serial);
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest<UpdateMessageResponse>(
      `/chat/v2/rooms/${roomId}/messages/${encodedSerial}`,
      'PUT',
      params,
    );
  }

  async getOccupancy(roomId: string): Promise<OccupancyEvent> {
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest<OccupancyEvent>(`/chat/v1/rooms/${roomId}/occupancy`, 'GET');
  }

  async publishRoomReaction(roomId: string, reactions: Record<string, number>): Promise<void> {
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest(`/chat/v2/rooms/${roomId}/reactions`, 'POST', reactions);
  }

  async getRoomReactions(roomId: string): Promise<Record<string, number>> {
    roomId = encodeURIComponent(roomId);
    return this._makeAuthorizedRequest<Record<string, number>>(`/chat/v2/rooms/${roomId}/reactions`, 'GET');
  }

  private async _makeAuthorizedRequest<RES = undefined>(
    url: string,
    method: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH',
    body?: unknown,
    params?: unknown,
  ): Promise<RES> {
    const response = await this._realtime.request<RES>(method, url, this._apiProtocolVersion, params, body);
    if (!response.success) {
      this._logger.error('ChatApi._makeAuthorizedRequest(); failed to make request', {
        url,
        statusCode: response.statusCode,
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    }

    return response.items[0] as RES;
  }

  private async _makeAuthorizedPaginatedRequest<RES>(
    url: string,
    params?: unknown,
    body?: unknown,
  ): Promise<PaginatedResult<RES>> {
    const response = await this._realtime.request('GET', url, this._apiProtocolVersion, params, body);
    if (!response.success) {
      this._logger.error('ChatApi._makeAuthorizedPaginatedRequest(); failed to make request', {
        url,
        statusCode: response.statusCode,
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    }
    return response;
  }
}
