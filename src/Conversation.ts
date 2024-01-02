import { Realtime, type Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';

type RealtimeChannelPromise = Types.RealtimeChannelPromise;

export class Conversation {
  private readonly conversationId: string;
  private readonly chatApi: ChatApi;
  private readonly channel: RealtimeChannelPromise;
  readonly messages: Messages;

  constructor(conversationId: string, realtime: Realtime, chatApi: ChatApi) {
    this.conversationId = conversationId;
    this.chatApi = chatApi;
    this.channel = realtime.channels.get(`conversations:${conversationId}`);
    this.messages = new Messages(conversationId, this.channel, this.chatApi);
  }

  async create() {
    await this.chatApi.createConversation(this.conversationId);
  }

  get members() {
    return this.channel.presence;
  }

  async delete() {
    await this.chatApi.deleteConversation(this.conversationId);
  }
}
