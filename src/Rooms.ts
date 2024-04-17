import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Room } from './Room.js';

export class Rooms {
  private readonly realtime: Ably.Realtime;
  private readonly chatApi: ChatApi;

  private rooms: Record<string, Room> = {};

  constructor(realtime: Ably.Realtime) {
    this.realtime = realtime;
    this.chatApi = new ChatApi(realtime);
  }

  get(roomId: string): Room {
    if (this.rooms[roomId]) return this.rooms[roomId];

    const room = new Room(roomId, this.realtime, this.chatApi);
    this.rooms[roomId] = room;

    return room;
  }

  async release(roomId: string) {
    const room = this.rooms[roomId];
    if (!room) {
      return;
    }
    delete this.rooms[roomId];
    await room.delete();
  }
}
