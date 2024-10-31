import * as Ably from 'ably';
import { useContext } from 'react';

import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';

export const useRoomContext = (callingHook: string): ChatRoomContextType => {
  const context = useContext(ChatRoomContext);
  if (!context) {
    throw new Ably.ErrorInfo(`${callingHook} hook must be used within a <ChatRoomProvider>`, 40000, 400);
  }

  return context;
};
