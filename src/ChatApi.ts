import * as Ably from 'ably';

import { Logger } from './logger.js';
import { AcceptableHeaderValue, DefaultMessage, Message } from './Message.js';
import { OccupancyEvent } from './Occupancy.js';
import { PaginatedResult } from './query.js';

export interface GetMessagesQueryParams {
  start?: number;
  end?: number;
  direction?: 'forwards' | 'backwards';
  limit?: number;
}

export interface CreateMessageResponse {
  timeserial: string;
  createdAt: number;
}

interface CreateMessageRequest {
  text: string;
}

interface SendMessageParams {
  text: string;
  metadata?: Record<string, unknown>;
  headers?: Record<string, AcceptableHeaderValue>;
}

/**
 * Chat SDK Backend
 */
export class ChatApi {
  private readonly realtime: Ably.Realtime;
  private readonly _logger: Logger;

  constructor(realtime: Ably.Realtime, logger: Logger) {
    this.realtime = realtime;
    this._logger = logger;
  }

  async getMessages(roomId: string, params: GetMessagesQueryParams): Promise<PaginatedResult<Message>> {
    return this.makeAuthorisedPaginatedRequest<Message, GetMessagesQueryParams>(
      `/chat/v1/rooms/${roomId}/messages`,
      params,
    ).then((data) => {
      data.items = data.items.map((message) => {
        const metadata = message.metadata as Record<string, unknown> | undefined;
        const headers = message.headers as Record<string, AcceptableHeaderValue> | undefined;
        return new DefaultMessage(
          message.timeserial,
          message.clientId,
          message.roomId,
          message.text,
          new Date(message.createdAt),
          metadata ?? {},
          headers ?? {},
        );
      });
      return data;
    });
  }

  async sendMessage(roomId: string, params: SendMessageParams): Promise<CreateMessageResponse> {
    const body: {
      text: string;
      metadata?: Record<string, unknown>;
      headers?: Record<string, AcceptableHeaderValue>;
    } = { text: params.text };
    if (params.metadata) {
      body.metadata = params.metadata;
    }
    if (params.headers) {
      body.headers = params.headers;
    }

    return this.makeAuthorisedRequest<CreateMessageResponse, CreateMessageRequest>(
      `/chat/v1/rooms/${roomId}/messages`,
      'POST',
      body,
    );
  }

  async getOccupancy(roomId: string): Promise<OccupancyEvent> {
    return this.makeAuthorisedRequest<OccupancyEvent>(`/chat/v1/rooms/${roomId}/occupancy`, 'GET');
  }

  private async makeAuthorisedRequest<RES, REQ = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE' | 'PATCH',
    body?: REQ,
  ): Promise<RES> {
    const response = await this.realtime.request<RES>(method, url, 1.1, {}, body);
    if (!response.success) {
      this._logger.error('ChatApi.makeAuthorisedRequest(); failed to make request', {
        url,
        statusCode: response.statusCode,
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode) as unknown as Error;
    }

    return response.items[0] as RES;
  }

  private async makeAuthorisedPaginatedRequest<RES, REQ = undefined>(
    url: string,
    params?: unknown,
    body?: REQ,
  ): Promise<PaginatedResult<RES>> {
    const response = await this.realtime.request('GET', url, 1.1, params, body);
    if (!response.success) {
      this._logger.error('ChatApi.makeAuthorisedPaginatedRequest(); failed to make request', {
        url,
        statusCode: response.statusCode,
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode) as unknown as Error;
    }
    return response;
  }
}
