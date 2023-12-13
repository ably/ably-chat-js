import { Message, MessageEvents, type MessageListener } from '@ably-labs/chat';
import { useCallback, useContext, useEffect, useState } from 'react';
import { ConversationContext } from '../containers/ConversationContext';

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const context = useContext(ConversationContext);

  const sendMessage = useCallback(
    (text: string) => {
      if (!context?.conversation) throw Error('Client is not setup!');
      context.conversation.messages.send(text);
    },
    [context?.conversation],
  );

  useEffect(() => {
    if (!context) throw Error('Client is not setup!');

    const handler: MessageListener = ({ message }) => {
      setMessages((prevMessage) => [...prevMessage, message]);
    };
    context.conversation.messages.subscribe(MessageEvents.created, handler);

    let mounted = true;
    const initMessages = async () => {
      const lastMessages = await context.conversation.messages.query({ limit: 10 });
      if (mounted) setMessages((prevMessages) => [...lastMessages, ...prevMessages]);
    };
    setMessages([]);
    initMessages();

    return () => {
      mounted = false;
      context.conversation.messages.unsubscribe(MessageEvents.created, handler);
    };
  }, [context]);

  if (!context) throw Error('Client is not setup!');

  return {
    messages,
    clientId: context.client.clientId,
    sendMessage,
  };
};
