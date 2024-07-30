import { useCallback, useEffect, useState } from 'react';
import { useChatClient, useRoom } from '@ably/chat/react';

/**
 * Hook that provides typing indicators functionality.
 *
 * @returns an object containing:
 * - startTyping: function to start typing indicators
 * - stopTyping: function to stop typing indicators
 * - typers: set of typers excluding the current user
 */
export const useTypingIndicators = () => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const { room } = useRoom();

  const [typers, setTypers] = useState<Set<string>>(new Set<string>());

  const startTyping = useCallback(() => {
    void room.typing.start();
  }, [room]);

  const stopTyping = useCallback(() => {
    void room.typing.stop();
  }, [room]);

  useEffect(() => {
    // fetch current typers when the component mounts
    room.typing.get().then((typers) => {
      typers.delete(clientId); // remove the current user from the list of typers
      setTypers(typers);
    });

    // subscribe to typing indicators
    const subscription = room.typing.subscribe((event) => {
      event.currentlyTyping.delete(clientId); // remove the current user from the list of typers
      setTypers(event.currentlyTyping);
    });

    return () => {
      // cleanup: remove subscription
      subscription.unsubscribe();
    };
  }, [clientId, room]);

  return {
    startTyping,
    stopTyping,
    typers,
  };
};
