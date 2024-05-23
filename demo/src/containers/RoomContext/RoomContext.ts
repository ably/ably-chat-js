import { createContext } from 'react';
import { Chat, Room } from '@ably-labs/chat';

interface ChatContextProps {
  client: Chat;
  room: Room;
}

export const RoomContext = createContext<ChatContextProps | undefined>(undefined);
