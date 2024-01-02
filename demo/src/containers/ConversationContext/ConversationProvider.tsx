import { FC, ReactNode, useMemo } from 'react';
import { Chat } from '@ably-labs/chat';
import { ConversationContext } from './ConversationContext';

interface ConversationProviderProps {
  client: Chat;
  conversationId: string;
  children: ReactNode;
}
export const ConversationProvider: FC<ConversationProviderProps> = ({ client, conversationId, children }) => {
  const value = useMemo(
    () => ({
      client,
      conversation: client.conversations.get(conversationId),
    }),
    [client, conversationId],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
};
