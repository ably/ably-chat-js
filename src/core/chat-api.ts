import * as Ably from 'ably';

import { ErrorCode } from './errors.js';
import { Logger } from './logger.js';
import { Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
import { OrderBy } from './messages.js';
import { OccupancyData } from './occupancy-parser.js';
import { PaginatedResult } from './query.js';
import { messageFromRest, RestMessage } from './rest-types.js';

/**
 * Parameters for querying message history.
 */
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

interface OperationDetails {
  /** Description of the operation */
  description?: string;

  /** Metadata of the operation */
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
 * Bridge for the Chat REST API.
 * @internal
 */
export class ChatApi {
  private readonly _realtime: Ably.Realtime;
  private readonly _logger: Logger;
  private readonly _apiProtocolVersion: number = 4;

  constructor(realtime: Ably.Realtime, logger: Logger) {
    this._realtime = realtime;
    this._logger = logger;
  }

  async history(roomName: string, params: HistoryQueryParams): Promise<PaginatedResult<Message>> {
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
          throw new Ably.ErrorInfo(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `unable to query messages; invalid orderBy value: ${params.orderBy}`,
            ErrorCode.InvalidArgument,
            400,
          );
        }
      }
    }

    const data = await this._makeAuthorizedPaginatedRequest<RestMessage>(
      this._roomUrl(roomName, '/messages'),
      apiParams,
    );
    return this._recursivePaginateMessages(data);
  }

  private _recursivePaginateMessages(data: PaginatedResult<RestMessage>): PaginatedResult<Message> {
    const result: PaginatedResult<Message> = {} as PaginatedResult<Message>;
    result.items = data.items.map((payload) => messageFromRest(payload));

    // Recursively map the next paginated data
    result.next = async () => {
      const nextData = await data.next();
      // eslint-disable-next-line unicorn/no-null
      return nextData ? this._recursivePaginateMessages(nextData) : null;
    };

    result.first = async () => {
      const firstData = await data.first();
      return this._recursivePaginateMessages(firstData);
    };

    result.current = async () => {
      const currentData = await data.current();
      return this._recursivePaginateMessages(currentData);
    };

    result.hasNext = () => data.hasNext();

    result.isLast = () => data.isLast();

    return { ...data, ...result };
  }

  async getMessage(roomName: string, serial: string): Promise<Message> {
    const restMessage = await this._makeAuthorizedRequest<RestMessage>(this._messageUrl(roomName, serial), 'GET');
    return messageFromRest(restMessage);
  }

  async deleteMessage(roomName: string, serial: string, details?: OperationDetails): Promise<DeleteMessageResponse> {
    const body = {
      ...(details?.description && { description: details.description }),
      ...(details?.metadata && { metadata: details.metadata }),
    };
    return this._makeAuthorizedRequest<DeleteMessageResponse>(
      this._messageUrl(roomName, serial, '/delete'),
      'POST',
      body,
      {},
    );
  }

  async sendMessage(roomName: string, params: SendMessageParams): Promise<RestMessage> {
    const body = {
      text: params.text,
      ...(params.metadata && { metadata: params.metadata }),
      ...(params.headers && { headers: params.headers }),
    };
    return this._makeAuthorizedRequest<RestMessage>(this._roomUrl(roomName, '/messages'), 'POST', body);
  }

  async updateMessage(roomName: string, serial: string, params: UpdateMessageParams): Promise<UpdateMessageResponse> {
    return this._makeAuthorizedRequest<UpdateMessageResponse>(this._messageUrl(roomName, serial), 'PUT', params);
  }

  async sendMessageReaction(roomName: string, serial: string, data: SendMessageReactionParams): Promise<void> {
    return this._makeAuthorizedRequest(this._messageUrl(roomName, serial, '/reactions'), 'POST', data);
  }

  async deleteMessageReaction(roomName: string, serial: string, data: DeleteMessageReactionParams): Promise<void> {
    return this._makeAuthorizedRequest(this._messageUrl(roomName, serial, '/reactions'), 'DELETE', undefined, data);
  }

  async getClientReactions(roomName: string, serial: string, clientId?: string): Promise<Message['reactions']> {
    const params = clientId ? { forClientId: clientId } : {};
    return this._makeAuthorizedRequest<Message['reactions']>(
      this._messageUrl(roomName, serial, '/client-reactions'),
      'GET',
      undefined,
      params,
    );
  }

  async getOccupancy(roomName: string): Promise<OccupancyData> {
    return this._makeAuthorizedRequest<OccupancyData>(this._roomUrl(roomName, '/occupancy'), 'GET');
  }

  private async _makeAuthorizedRequest<RES = undefined>(
    url: string,
    method: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH',
    body?: unknown,
    params?: unknown,
  ): Promise<RES> {
    const response = await this._doRequest(url, method, params, body);
    return response.items[0] as RES;
  }

  private async _makeAuthorizedPaginatedRequest<RES>(
    url: string,
    params?: unknown,
    body?: unknown,
  ): Promise<PaginatedResult<RES>> {
    return this._doRequest(url, 'GET', params, body);
  }

  private async _doRequest<RES>(
    url: string,
    method: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH',
    params?: unknown,
    body?: unknown,
  ): Promise<PaginatedResult<RES>> {
    const response = await this._realtime.request(method, url, this._apiProtocolVersion, params, body);
    if (!response.success) {
      this._logger.error('ChatApi._doRequest(); failed to make request', {
        url,
        method,
        statusCode: response.statusCode,
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    }

    return response;
  }

  /**
   * Returns a URL for a specific room.
   * @param roomName Name of the room
   * @param suffix The suffix to add to the room URL, prefixed with /
   * @returns string The formatted URL
   */
  private _roomUrl(roomName: string, suffix = ''): string {
    return `/chat/v4/rooms/${encodeURIComponent(roomName)}${suffix}`;
  }

  /**
   * Returns a URL for a specific message in the room.
   * @param roomName string Name of the room
   * @param serial string The serial of the message
   * @param suffix The suffix to add to the room URL, prefixed with /
   * @returns string The formatted URL
   */
  private _messageUrl(roomName: string, serial: string, suffix = ''): string {
    return `${this._roomUrl(roomName, '/messages')}/${encodeURIComponent(serial)}${suffix}`;
  }
}
