import { Room } from '@ably/chat';
import { createContext } from 'react';

/**
 * Data type for {@link RoomContext}.
 */
export interface RoomContextType {
  /** The room in this context. */
  room: Room;
}

/**
 * RoomContext is used to keep a chat room in a React context. Use
 * {@link RoomProvider} to set a room in this context and {@link useRoom} to
 * use the room form the context.
 */
export const RoomContext = createContext<RoomContextType | undefined>(undefined);
