import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';
import { UserPresence } from './UserPresence.js';

export class Room {
  private readonly _roomId: string;
  private readonly chatApi: ChatApi;
  readonly messages: Messages;
  readonly userPresence: UserPresence;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi) {
    this._roomId = roomId;
    this.chatApi = chatApi;
    this.messages = new Messages(roomId, realtime, this.chatApi, realtime.auth.clientId);
    this.userPresence = new UserPresence(roomId, realtime, realtime.auth.clientId);
  }

  get roomId(): string {
    return this._roomId;
  }
}
