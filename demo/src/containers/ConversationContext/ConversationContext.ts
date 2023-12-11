import { createContext } from 'react';
import { Chat, ConversationController } from '@ably-labs/chat';

interface ConversationContextProps {
  client: Chat;
  conversation: ConversationController;
}

export const ConversationContext = createContext<ConversationContextProps | undefined>(undefined);
