import { createContext } from 'react';
import { Chat, RoomController } from '@ably-labs/chat';

interface ChatContextProps {
  client: Chat;
  room: RoomController;
}

export const RoomContext = createContext<ChatContextProps | undefined>(undefined);
