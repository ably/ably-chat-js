import { Realtime } from 'ably/promises';
import { Conversations } from './Conversations.js';

const DEFAULT_BASE_URL =
  process.env.NODE_ENV === 'production' ? 'https://rest.ably.io/conversation' : 'http://localhost:8281/conversations';

export class Chat {
  private readonly realtime: Realtime;

  readonly conversations: Conversations;
  constructor(realtime: Realtime, baseUrl = DEFAULT_BASE_URL) {
    this.realtime = realtime;
    this.conversations = new Conversations(realtime, baseUrl);
  }

  get connection() {
    return this.realtime.connection;
  }
}
