import * as Ably from 'ably';

import { Logger } from './logger.js';
import { Message } from './Message.js';
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
  content: string;
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
    return this.makeAuthorisedPaginatedRequest(`/chat/v1/rooms/${roomId}/messages`, params);
  }

  async sendMessage(roomId: string, text: string): Promise<CreateMessageResponse> {
    return this.makeAuthorisedRequest<CreateMessageResponse, CreateMessageRequest>(
      `/chat/v1/rooms/${roomId}/messages`,
      'POST',
      {
        content: text,
      },
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
    const response = await this.realtime.request(method, url, 1.1, {}, body);
    if (!response.success) {
      this._logger.error(
        `ChatApi.makeAuthorisedRequest(); failed to make request to ${url}; errorCode ${response.errorCode}; message ${response.errorMessage}`,
      );
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    }

    const [result] = response.items;
    return result as RES;
  }

  private async makeAuthorisedPaginatedRequest<RES, REQ = undefined>(
    url: string,
    params?: any,
    body?: REQ,
  ): Promise<PaginatedResult<RES>> {
    const response = await this.realtime.request('GET', url, 1.1, params, body);
    if (!response.success) {
      this._logger.error(
        `ChatApi.makeAuthorisedPaginatedRequest(); failed to make request to ${url}; errorCode ${response.errorCode}; message ${response.errorMessage}`,
      );
      throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    }
    return response;
  }
}
