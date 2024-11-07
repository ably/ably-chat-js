import * as Ably from 'ably';

import { Logger } from './logger.js';
import { DefaultMessage, Message, MessageHeaders, MessageMetadata } from './message.js';
import { OccupancyEvent } from './occupancy.js';
import { PaginatedResult } from './query.js';

export interface GetMessagesQueryParams {
  start?: number;
  end?: number;
  direction?: 'forwards' | 'backwards';
  limit?: number;
  /**
   * Timeserial indicating the starting point for message retrieval.
   * This timeserial is specific to the region of the channel the client is connected to. Messages published within
   * the same region of the channel are guaranteed to be received in increasing timeserial order.
   *
   * @defaultValue undefined (not used if not specified)
   */
  fromSerial?: string;
}

export interface CreateMessageResponse {
  timeserial: string;
  createdAt: number;
}

interface SendMessageParams {
  text: string;
  metadata?: MessageMetadata;
  headers?: MessageHeaders;
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
    return this._makeAuthorizedPaginatedRequest<Message>(`/chat/v2/rooms/${roomId}/messages`, params).then((data) => {
      data.items = data.items.map((message) => {
        const metadata = message.metadata as MessageMetadata | undefined;
        const headers = message.headers as MessageHeaders | undefined;
        return new DefaultMessage(
          message.timeserial,
          message.clientId,
          message.roomId,
          message.text,
          new Date(message.createdAt),
          metadata ?? {},
          headers ?? {},
          message.latestAction,
          message.latestActionSerial,
          message.deletedAt ? new Date(message.deletedAt) : undefined,
          message.updatedAt ? new Date(message.updatedAt) : undefined,
          message.latestActionDetails,
        );
      });
      return data;
    });
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

    return this._makeAuthorizedRequest<CreateMessageResponse>(`/chat/v2/rooms/${roomId}/messages`, 'POST', body);
  }

  async getOccupancy(roomId: string): Promise<OccupancyEvent> {
    return this._makeAuthorizedRequest<OccupancyEvent>(`/chat/v1/rooms/${roomId}/occupancy`, 'GET');
  }

  private async _makeAuthorizedRequest<RES = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE' | 'PATCH',
    body?: unknown,
  ): Promise<RES> {
    const response = await this._realtime.request<RES>(method, url, this._apiProtocolVersion, {}, body);
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
