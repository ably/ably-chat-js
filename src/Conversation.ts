import { Realtime } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';

export class Conversation {
  private readonly conversationId: string;
  private readonly realtime: Realtime;
  private readonly chatApi: ChatApi;
  readonly messages: Messages;

  constructor(conversationId: string, realtime: Realtime, chatApi: ChatApi) {
    this.conversationId = conversationId;
    this.realtime = realtime;
    this.chatApi = chatApi;
    this.messages = new Messages(conversationId, realtime, this.chatApi);
  }

  async create() {
    await this.chatApi.createConversation(this.conversationId);
  }
}
