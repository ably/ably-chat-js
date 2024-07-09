import { Reaction } from '@ably/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom';
export const useReactions = () => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const { clientId, room } = useRoom();

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
    clientId,
  };
};
