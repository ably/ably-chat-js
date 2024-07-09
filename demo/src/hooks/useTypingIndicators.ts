import { TypingListener } from '@ably/chat';
import { useCallback, useState } from 'react';
import { useRoom } from './useRoom';

export const useTypingIndicators = () => {
  const { room } = useRoom();

  const startTyping = useCallback(() => {
    room.typing.start().then(() => {});
  }, [room]);

  const stopTyping = useCallback(() => {
    room.typing.stop().then(() => {});
  }, [room]);

  const [unsubscribe, setUnsubscribe] = useState({ unsubscribe: () => {} });

  const subscribeToTypingIndicators = useCallback(
    (callback: TypingListener) => {
      setUnsubscribe(room.typing.subscribe(callback));
    },
    [room],
  );

  const unsubscribeToTypingIndicators = useCallback(() => {
    unsubscribe.unsubscribe();
  }, [unsubscribe]);

  return {
    startTyping,
    stopTyping,
    subscribeToTypingIndicators,
    unsubscribeToTypingIndicators,
  };
};
