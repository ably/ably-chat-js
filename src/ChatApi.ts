export interface CreateConversationOptions {
  ttl: number;
}

export interface Conversation {
  id: string;
}

export class ChatApi {
  private readonly baseUrl =
    process.env.NODE_ENV === 'production' ? 'https://rest.ably.io/conversation' : 'http://localhost:8281/conversations';

  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`);
    return response.json();
  }

  async createConversation(conversationId: string, body?: CreateConversationOptions): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }
}
