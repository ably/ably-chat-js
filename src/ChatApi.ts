export interface CreateConversationOptions {
  ttl: number;
}

export interface Conversation {
  id: string;
}

export class ChatApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversation/${conversationId}`);
    return response.json();
  }

  async createConversation(conversationId: string, body?: CreateConversationOptions): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/v1/conversation/${conversationId}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }
}
