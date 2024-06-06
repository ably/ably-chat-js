import { createContext } from 'react';
import { ChatClient, Room } from '@ably-labs/chat';

interface ChatContextProps {
  client: ChatClient;
  room: Room;
}

export const RoomContext = createContext<ChatContextProps | undefined>(undefined);
