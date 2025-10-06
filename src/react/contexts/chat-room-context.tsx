import { createContext } from 'react';

import { ChatClient } from '../../core/chat-client.js';
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
 * React Context for sharing chat room instances across component trees.
 *
 * **Note**: This context should not be used directly.
 * Use {@link ChatRoomProvider} to provide room context and room-specific hooks to consume it.
 */
export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
