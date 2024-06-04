import { TypingListener } from '@ably-labs/chat';
import { useCallback } from 'react';
import { useRoom } from './useRoom';

export const useTypingIndicators = () => {
  const { room } = useRoom();

  const startTyping = useCallback(
    () => {
      room.typingIndicators.startTyping().then(() => {
      });
    },
    [room]
  );

  const stopTyping = useCallback(
    () => {
      room.typingIndicators.stopTyping().then(() => {
      });
    },
    [room]
  );

  const subscribeToTypingIndicators = useCallback((callback: TypingListener) => {
    room.typingIndicators.subscribe(callback).then(() => {
    });
  }, [room]);

  const unsubscribeToTypingIndicators = useCallback((callback: TypingListener) => {
    room.typingIndicators.unsubscribe(callback).then(() => {
    });
  }, [room]);

  return {
    startTyping,
    stopTyping,
    subscribeToTypingIndicators,
    unsubscribeToTypingIndicators
  };
};
