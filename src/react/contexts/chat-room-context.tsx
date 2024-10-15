import { Room, RoomOptions } from '@ably/chat';
import { createContext } from 'react';

/**
 * Data type for {@link ChatRoomContext}.
 */
export interface ChatRoomContextType {
  /** The room in this context. */
  room: Promise<Room>;

  roomId: string;

  options: RoomOptions;
}

/**
 * {@link ChatRoomContext} is used to keep a chat room in a React context. Use
 * {@link ChatRoomProvider} to set a room in this context and {@link useRoom} to
 * use the room from the context.
 */
export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
