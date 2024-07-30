import { Reaction } from '@ably/chat';
import { useCallback, useEffect, useState } from 'react';
import { useChatClient, useRoom } from '@ably/chat/react';

/**
 * Hook that provides access to the reactions in the room.
 */
export const useReactions = () => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const { room } = useRoom();

  const sendReaction = useCallback(
    (reaction: string) => {
      room.reactions.send({ type: reaction });
    },
    [room],
  );

  useEffect(() => {
    const reactionReceived = (reaction: Reaction) => {
      setReactions((prevReactions) => [...prevReactions, reaction]);
    };
    const { unsubscribe } = room.reactions.subscribe(reactionReceived);

    setReactions([]);

    return () => {
      unsubscribe();
    };
  }, [clientId, room]);

  return {
    reactions,
    sendReaction,
  };
};
