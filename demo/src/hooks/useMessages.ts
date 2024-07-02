import { Message, type MessageListener } from '@ably-labs/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom';

// todo: uncomment. used for history query when we add it back
const combineMessages = (previousMessages: Message[], lastMessages: Message[]) => {
  return [
    ...previousMessages.filter((msg) => lastMessages.every(({ timeserial }) => timeserial !== msg.timeserial)),
    ...lastMessages,
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
    room.messages.subscribe(handleAdd);

    setMessages([]);

    const mounted = true;
    const initMessages = async () => {
      const lastMessages = await room.messages.query({ limit: 100 });
      if (mounted) {
        setMessages((prevMessages) => combineMessages(prevMessages, lastMessages.items).reverse());
        setLoading(false);
      }
    };
    initMessages();

    return () => {
      // mounted = false;
      room.messages.unsubscribe(handleAdd);
    };
  }, [clientId, room]);

  return {
    loading,
    messages,
    sendMessage,
    clientId,
  };
};
