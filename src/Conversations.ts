import { Realtime } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Conversation } from './Conversation.js';

export class Conversations {
  private readonly realtime: Realtime;
  private readonly chatApi: ChatApi;

  private conversations: Record<string, Conversation> = {};

  constructor(realtime: Realtime) {
    this.realtime = realtime;
    this.chatApi = new ChatApi(realtime.auth);
  }

  get(conversationId: string): Conversation {
    if (this.conversations[conversationId]) return this.conversations[conversationId];

    const conversation = new Conversation(conversationId, this.realtime, this.chatApi);
    this.conversations[conversationId] = conversation;

    return conversation;
  }

  async release(conversationId: string) {
    const conversation = this.conversations[conversationId];
    if (!conversation) {
      return;
    }
    delete this.conversations[conversationId];
    await conversation.delete();
  }
}
