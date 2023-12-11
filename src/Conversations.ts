import { Realtime } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Conversation } from './Conversation.js';

export class Conversations {
  private readonly realtime: Realtime;
  private readonly chatApi: ChatApi;

  constructor(realtime: Realtime) {
    this.realtime = realtime;
    this.chatApi = new ChatApi((realtime as any).options.clientId);
  }

  get(conversationId: string) {
    return new Conversation(conversationId, this.realtime, this.chatApi);
  }
}
