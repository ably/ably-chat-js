import { createContext } from 'react';
import { ChatClient, Room } from '@ably/chat';

interface ChatContextProps {
  client: ChatClient;
  room: Room;
}

export const RoomContext = createContext<ChatContextProps | undefined>(undefined);
