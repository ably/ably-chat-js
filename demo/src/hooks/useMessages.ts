import { Message, type MessageListener } from '@ably/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom';

// Utility function to merge existing messages with messages just fetched. It
// ensures that we don't have duplicates in the final list of messages.
const combineMessages = (previousMessages: Message[], fetchedMessages: Message[]) => {
  return [
    ...previousMessages.filter((msg) => fetchedMessages.every(({ timeserial }) => timeserial !== msg.timeserial)),
    ...fetchedMessages,
  ];
};

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { clientId, room } = useRoom();

  const sendMessage = useCallback(
    (text: string) => {
      room.messages.send({ text });
    },
    [room],
  );

  useEffect(() => {
    setLoading(true);

    const handleAdd: MessageListener = ({ message }) => {
      setMessages((prevMessage) => [...prevMessage, message]);
    };
    const { unsubscribe, getPreviousMessages } = room.messages.subscribe(handleAdd);

    const initMessages = async () => {
      const fetchedMessages = await getPreviousMessages({ limit: 100 });
      setMessages((prevMessages) => combineMessages(prevMessages, fetchedMessages.items).reverse());
      setLoading(false);
    };
    initMessages();

    return () => {
      unsubscribe();
    };
  }, [clientId, room]);

  return {
    loading,
    messages,
    sendMessage,
    clientId,
  };
};
