import { Message, MessageEvents, type MessageListener } from '@ably-labs/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom';

// todo: uncomment. used for history query when we add it back
// const combineMessages = (previousMessages: Message[], lastMessages: Message[]) => {
//   return [...previousMessages.filter((msg) => lastMessages.every(({ id }) => id !== msg.id)), ...lastMessages];
// };

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { clientId, room } = useRoom();

  const sendMessage = useCallback(
    (text: string) => {
      room.messages.send(text);
    },
    [room],
  );

  useEffect(() => {
    setLoading(false); // todo: set to true here when we add back history query (see commented initMessages below)

    const handleAdd: MessageListener = ({ message }) => {
      setMessages((prevMessage) => [...prevMessage, message]);
    };
    room.messages.subscribe(MessageEvents.created, handleAdd);

    setMessages([]);

    // let mounted = true;
    // const initMessages = async () => {
    //   const lastMessages = await room.messages.query({ limit: 100 });
    //   if (mounted) {
    //     // setLoading(false);
    //     setMessages((prevMessages) => combineMessages(prevMessages, lastMessages).reverse());
    //   }
    // };
    // initMessages();


    return () => {
      // mounted = false;
      room.messages.unsubscribe(MessageEvents.created, handleAdd);
    };
  }, [clientId, room]);

  return {
    loading,
    messages,
    sendMessage,
    clientId,
  };
};
