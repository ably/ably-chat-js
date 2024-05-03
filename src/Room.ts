import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';

export class Room {
  private readonly roomId: string;
  private readonly chatApi: ChatApi;
  readonly messages: Messages;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi) {
    this.roomId = roomId;
    this.chatApi = chatApi;
    this.messages = new Messages(roomId, realtime, this.chatApi, realtime.auth.clientId);
  }
}