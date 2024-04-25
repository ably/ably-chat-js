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

  /**
   * Gets a room reference by ID. The Rooms class ensures that only one reference
   * exists for each room. A new reference object is created if it doesn't already
   * exist, or if the one used previously was released using release(roomId).
   * 
   * Always call `release(roomId)` after the Room object is no longer needed.
   * 
   * @param roomId The ID of the room.
   * @returns Room A new or existing Room object.
   */
  get(roomId: string): Room {
    if (this.rooms[roomId]) return this.rooms[roomId];

    const room = new Room(roomId, this.realtime, this.chatApi);
    this.rooms[roomId] = room;

    return room;
  }

  /**
   * Release the Room object if it exists. This method only releases the reference
   * to the Room object from the Rooms instance. It does not unsubscribe to any
   * events, leave the chat room or perform any other cleanup task. Those should
   * be done before calling release().
   * 
   * @param roomId 
   */
  async release(roomId: string) {
    const room = this.rooms[roomId];
    if (!room) {
      return;
    }
    delete this.rooms[roomId];
  }
}
