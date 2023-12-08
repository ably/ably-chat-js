import { Realtime } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Conversation } from './Conversation.js';

export class Conversations {
  private readonly realtime: Realtime;
  private readonly chatApi: ChatApi;

  constructor(realtime: Realtime) {
    this.realtime = realtime;
    this.chatApi = process.env.CHAT_SDK_STATUS === 'extended' ? new ChatApi((realtime as any).options.clientId) : new ChatApi();
  }

  get(conversationId: string) {
    return new Conversation(conversationId, this.realtime, this.chatApi);
  }
}
