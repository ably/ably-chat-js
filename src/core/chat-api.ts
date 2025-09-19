import * as Ably from 'ably';

import { Logger } from './logger.js';
import { Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
import { OrderBy } from './messages.js';
import { OccupancyData } from './occupancy-parser.js';
import { PaginatedResult } from './query.js';
import { messageFromRest, RestMessage } from './rest-types.js';

export interface HistoryQueryParams {
  start?: number;
  end?: number;
  orderBy?: OrderBy;
  limit?: number;
  /**
   * Serial indicating the starting point for message retrieval.
   * This serial is specific to the region of the channel the client is connected to. Messages published within
   * the same region of the channel are guaranteed to be received in increasing serial order.
   * @defaultValue undefined (not used if not specified)
   */
  fromSerial?: string;
}

/**
 * In the REST API, we currently use the `direction` query parameter to specify the order of messages instead
 * of orderBy. So define this type for conversion purposes.
 */
type ApiHistoryQueryParams = Omit<HistoryQueryParams, 'orderBy'> & {
  direction?: 'forwards' | 'backwards';
};

export interface CreateMessageResponse {
  /** The serial of the message */
  serial: string;
  /** The timestamp of the message */
  timestamp: number;
}

interface SendMessageParams {
  text: string;
  metadata?: MessageMetadata;
  headers?: MessageHeaders;
}

type UpdateMessageResponse = RestMessage;

type DeleteMessageResponse = RestMessage;

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
 * Parameters for sending a message reaction.
 */
export interface SendMessageReactionParams {
  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   */
  type: string;

  /**
   * The reaction name to add; ie. the emoji.
   */
  name: string;

  /**
   * The count of the reaction for type {@link MessageReactionType.Multiple}.
   * Defaults to 1 if not set. Not supported for other reaction types.
   * @defaultValue 1
   */
  count?: number;
}

/**
 * Parameters for deleting a message reaction.
 */
export interface DeleteMessageReactionParams {
  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   */
  type: string;

  /**
   * The reaction name to remove, ie. the emoji. Required for all reaction types
   * except {@link MessageReactionType.Unique}.
   */
  name?: string;
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

  async history(roomName: string, params: HistoryQueryParams): Promise<PaginatedResult<Message>> {
    roomName = encodeURIComponent(roomName);

    // convert the params into internal format
    const apiParams: ApiHistoryQueryParams = { ...params };
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

    const data = await this._makeAuthorizedPaginatedRequest<RestMessage>(
      `/chat/v4/rooms/${roomName}/messages`,
      apiParams,
    );
    return this._recursivePaginateMessages(data);
  }

  private _recursivePaginateMessages(data: PaginatedResult<RestMessage>): PaginatedResult<Message> {
    const result: PaginatedResult<Message> = {} as PaginatedResult<Message>;
    result.items = data.items.map((payload) => messageFromRest(payload));

    // Recursively map the next paginated data
    // eslint-disable-next-line unicorn/no-null
    result.next = () => data.next().then((nextData) => (nextData ? this._recursivePaginateMessages(nextData) : null));

    result.first = () => data.first().then((firstData) => this._recursivePaginateMessages(firstData));

    result.current = () => data.current().then((currentData) => this._recursivePaginateMessages(currentData));

    result.hasNext = () => data.hasNext();

    result.isLast = () => data.isLast();

    return { ...data, ...result };
  }

  async getMessage(roomName: string, serial: string): Promise<Message> {
    const encodedSerial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    const restMessage = await this._makeAuthorizedRequest<RestMessage>(
      `/chat/v4/rooms/${roomName}/messages/${encodedSerial}`,
      'GET',
    );
    return messageFromRest(restMessage);
  }

  deleteMessage(roomName: string, serial: string, params?: DeleteMessageParams): Promise<DeleteMessageResponse> {
    const body: { description?: string; metadata?: MessageOperationMetadata } = {
      description: params?.description,
      metadata: params?.metadata,
    };
    serial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest<DeleteMessageResponse>(
      `/chat/v4/rooms/${roomName}/messages/${serial}/delete`,
      'POST',
      body,
      {},
    );
  }

  sendMessage(roomName: string, params: SendMessageParams): Promise<CreateMessageResponse> {
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
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest<CreateMessageResponse>(`/chat/v4/rooms/${roomName}/messages`, 'POST', body);
  }

  updateMessage(roomName: string, serial: string, params: UpdateMessageParams): Promise<UpdateMessageResponse> {
    const encodedSerial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest<UpdateMessageResponse>(
      `/chat/v4/rooms/${roomName}/messages/${encodedSerial}`,
      'PUT',
      params,
    );
  }

  sendMessageReaction(roomName: string, serial: string, data: SendMessageReactionParams): Promise<void> {
    const encodedSerial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest(`/chat/v4/rooms/${roomName}/messages/${encodedSerial}/reactions`, 'POST', data);
  }

  deleteMessageReaction(roomName: string, serial: string, data: DeleteMessageReactionParams): Promise<void> {
    const encodedSerial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest(
      `/chat/v4/rooms/${roomName}/messages/${encodedSerial}/reactions`,
      'DELETE',
      undefined,
      data,
    );
  }

  getClientReactions(roomName: string, serial: string, clientId?: string): Promise<Message['reactions']> {
    const encodedSerial = encodeURIComponent(serial);
    roomName = encodeURIComponent(roomName);
    const params = clientId ? { forClientId: clientId } : {};
    return this._makeAuthorizedRequest<Message['reactions']>(
      `/chat/v4/rooms/${roomName}/messages/${encodedSerial}/client-reactions`,
      'GET',
      undefined,
      params,
    );
  }

  getOccupancy(roomName: string): Promise<OccupancyData> {
    roomName = encodeURIComponent(roomName);
    return this._makeAuthorizedRequest<OccupancyData>(`/chat/v4/rooms/${roomName}/occupancy`, 'GET');
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
