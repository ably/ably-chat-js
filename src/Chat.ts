import { Realtime } from 'ably/promises';
import { Rooms } from './Rooms.js';

export class Chat {
  private readonly realtime: Realtime;

  readonly rooms: Rooms;
  constructor(realtime: Realtime) {
    this.realtime = realtime;
    this.rooms = new Rooms(realtime);
  }

  get connection() {
    return this.realtime.connection;
  }

  get clientId() {
    return (this.realtime as any).options.clientId;
  }
}
