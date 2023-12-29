import { useContext } from 'react';
import { ConversationContext } from '../containers/ConversationContext';

export const useConversation = () => {
  const context = useContext(ConversationContext);

  if (!context) throw Error('Client is not setup!');

  return {
    conversation: context.conversation,
    clientId: context.client.clientId,
  };
};
