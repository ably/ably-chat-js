import * as Ably from 'ably'
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';

export class Room {
  private readonly roomId: string;
  private readonly chatApi: ChatApi;
  private readonly channel: Ably.RealtimeChannel;
  readonly messages: Messages;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi) {
    this.roomId = roomId;
    this.chatApi = chatApi;
    this.channel = realtime.channels.get(`room:${roomId}`);
    this.messages = new Messages(roomId, this.channel, this.chatApi, (realtime as any).options.clientId);
  }

  async create() {
    await this.chatApi.createRoom(this.roomId);
  }

  get members() {
    return this.channel.presence;
  }

  async delete() {
    await this.chatApi.deleteRoom(this.roomId);
  }
}
