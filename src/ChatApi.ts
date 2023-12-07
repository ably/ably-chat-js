import { Conversation, Message } from './entities.js';

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

export class ChatApi {
  private readonly baseUrl =
    process.env.NODE_ENV === 'production' ? 'https://rest.ably.io/conversation' : 'http://localhost:8281/conversations';

  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`);
    if (!response.ok) throw Error(response.statusText);
    return response.json();
  }

  async createConversation(
    conversationId: string,
    body?: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw Error(response.statusText);
    return response.json();
  }

  async getMessages(conversationId: string, params: GetMessagesQueryParams): Promise<Message[]> {
    const queryString = new URLSearchParams({
      ...params,
      limit: params.limit.toString(),
    }).toString();

    const response = await fetch(`${this.baseUrl}/v1/conversation/${conversationId}/messages?${queryString}`);
    if (!response.ok) throw Error(response.statusText);
    return response.json();
  }

  async sendMessage(conversationId: string, text: string): Promise<CreateMessageResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversation/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok) throw Error(response.statusText);
    return response.json();
  }

  async editMessage(conversationId: string, messageId: string, text: string): Promise<UpdateMessageResponse> {
    const response = await fetch(`${this.baseUrl}/v1/conversation/${conversationId}/messages/${messageId}`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok) throw Error(response.statusText);
    return response.json();
  }
}
