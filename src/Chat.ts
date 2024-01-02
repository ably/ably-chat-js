import { Realtime } from 'ably/promises';
import { Conversations } from './Conversations.js';

export class Chat {
  private readonly realtime: Realtime;

  readonly conversations: Conversations;
  constructor(realtime: Realtime) {
    this.realtime = realtime;
    this.conversations = new Conversations(realtime);
  }

  get connection() {
    return this.realtime.connection;
  }

  get clientId() {
    return (this.realtime as any).options.clientId;
  }
}
