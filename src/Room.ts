import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Messages } from './Messages.js';
import { Presence } from './Presence.js';
import { DefaultSubscriptionManager } from './SubscriptionManager.js';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

export class Room {
  private readonly _roomId: string;
  private readonly chatApi: ChatApi;
  readonly messages: Messages;
  readonly presence: Presence;
  private readonly realtimeChannelName: string;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi) {
    this._roomId = roomId;
    this.chatApi = chatApi;
    this.realtimeChannelName = `${this._roomId}::$chat::$chatMessages`;

    const subscriptionManager = new DefaultSubscriptionManager(
      realtime.channels.get(this.realtimeChannelName, DEFAULT_CHANNEL_OPTIONS),
    );
    this.messages = new Messages(roomId, subscriptionManager, this.chatApi, realtime.auth.clientId);
    this.presence = new Presence(subscriptionManager, realtime.auth.clientId);
  }

  get roomId(): string {
    return this._roomId;
  }
}
