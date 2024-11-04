import { Room, RoomOptions } from '@ably/chat';
import { createContext } from 'react';

/**
 * Data type for {@link ChatRoomContext}.
 */
export interface ChatRoomContextType {
  /**
   * Promise that resolves to the chat room.
   */
  room: Promise<Room>;

  /**
   * The ID of the room that promise will resolve to.
   */
  roomId: string;

  /**
   * Options used to create the room.
   */
  options: RoomOptions;
}

/**
 * {@link ChatRoomContext} is used to keep a chat room in a React context. Use
 * {@link ChatRoomProvider} to set a room in this context and {@link useRoom} to
 * use the room from the context.
 */
export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
