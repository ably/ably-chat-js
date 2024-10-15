import { useContext } from 'react';

import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';

export const useRoomContext = (callingHook: string): ChatRoomContextType => {
  const context = useContext(ChatRoomContext);
  if (!context) {
    throw new Error(`\`${callingHook}\`(); must be used within a <ChatRoomProvider>`);
  }

  return context;
};
