import { Message, MessageEvents, type MessageListener } from '@ably-labs/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom';

const combineMessages = (previousMessages: Message[], lastMessages: Message[]) => {
  return [...previousMessages.filter((msg) => lastMessages.every(({ id }) => id !== msg.id)), ...lastMessages];
};

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

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      room.messages.edit(messageId, text);
    },
    [room],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      room.messages.delete(messageId);
    },
    [room],
  );

  const addReaction = useCallback(
    (messageId: string, type: string) => {
      room.messages.addReaction(messageId, type);
    },
    [room],
  );

  const removeReaction = useCallback(
    (messageId: string, reactionId: string) => {
      room.messages.removeReaction(messageId, reactionId);
    },
    [room],
  );

  useEffect(() => {
    setLoading(true);
    const handleAdd: MessageListener = ({ message }) => {
      setMessages((prevMessage) => [...prevMessage, message]);
    };
    const handleUpdate: MessageListener = ({ message: updated }) => {
      setMessages((prevMessage) => prevMessage.map((message) => (message.id !== updated.id ? message : updated)));
    };
    const handleDelete: MessageListener = ({ message }) => {
      setMessages((prevMessage) => prevMessage.filter(({ id }) => id !== message.id));
    };

    room.messages.subscribe(MessageEvents.created, handleAdd);
    room.messages.subscribe(MessageEvents.edited, handleUpdate);
    room.messages.subscribe(MessageEvents.deleted, handleDelete);

    let mounted = true;
    const initMessages = async () => {
      const lastMessages = await room.messages.query({ limit: 100 });
      if (mounted) {
        setLoading(false);
        setMessages((prevMessages) => combineMessages(prevMessages, lastMessages).reverse());
      }
    };
    setMessages([]);
    initMessages();

    return () => {
      mounted = false;
      room.messages.unsubscribe(MessageEvents.created, handleAdd);
      room.messages.unsubscribe(MessageEvents.edited, handleUpdate);
      room.messages.unsubscribe(MessageEvents.deleted, handleDelete);
    };
  }, [clientId, room]);

  return {
    loading,
    messages,
    editMessage,
    sendMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    clientId,
  };
};
