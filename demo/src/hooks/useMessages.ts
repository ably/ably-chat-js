import { Message, MessageEvents, type MessageListener } from '@ably-labs/chat';
import { useCallback, useEffect, useState } from 'react';
import { useConversation } from './useConversation';

const combineMessages = (previousMessages: Message[], lastMessages: Message[]) => {
  return [...previousMessages.filter((msg) => lastMessages.every(({ id }) => id !== msg.id)), ...lastMessages];
};

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { clientId, conversation } = useConversation();

  const sendMessage = useCallback(
    (text: string) => {
      conversation.messages.send(text);
    },
    [conversation],
  );

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      conversation.messages.edit(messageId, text);
    },
    [conversation],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      conversation.messages.delete(messageId);
    },
    [conversation],
  );

  const addReaction = useCallback(
    (messageId: string, type: string) => {
      conversation.messages.addReaction(messageId, type);
    },
    [conversation],
  );

  const removeReaction = useCallback(
    (messageId: string, reactionId: string) => {
      conversation.messages.removeReaction(messageId, reactionId);
    },
    [conversation],
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

    conversation.messages.subscribe(MessageEvents.created, handleAdd);
    conversation.messages.subscribe(MessageEvents.edited, handleUpdate);
    conversation.messages.subscribe(MessageEvents.deleted, handleDelete);

    let mounted = true;
    const initMessages = async () => {
      const lastMessages = await conversation.messages.query({ limit: 100 });
      if (mounted) {
        setLoading(false);
        setMessages((prevMessages) => combineMessages(prevMessages, lastMessages).reverse());
      }
    };
    setMessages([]);
    initMessages();

    return () => {
      mounted = false;
      conversation.messages.unsubscribe(MessageEvents.created, handleAdd);
      conversation.messages.unsubscribe(MessageEvents.edited, handleUpdate);
      conversation.messages.unsubscribe(MessageEvents.deleted, handleDelete);
    };
  }, [clientId, conversation]);

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
