import Ably from 'ably';
import { Rooms } from './Rooms.js';

export class Chat {
  private readonly realtime: Ably.Realtime;
  readonly rooms: Rooms;

  constructor(realtime: Ably.Realtime) {
    this.realtime = realtime;
    this.rooms = new Rooms(realtime);
  }

  get connection() {
    return this.realtime.connection;
  }

  get clientId() {
    return this.realtime.auth.clientId;
  }
}
