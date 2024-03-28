import { Realtime, type Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';

type RealtimeChannelPromise = Types.RealtimeChannelPromise;

export class Room {
  private readonly roomId: string;
  private readonly chatApi: ChatApi;
  private readonly channel: RealtimeChannelPromise;
  readonly messages: Messages;

  constructor(roomId: string, realtime: Realtime, chatApi: ChatApi) {
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
