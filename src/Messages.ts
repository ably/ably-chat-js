import { Realtime } from 'ably/promises';
import { ChatApi } from './ChatApi.js';

const enum Direction {
  ascending = 'ascending',
  descending = 'descending',
}

interface QueryOptions {
  from: string;
  to: string;
  limit: string;
  direction: Direction;
}

export class Messages {
  private readonly conversationId: string;
  private readonly realtime: Realtime;
  private readonly chatApi: ChatApi;

  constructor(conversationId: string, realtime: Realtime, chatApi: ChatApi) {
    this.conversationId = conversationId;
    this.realtime = realtime;
    this.chatApi = chatApi;
  }

  // eslint-disable-next-line
  async query(options: QueryOptions) {
    return [];
  }
}
