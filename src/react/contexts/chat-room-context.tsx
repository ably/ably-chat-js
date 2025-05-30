import { createContext } from 'react';

import { ChatClient } from '../../core/chat.js';
import { Room } from '../../core/room.js';
import { RoomOptions } from '../../core/room-options.js';

/**
 * Data type for {@link ChatRoomContext}.
 */
export interface ChatRoomContextType {
  /**
   * Promise that resolves to the chat room.
   */
  room: Promise<Room>;

  /**
   * The unique identifier of the room that promise will resolve to.
   */
  roomName: string;

  /**
   * Options used to create the room.
   */
  options?: RoomOptions;

  /**
   * The chat client used to create the room.
   */
  client: ChatClient;
}

/**
 * {@link ChatRoomContext} is used to keep a chat room in a React context. Use
 * {@link ChatRoomProvider} to set a room in this context and {@link useRoom} to
 * use the room from the context.
 */
export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
