import { TypingListener } from '@ably-labs/chat';
import { useCallback } from 'react';
import { useRoom } from './useRoom';

export const useTypingIndicators = () => {
  const { room } = useRoom();

  const startTyping = useCallback(() => {
    room.typing.start().then(() => {});
  }, [room]);

  const stopTyping = useCallback(() => {
    room.typing.stop().then(() => {});
  }, [room]);

  const subscribeToTypingIndicators = useCallback(
    (callback: TypingListener) => {
      room.typing.subscribe(callback).then(() => {});
    },
    [room],
  );

  const unsubscribeToTypingIndicators = useCallback(
    (callback: TypingListener) => {
      room.typing.unsubscribe(callback).then(() => {});
    },
    [room],
  );

  return {
    startTyping,
    stopTyping,
    subscribeToTypingIndicators,
    unsubscribeToTypingIndicators,
  };
};
