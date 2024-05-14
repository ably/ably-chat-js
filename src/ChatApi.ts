import { Message } from './entities.js';
import Ably from 'ably';

export interface GetMessagesQueryParams {
  startId?: string;
  endId?: string;
  direction?: 'forwards' | 'backwards';
  limit: number;
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

  constructor(realtime: Ably.Realtime) {
    this.realtime = realtime;
  }

  async getMessages(roomId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    return this.makeAuthorisedPaginatedRequest(`/chat/v1/rooms/${roomId}/messages`, 'GET', params);
  }

  async sendMessage(roomId: string, text: string): Promise<CreateMessageResponse> {
    return this.makeAuthorisedRequest<CreateMessageResponse, CreateMessageRequest>(`/chat/v1/rooms/${roomId}/messages`, 'POST', {
      content: text,
    });
  }

  private async makeAuthorisedRequest<RES, REQ = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE' | 'PATCH',
    body?: REQ,
  ): Promise<RES> {
    const response = await this.realtime.request(method, url, 1.1, {}, body);
    if (!response.success) throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    const [result] = response.items;
    return result as RES;
  }

  private async makeAuthorisedPaginatedRequest<RES, REQ = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE',
    params?: any,
    body?: REQ,
  ): Promise<RES[]> {
    const response = await this.realtime.request(method, url, params, body);
    if (!response.success) throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    return response.items as RES[];
  }
}
