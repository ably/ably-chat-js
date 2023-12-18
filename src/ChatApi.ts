import { Conversation, Message } from './entities.js';
import { ErrorInfo } from 'ably';

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

  private readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`, {
      headers: {
        'ably-clientId': this.clientId,
      },
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async createConversation(
    conversationId: string,
    body?: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`, {
      method: 'POST',
      headers: {
        'ably-clientId': this.clientId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async getMessages(conversationId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    const queryString = new URLSearchParams({
      ...params,
      limit: params.limit.toString(),
    }).toString();

    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages?${queryString}`, {
      headers: {
        'ably-clientId': this.clientId,
      },
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async sendMessage(conversationId: string, text: string): Promise<CreateMessageResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'ably-clientId': this.clientId,
      },
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async editMessage(conversationId: string, messageId: string, text: string): Promise<UpdateMessageResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages/${messageId}`, {
      method: 'POST',
      headers: {
        'ably-clientId': this.clientId,
      },
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'ably-clientId': this.clientId,
      },
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
  }

  async addMessageReaction(conversationId: string, messageId: string, type: string): Promise<AddReactionResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'ably-clientId': this.clientId,
      },
      body: JSON.stringify({ type }),
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
    return response.json();
  }

  async deleteMessageReaction(reactionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/reactions/${reactionId}`, {
      method: 'DELETE',
      headers: {
        'ably-clientId': this.clientId,
      },
    });
    if (!response.ok) throw new ErrorInfo(response.statusText, response.status, 4000);
  }
}
