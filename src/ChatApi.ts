import { Room as Room, Message } from './entities.js';
import * as Ably from 'ably'

export interface CreateRoomRequest {
  ttl: number;
}

export interface CreateRoomResponse {
  id: string;
}

export interface GetMessagesQueryParams {
  startId?: string;
  endId?: string;
  direction?: 'forwards' | 'backwards';
  limit: number;
}

export interface CreateMessageResponse {
  id: string;
}

export interface UpdateMessageResponse {
  id: string;
}

export interface AddReactionResponse {
  id: string;
}

/**
 * Chat SDK Backend
 */
export class ChatApi {
  private readonly realtime: Ably.Realtime;

  constructor(realtime: Ably.Realtime) {
    this.realtime = realtime;
  }

  async getRoom(roomId: string): Promise<Room> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}`, 'GET');
  }

  async createRoom(roomId: string, body?: CreateRoomRequest): Promise<CreateRoomResponse> {
    return this.makeAuthorisedRequest(`/chat/v1/room`, 'POST', {
      name: roomId,
      ...body,
    });
  }

  async deleteRoom(roomId: string): Promise<CreateRoomResponse> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}`, 'DELETE');
  }

  async getMessage(roomId: string, messageId: string): Promise<Message> {
    return this.makeAuthorisedRequest<Message>(`/chat/v1/room/${roomId}/messages/${messageId}`, 'GET');
  }

  async getMessages(roomId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    return this.makeAuthorisedPaginatedRequest(`/chat/v1/room/${roomId}/messages`, 'GET', params);
  }

  async sendMessage(roomId: string, text: string): Promise<CreateMessageResponse> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}/messages`, 'POST', {
      content: text,
    });
  }

  async editMessage(roomId: string, messageId: string, text: string): Promise<UpdateMessageResponse> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}/messages/${messageId}`, 'PATCH', {
      content: text,
    });
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}/messages/${messageId}`, 'DELETE');
  }

  async addMessageReaction(roomId: string, messageId: string, type: string): Promise<AddReactionResponse> {
    return this.makeAuthorisedRequest(`/chat/v1/room/${roomId}/messages/${messageId}/reactions`, 'POST', {
      type,
    });
  }

  async deleteMessageReaction(roomId: string, messageId: string, reactionId: string): Promise<void> {
    await this.makeAuthorisedRequest(`/chat/v1/room/${roomId}/messages/${messageId}/reactions/${reactionId}`, 'DELETE');
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
