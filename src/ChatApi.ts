import { Conversation, Message } from './entities.js';
import { Realtime, ErrorInfo } from 'ably/promises';

export interface CreateConversationRequest {
  ttl: number;
}

export interface CreateConversationResponse {
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
  private readonly realtime: Realtime;

  constructor(realtime: Realtime) {
    this.realtime = realtime;
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.makeAuthorisedRequest(`/conversations/v1/conversations/${conversationId}`, 'GET');
  }

  async createConversation(
    conversationId: string,
    body?: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    return this.makeAuthorisedRequest(`/conversations/v1/conversations`, 'POST', {
      name: conversationId,
      ...body,
    });
  }

  async deleteConversation(conversationId: string): Promise<CreateConversationResponse> {
    return this.makeAuthorisedRequest(`/conversations/v1/conversations/${conversationId}`, 'DELETE');
  }

  async getMessage(conversationId: string, messageId: string): Promise<Message> {
    return this.makeAuthorisedRequest<Message>(
      `/conversations/v1/conversations/${conversationId}/messages/${messageId}`,
      'GET',
    );
  }

  async getMessages(conversationId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    return this.makeAuthorisedPaginatedRequest(
      `/conversations/v1/conversations/${conversationId}/messages`,
      'GET',
      params,
    );
  }

  async sendMessage(conversationId: string, text: string): Promise<CreateMessageResponse> {
    return this.makeAuthorisedRequest(`/conversations/v1/conversations/${conversationId}/messages`, 'POST', {
      content: text,
    });
  }

  async editMessage(conversationId: string, messageId: string, text: string): Promise<UpdateMessageResponse> {
    return this.makeAuthorisedRequest(
      `/conversations/v1/conversations/${conversationId}/messages/${messageId}`,
      'PATCH',
      {
        content: text,
      },
    );
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.makeAuthorisedRequest(
      `/conversations/v1/conversations/${conversationId}/messages/${messageId}`,
      'DELETE',
    );
  }

  async addMessageReaction(conversationId: string, messageId: string, type: string): Promise<AddReactionResponse> {
    return this.makeAuthorisedRequest(
      `/conversations/v1/conversations/${conversationId}/messages/${messageId}/reactions`,
      'POST',
      {
        type,
      },
    );
  }

  async deleteMessageReaction(reactionId: string): Promise<void> {
    await this.makeAuthorisedRequest(`/conversations/v1/reactions/${reactionId}`, 'DELETE');
  }

  private async makeAuthorisedRequest<RES, REQ = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE' | 'PATCH',
    body?: REQ,
  ): Promise<RES> {
    const response = await this.realtime.request(method, url, {}, body);
    if (!response.success) throw new ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
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
    if (!response.success) throw new ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
    return response.items as RES[];
  }
}
