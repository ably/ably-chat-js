import { Conversation, Message } from './entities.js';
import { ErrorInfo, Types } from 'ably';
import AuthPromise = Types.AuthPromise;

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
  private readonly baseUrl = '/api/conversations';
  private readonly auth: AuthPromise;

  constructor(auth: AuthPromise) {
    this.auth = auth;
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}`, 'GET');
  }

  async createConversation(
    conversationId: string,
    body?: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}`, 'POST', body);
  }

  async getMessages(conversationId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    const queryString = new URLSearchParams({
      ...params,
      limit: params.limit.toString(),
    }).toString();
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}/messages?${queryString}`, 'GET');
  }

  async sendMessage(conversationId: string, text: string): Promise<CreateMessageResponse> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}/messages`, 'POST', { content: text });
  }

  async editMessage(conversationId: string, messageId: string, text: string): Promise<UpdateMessageResponse> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}/messages/${messageId}`, 'POST', {
      content: text,
    });
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}/messages/${messageId}`, 'DELETE');
  }

  async addMessageReaction(conversationId: string, messageId: string, type: string): Promise<AddReactionResponse> {
    return this.makeAuthorisedRequest(`v1/conversations/${conversationId}/messages/${messageId}/reactions`, 'POST', {
      type,
    });
  }

  async deleteMessageReaction(reactionId: string): Promise<void> {
    return this.makeAuthorisedRequest(`v1/conversations/reactions/${reactionId}`, 'DELETE');
  }

  private async makeAuthorisedRequest<RES, REQ = undefined>(
    url: string,
    method: 'POST' | 'GET' | ' PUT' | 'DELETE',
    body?: REQ,
  ): Promise<RES> {
    const tokenDetails = await this.auth.requestToken();
    const response = await fetch(`${this.baseUrl}/${url}`, {
      method,
      headers: {
        'ably-clientId': tokenDetails.clientId,
        authorization: `Bearer ${tokenDetails.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }
}
